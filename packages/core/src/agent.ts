import { QueryRepairer } from './repair.js';
import { validateQuery, type Query, type SchemaProvider, type QueryAdapter, type ModelProvider, type QueryPolicy } from './index.js';
import { StructuredQueryGenerator, QueryGenerationError } from './query-generator.js';
import { SemanticQueryGenerator } from './semantic-generator.js';
import { formatSchemaContext, SimpleSchemaRetriever, type SchemaRetriever } from './schema-retriever.js';
import type { SemanticCatalog } from './semantic.js';
import { CollectingQueryObserver, NoopQueryObserver, type QueryObserver } from './observability.js';

export interface AgentPolicy extends QueryPolicy {}

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
}

export interface AgentResult<Result> {
  query: Query;
  result: Result;
  schemaContext: string;
  repairAttempts: number;
}

export class AgenticQueryAgent<CompiledQuery = unknown, Result = unknown> {
  private readonly generator: StructuredQueryGenerator;
  private readonly semanticGenerator?: SemanticQueryGenerator;
  private readonly schemaRetriever: SchemaRetriever;
  private readonly repairer: QueryRepairer;
  private readonly maxRepairAttempts: number;
  private readonly observer: QueryObserver;

  constructor(private readonly options: AgentOptions<CompiledQuery, Result>) {
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
    this.schemaRetriever = options.schemaRetriever ?? new SimpleSchemaRetriever({
      provider: options.schemaProvider
    });
    this.maxRepairAttempts = Math.max(0, options.maxRepairAttempts ?? 2);
    this.repairer = new QueryRepairer({
      provider: options.modelProvider,
      model: options.model,
      maxAttempts: this.maxRepairAttempts
    });
    this.observer = options.observer ?? new NoopQueryObserver();
  }

  async ask(question: string): Promise<AgentResult<Result>> {
    const startedAt = performance.now();
    const entities = this.schemaRetriever.retrieve(question);
    const schemaContext = formatSchemaContext(entities);
    const policy = this.options.policy ?? {};

    let query: Query;
    let repairAttempts = 0;

    try {
      if (this.semanticGenerator && this.options.semanticCatalog) {
        query = await this.semanticGenerator.generate({
          question,
          model: this.options.model,
          schemaContext,
          semanticContext: this.options.semanticCatalog.toPromptContext()
        });
      } else {
        query = await this.generator.generate({
          question,
          model: this.options.model,
          schemaContext
        });
      }
      this.observer.onEvent({ name: 'query.generated', at: Date.now() });
      validateQuery(query, policy);
      this.observer.onEvent({ name: 'query.validated', at: Date.now() });
    } catch (error) {
      const candidate = error instanceof QueryGenerationError ? error.candidate : {};
      query = await this.repairer.repair(question, schemaContext, candidate, policy);
      repairAttempts = this.maxRepairAttempts;
      this.observer.onEvent({ name: 'query.repaired', at: Date.now(), attributes: { attempts: repairAttempts } });
      validateQuery(query, policy);
      this.observer.onEvent({ name: 'query.validated', at: Date.now() });
    }

    const compileStartedAt = performance.now();
    const compiled = this.options.queryAdapter.compile(query, policy);
    this.observer.onEvent({
      name: 'query.compiled',
      at: Date.now(),
      durationMs: Number((performance.now() - compileStartedAt).toFixed(3))
    });

    try {
      const result = await this.options.queryAdapter.execute(compiled);
      this.observer.onEvent({
        name: 'query.executed',
        at: Date.now(),
        durationMs: Number((performance.now() - startedAt).toFixed(3))
      });
      return { query, result, schemaContext, repairAttempts };
    } catch (error) {
      this.observer.onEvent({
        name: 'query.failed',
        at: Date.now(),
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
        attributes: { error: error instanceof Error ? error.name : 'unknown' }
      });
      throw error;
    }
  }
}

export { CollectingQueryObserver };
