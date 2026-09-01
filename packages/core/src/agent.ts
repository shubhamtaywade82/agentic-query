/**
 * Agent orchestration.
 *
 * ask() pipeline (plan §1):
 *   retrieve -> format schema context -> generate (semantic or physical)
 *   -> deterministic validation -> bounded repair -> adapter compile
 *   -> adapter execution -> optional synthesis.
 *
 * The LLM never receives credentials and never executes code; policy is
 * enforced by trusted code immediately before compilation.
 */
import { QueryRepairer } from './repair.js';
import { validateQuery, type Query } from './ast.js';
import type { QueryAdapter, SchemaProvider } from './adapter.js';
import type { ModelProvider } from './model.js';
import { StructuredQueryGenerator, QueryGenerationError } from './query-generator.js';
import { SemanticQueryGenerator } from './semantic-generator.js';
import { formatSchemaContext, SimpleSchemaRetriever, type SchemaRetriever, type SchemaRetrievalRequest } from './schema-retriever.js';
import type { SemanticCatalog } from './semantic.js';
import { resolveSemanticQueryDetailed, type SemanticResolution } from './semantic-query.js';
import { applyComputations } from './plan-executor.js';
import { CollectingQueryObserver, NoopQueryObserver, elapsedMs, withMetadata, type EventMetadata, type QueryEvent, type QueryObserver } from './observability.js';
import { AnswerSynthesizer, type AnswerSynthesisResult } from './synthesis.js';
import { normalizeRowsResult, capQueryResult, type NormalizationOptions, type QueryResult } from './result.js';
import type { QueryPolicy } from './policy.js';
import { nextRequestId } from './model.js';

export type AgentPolicy = QueryPolicy;

export interface AgentOptions<CompiledQuery = unknown, Result = unknown> {
  model: string;
  modelProvider: ModelProvider;
  schemaProvider: SchemaProvider;
  queryAdapter: QueryAdapter<CompiledQuery, Result>;
  policy?: AgentPolicy;
  systemPrompt?: string;
  schemaRetriever?: SchemaRetriever;
  semanticCatalog?: SemanticCatalog;
  maxRepairAttempts?: number;
  observer?: QueryObserver;
  /** Tenant identifier used for retrieval scoping and telemetry. */
  tenantId?: string;
  /** Enables optional answer synthesis (separate from execution). */
  synthesis?: { provider?: ModelProvider; model?: string; systemPrompt?: string };
  /** Result normalization options; adapters may pre-normalize instead. */
  normalization?: NormalizationOptions;
  /** Max rows materialized post-execution. */
  maxRows?: number;
}

export interface AgentResult<Result = unknown> {
  query: Query;
  result: Result;
  /** Normalized result when normalization applies. */
  normalized?: QueryResult;
  schemaContext: string;
  repairAttempts: number;
  requestId: string;
  answer?: AnswerSynthesisResult;
}

export interface AgentAskOptions {
  /** Tenant scope for retrieval and telemetry. */
  tenant?: string;
  /** Pre-generated query bypassing the model (shadow mode, plan §18 stage 1). */
  query?: Query;
  /** Disable answer synthesis for this call even when configured. */
  skipSynthesis?: boolean;
}

export class AgenticQueryAgent<CompiledQuery = unknown, Result = unknown> {
  private readonly generator: StructuredQueryGenerator;
  private readonly semanticGenerator?: SemanticQueryGenerator;
  private readonly schemaRetriever: SchemaRetriever;
  private readonly repairer: QueryRepairer;
  private readonly maxRepairAttempts: number;
  private readonly observer: QueryObserver;
  private readonly synthesizer?: AnswerSynthesizer;
  private readonly options: AgentOptions<CompiledQuery, Result>;

  constructor(options: AgentOptions<CompiledQuery, Result>) {
    this.options = options;
    this.generator = new StructuredQueryGenerator({
      provider: options.modelProvider,
      ...(options.systemPrompt !== undefined ? { systemPrompt: options.systemPrompt } : {})
    });
    if (options.semanticCatalog) {
      this.semanticGenerator = new SemanticQueryGenerator({
        provider: options.modelProvider,
        catalog: options.semanticCatalog,
        ...(options.systemPrompt !== undefined ? { systemPrompt: options.systemPrompt } : {})
      });
    }
    this.schemaRetriever =
      options.schemaRetriever ??
      new SimpleSchemaRetriever({
        provider: options.schemaProvider
      });
    this.maxRepairAttempts = Math.max(0, options.maxRepairAttempts ?? 2);
    this.repairer = new QueryRepairer({
      provider: options.modelProvider,
      model: options.model,
      maxAttempts: this.maxRepairAttempts
    });
    this.observer = options.observer ?? new NoopQueryObserver();
    if (options.synthesis) {
      this.synthesizer = new AnswerSynthesizer({
        provider: options.synthesis.provider ?? options.modelProvider,
        model: options.synthesis.model ?? options.model,
        ...(options.synthesis.systemPrompt !== undefined ? { systemPrompt: options.synthesis.systemPrompt } : {})
      });
    }
  }

