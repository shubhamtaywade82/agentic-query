import { QueryValidationError, validateQuery, type ModelProvider, type Query, type QueryGenerationRequest } from './index.js';
import type { QueryGenerator } from './model.js';

export const QUERY_AST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'select'],
  properties: {
    source: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string', minLength: 1 } }
    },
    select: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field'],
        properties: {
          field: {
            type: 'object',
            additionalProperties: false,
            required: ['field'],
            properties: {
              entity: { type: 'string' },
              field: { type: 'string', minLength: 1 }
            }
          },
          aggregate: { enum: ['count', 'sum', 'avg', 'min', 'max'] },
          alias: { type: 'string' }
        }
      }
    },
    filters: { type: 'array' },
    groupBy: { type: 'array' },
    orderBy: { type: 'array' },
    joins: { type: 'array' },
    having: { type: 'array' },
    limit: { type: 'integer', minimum: 1, maximum: 10000 },
    offset: { type: 'integer', minimum: 0 }
  }
} as const;

export interface StructuredQueryGeneratorOptions {
  provider: ModelProvider;
  systemPrompt?: string;
}

export class QueryGenerationError extends QueryValidationError {
  readonly code = 'QUERY_GENERATION_ERROR';

  constructor(message: string, readonly candidate: unknown, readonly cause?: unknown) {
    super(message);
    this.name = 'QueryGenerationError';
  }
}

export class StructuredQueryGenerator implements QueryGenerator {
  private readonly provider: ModelProvider;
  private readonly systemPrompt: string;

  constructor(options: StructuredQueryGeneratorOptions) {
    this.provider = options.provider;
    this.systemPrompt = options.systemPrompt ?? [
      'You generate Agentic Query AST objects.',
      'Return only data conforming to the supplied schema.',
      'Never invent entities or fields not present in schemaContext.',
      'Do not return SQL, application code, or executable instructions.'
    ].join(' ');
  }

  async generate(request: QueryGenerationRequest): Promise<Query> {
    let output: unknown;
    try {
      const result = await this.provider.generateStructured<Query>({
        model: request.model,
        schema: QUERY_AST_SCHEMA as unknown as Record<string, unknown>,
        messages: [
          { role: 'system', content: this.systemPrompt },
          {
            role: 'user',
            content: [
              `Question: ${request.question}`,
              '',
              'Schema context:',
              request.schemaContext
            ].join('\n')
          }
        ]
      });
      output = result.output;
      validateQuery(result.output);
      return result.output;
    } catch (error) {
      if (error instanceof QueryGenerationError) throw error;
      throw new QueryGenerationError('Model produced an invalid query AST', output, error);
    }
  }
}
