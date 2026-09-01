import { validateQuery, type Query, type SchemaProvider, type QueryAdapter, type ModelProvider } from './index.js';
import { StructuredQueryGenerator } from './query-generator.js';
import { formatSchemaContext, SimpleSchemaRetriever, type SchemaRetriever } from './schema-retriever.js';

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
  schemaRetriever?: SchemaRetriever;
}

export interface AgentResult<Result> {
  query: Query;
  result: Result;
  schemaContext: string;
}

export class AgenticQueryAgent<CompiledQuery = unknown, Result = unknown> {
  private readonly generator: StructuredQueryGenerator;
  private readonly schemaRetriever: SchemaRetriever;

  constructor(private readonly options: AgentOptions<CompiledQuery, Result>) {
    this.generator = new StructuredQueryGenerator({
      provider: options.modelProvider,
      systemPrompt: options.systemPrompt
    });
    this.schemaRetriever = options.schemaRetriever ?? new SimpleSchemaRetriever({
      provider: options.schemaProvider
    });
  }

  async ask(question: string): Promise<AgentResult<Result>> {
    const entities = this.schemaRetriever.retrieve(question);
    const schemaContext = formatSchemaContext(entities);
    const query = await this.generator.generate({
      question,
      model: this.options.model,
      schemaContext
    });

    validateQuery(query, this.options.policy);

    const compiled = this.options.queryAdapter.compile(query);
    const result = await this.options.queryAdapter.execute(compiled);

    return { query, result, schemaContext };
  }
}
