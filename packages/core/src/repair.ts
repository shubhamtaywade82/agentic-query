import { validateQuery, type Query, type QueryPolicy, type ModelProvider } from './index.js';
import { QUERY_AST_SCHEMA } from './query-generator.js';

export interface QueryRepairOptions {
  provider: ModelProvider;
  model: string;
  maxAttempts?: number;
}

export class QueryRepairError extends Error {
  readonly code = 'QUERY_REPAIR_ERROR';

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'QueryRepairError';
  }
}

export class QueryRepairer {
  private readonly provider: ModelProvider;
  private readonly model: string;
  private readonly maxAttempts: number;

  constructor(options: QueryRepairOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.maxAttempts = Math.max(0, options.maxAttempts ?? 2);
  }

  async repair(
    question: string,
    schemaContext: string,
    candidate: unknown,
    policy: QueryPolicy = {}
  ): Promise<Query> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxAttempts; attempt += 1) {
      try {
        validateQuery(candidate as Query, policy);
        return candidate as Query;
      } catch (error) {
        lastError = error;
      }

      if (attempt === this.maxAttempts) break;

      const result = await this.provider.generateStructured<Query>({
        model: this.model,
        schema: QUERY_AST_SCHEMA as unknown as Record<string, unknown>,
        messages: [
          {
            role: 'system',
            content: 'Repair the supplied Agentic Query AST. Return only a corrected AST. Never return SQL or executable code.'
          },
          {
            role: 'user',
            content: [
              `Question: ${question}`,
              '',
              'Schema context:',
              schemaContext,
              '',
              'Candidate AST:',
              JSON.stringify(candidate),
              '',
              'Validation error:',
              String(lastError)
            ].join('\n')
          }
        ]
      });

      candidate = result.output;
    }

    throw new QueryRepairError('Unable to produce a policy-valid query after bounded repair attempts', lastError);
  }
}