  async ask(question: string, askOptions: AgentAskOptions = {}): Promise<AgentResult<Result>> {
    const startedAt = performance.now();
    const requestId = nextRequestId('agent');
    const metadata: EventMetadata = {
      requestId,
      ...(askOptions.tenant !== undefined || this.options.tenantId !== undefined
        ? { tenantId: askOptions.tenant ?? this.options.tenantId }
        : {}),
      model: this.options.model
    };
    const emit = (event: QueryEvent): void => this.observer.onEvent(withMetadata(event, metadata));
    const policy = this.options.policy ?? {};

    emit({ name: 'agent.started', at: Date.now(), attributes: { question: question.slice(0, 200) } });

    const retrievalRequest: SchemaRetrievalRequest = {
      question,
      ...(askOptions.tenant !== undefined ? { tenant: askOptions.tenant } : {}),
      policy
    };
    const entities = this.schemaRetriever.retrieve(retrievalRequest);
    const schemaContext = formatSchemaContext(entities);
    emit({
      name: 'schema.retrieved',
      at: Date.now(),
      attributes: { entityCount: entities.length, tokensEstimated: Math.ceil(schemaContext.length / 4) }
    });

    let query: Query;
    let semanticResolution: SemanticResolution | undefined;
    let repairAttempts = 0;

    const generationStartedAt = performance.now();
    try {
      if (askOptions.query !== undefined) {
        query = askOptions.query;
      } else if (this.semanticGenerator && this.options.semanticCatalog) {
        const semanticQuery = await this.semanticGenerator.generate({
          question,
          model: this.options.model,
          schemaContext,
          semanticContext: this.options.semanticCatalog.toPromptContext()
        });
        query = semanticQuery;
      } else {
        query = await this.generator.generate({
          question,
          model: this.options.model,
          schemaContext
        });
      }
      emit({ name: 'query.generated', at: Date.now(), durationMs: elapsedMs(generationStartedAt) });
      validateQuery(query, policy);
      emit({ name: 'query.validated', at: Date.now() });
    } catch (error) {
      if (askOptions.query !== undefined) throw error;
      emit({
        name: 'query.validation_failed',
        at: Date.now(),
        attributes: { error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' }
      });

      const candidate = error instanceof QueryGenerationError ? error.candidate : {};
      try {
        query = await this.repairer.repair(question, schemaContext, candidate, policy);
      } catch (repairError) {
        emit({
          name: 'query.failed',
          at: Date.now(),
          durationMs: elapsedMs(startedAt),
          attributes: { error: repairError instanceof Error ? repairError.name : 'unknown', stage: 'repair' }
        });
        throw repairError;
      }
      repairAttempts = this.maxRepairAttempts;
      emit({ name: 'query.repaired', at: Date.now(), attributes: { attempts: repairAttempts } });
      validateQuery(query, policy);
      emit({ name: 'query.validated', at: Date.now() });
    }

    // Trusted semantic resolution: expand metrics into physical fields.
    if (this.options.semanticCatalog) {
      const resolution = resolveSemanticQueryDetailed(query, this.options.semanticCatalog);
      query = resolution.query;
      semanticResolution = resolution;
      validateQuery(query, policy);
    }

    const compileStartedAt = performance.now();
    const compiled = this.options.queryAdapter.compile(query, policy);
    emit({ name: 'query.compiled', at: Date.now(), durationMs: elapsedMs(compileStartedAt) });

    try {
      const executeStartedAt = performance.now();
      const result = await this.options.queryAdapter.execute(compiled);
      const databaseDurationMs = elapsedMs(executeStartedAt);
      emit({
        name: 'query.executed',
        at: Date.now(),
        durationMs: databaseDurationMs,
        attributes: {}
      });

      // Deterministic normalization when the adapter did not already normalize.
      let normalized: QueryResult | undefined;
      if (this.isRecordArray(result)) {
        let normalizedResult = normalizeRowsResult(result, {
          queryId: requestId,
          source: 'adapter',
          durationMs: databaseDurationMs,
          repairAttempts
        }, this.options.normalization);
        if (semanticResolution && semanticResolution.computations.length > 0) {
          normalizedResult = applyComputations(normalizedResult, semanticResolution.computations);
        }
        const maxRows = this.options.maxRows ?? policy.maxRows;
        if (maxRows !== undefined) {
          normalizedResult = capQueryResult(normalizedResult, maxRows);
        }
        normalized = normalizedResult;
      }

      let answer: AnswerSynthesisResult | undefined;
      if (this.synthesizer && !askOptions.skipSynthesis && normalized !== undefined) {
        const answerStartedAt = performance.now();
        answer = await this.synthesizer.synthesize({ question, result: normalized, trace: { requestId } });
        emit({
          name: 'answer.generated',
          at: Date.now(),
          durationMs: elapsedMs(answerStartedAt),
          attributes: { model: answer.model }
        });
      }

      emit({
        name: 'agent.completed',
        at: Date.now(),
        durationMs: elapsedMs(startedAt),
        attributes: { rowCount: normalized?.rowCount ?? 0, repairAttempts }
      });

      return {
        query,
        result,
        ...(normalized !== undefined ? { normalized } : {}),
        schemaContext,
        repairAttempts,
        requestId,
        ...(answer !== undefined ? { answer } : {})
      };
    } catch (error) {
      emit({
        name: 'query.failed',
        at: Date.now(),
        durationMs: elapsedMs(startedAt),
        attributes: { error: error instanceof Error ? error.name : 'unknown', stage: 'execute' }
      });
      throw error;
    }
  }

  private isRecordArray(value: unknown): value is Record<string, unknown>[] {
    return (
      Array.isArray(value) &&
      (value.length === 0 || (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])))
    );
  }
}

export { CollectingQueryObserver };
