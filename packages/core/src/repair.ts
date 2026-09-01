import { QueryValidationError, validateQuery, type Query, type QueryPolicyLike } from './ast.js';
import type { ModelProvider } from './model.js';
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

/** Simple exponential backoff for transient provider failures. */
function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 4000);
}

export class QueryRepairer {
  private readonly provider: ModelProvider;
  private readonly model: string;
  private readonly maxAttempts: number;
  private providerRetriesLeft: number;

  constructor(options: QueryRepairOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.maxAttempts = Math.max(0, options.maxAttempts ?? 2);
    this.providerRetriesLeft = 1;
  }

  async repair(
    question: string,
    schemaContext: string,
    candidate: unknown,
    policy: QueryPolicyLike = {}
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

      try {
        const result = await this.provider.generateStructured<Query>({
          model: this.model,
          schema: QUERY_AST_SCHEMA as unknown as Record<string, unknown>,
          messages: [
            {
              role: 'system',
              content:
                'Repair the supplied Agentic Query AST. Return only a corrected AST. Never return SQL or executable code. ' +
                'Fix exactly the reported validation problems; change nothing else.'
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
      } catch (providerError) {
        // One bounded retry on transient provider failure, then fail closed.
        if (this.providerRetriesLeft > 0 && attempt + 1 <= this.maxAttempts) {
          this.providerRetriesLeft -= 1;
          await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
          continue;
        }
        throw new QueryRepairError('Provider failed during query repair', providerError);
      }
    }

    throw new QueryRepairError(
      'Unable to produce a policy-valid query after bounded repair attempts',
      lastError instanceof Error ? lastError : lastError === undefined ? undefined : new QueryValidationError(String(lastError))
    );
  }
}
