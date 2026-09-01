import { validateQuery, type Query, type SchemaProvider, type QueryAdapter, type ModelProvider } from './index.js';
import { StructuredQueryGenerator } from './query-generator.js';

export interface AgentPolicy {
  allowedEntities?: readonly string[];
  deniedFields?: Readonly<Record<string, readonly string[]>>;
  maxRows?: number;
}

export interface AgentOptions<CompiledQuery = unknown, Result = unknown> {
  model: string;
  modelProvider: ModelProvider;
  schemaProvider: SchemaProvider;
  queryAdapter: QueryAdapter<CompiledQuery, Result>;
  policy?: AgentPolicy;
  systemPrompt?: string;
}

export interface AgentResult<Result> {
  query: Query;
  result: Result;
}

export class AgenticQueryAgent<CompiledQuery = unknown, Result = unknown> {
  private readonly generator: StructuredQueryGenerator;

  constructor(private readonly options: AgentOptions<CompiledQuery, Result>) {
    this.generator = new StructuredQueryGenerator({
      provider: options.modelProvider,
      systemPrompt: options.systemPrompt
    });
  }

  async ask(question: string): Promise<AgentResult<Result>> {
    const schemaContext = this.buildSchemaContext();
    const query = await this.generator.generate({
      question,
      model: this.options.model,
      schemaContext
    });

    validateQuery(query, this.options.policy);

    const compiled = this.options.queryAdapter.compile(query);
    const result = await this.options.queryAdapter.execute(compiled);

    return { query, result };
  }

  private buildSchemaContext(): string {
    return JSON.stringify(this.options.schemaProvider.listEntities());
  }
}
