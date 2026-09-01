import { QueryRepairer } from './repair.js';
import { validateQuery, type Query, type SchemaProvider, type QueryAdapter, type ModelProvider, type QueryPolicy } from './index.js';
import { StructuredQueryGenerator, QueryGenerationError } from './query-generator.js';
import { formatSchemaContext, SimpleSchemaRetriever, type SchemaRetriever } from './schema-retriever.js';

export interface AgentPolicy extends QueryPolicy {}

export interface AgentOptions<CompiledQuery = unknown, Result = unknown> {
  model: string;
  modelProvider: ModelProvider;
  schemaProvider: SchemaProvider;
  queryAdapter: QueryAdapter<CompiledQuery, Result>;
  policy?: AgentPolicy;
  systemPrompt?: string;
  schemaRetriever?: SchemaRetriever;
  maxRepairAttempts?: number;
}

export interface AgentResult<Result> {
  query: Query;
  result: Result;
  schemaContext: string;
  repairAttempts: number;
}

export class AgenticQueryAgent<CompiledQuery = unknown, Result = unknown> {
  private readonly generator: StructuredQueryGenerator;
  private readonly schemaRetriever: SchemaRetriever;
  private readonly repairer: QueryRepairer;
  private readonly maxRepairAttempts: number;

  constructor(private readonly options: AgentOptions<CompiledQuery, Result>) {
    this.generator = new StructuredQueryGenerator({
      provider: options.modelProvider,
      systemPrompt: options.systemPrompt
    });
    this.schemaRetriever = options.schemaRetriever ?? new SimpleSchemaRetriever({
      provider: options.schemaProvider
    });
    this.maxRepairAttempts = Math.max(0, options.maxRepairAttempts ?? 2);
    this.repairer = new QueryRepairer({
      provider: options.modelProvider,
      model: options.model,
      maxAttempts: this.maxRepairAttempts
    });
  }

  async ask(question: string): Promise<AgentResult<Result>> {
    const entities = this.schemaRetriever.retrieve(question);
    const schemaContext = formatSchemaContext(entities);
    const policy = this.options.policy ?? {};

    let query: Query;
    let repairAttempts = 0;

    try {
      query = await this.generator.generate({
        question,
        model: this.options.model,
        schemaContext
      });
      validateQuery(query, policy);
    } catch (error) {
      const candidate = error instanceof QueryGenerationError ? error.candidate : {};
      query = await this.repairer.repair(question, schemaContext, candidate, policy);
      repairAttempts = this.maxRepairAttempts;
    }

    const compiled = this.options.queryAdapter.compile(query);
    const result = await this.options.queryAdapter.execute(compiled);

    return { query, result, schemaContext, repairAttempts };
  }
}
