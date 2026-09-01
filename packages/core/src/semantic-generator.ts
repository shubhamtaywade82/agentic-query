import { resolveSemanticQuery } from './semantic-query.js';
import type { ModelProvider, Query, SemanticQuery } from './index.js';
import type { SemanticCatalog } from './semantic.js';

export interface SemanticQueryGenerationRequest {
  question: string;
  schemaContext: string;
  semanticContext: string;
  model: string;
}

export interface SemanticQueryGeneratorOptions {
  provider: ModelProvider;
  catalog: SemanticCatalog;
  systemPrompt?: string;
}

export const SEMANTIC_QUERY_SCHEMA = {
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
          semantic: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'name'],
            properties: {
              kind: { enum: ['metric', 'dimension'] },
              name: { type: 'string', minLength: 1 }
            }
          },
          aggregate: { enum: ['count', 'sum', 'avg', 'min', 'max'] },
          alias: { type: 'string' }
        },
        anyOf: [
          { required: ['field'] },
          { required: ['semantic'] }
        ]
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

export class SemanticQueryGenerator {
  private readonly provider: ModelProvider;
  private readonly catalog: SemanticCatalog;
  private readonly systemPrompt: string;

  constructor(options: SemanticQueryGeneratorOptions) {
    this.provider = options.provider;
    this.catalog = options.catalog;
    this.systemPrompt = options.systemPrompt ?? [
      'Generate an Agentic Query semantic AST.',
      'Use semantic metric or dimension names when they match the business question.',
      'Use only semantic names present in semanticContext.',
      'Use only entities and fields present in schemaContext.',
      'Return data only; never return SQL or executable code.'
    ].join(' ');
  }

  async generate(request: SemanticQueryGenerationRequest): Promise<Query> {
    const result = await this.provider.generateStructured<SemanticQuery>({
      model: request.model,
      schema: SEMANTIC_QUERY_SCHEMA as unknown as Record<string, unknown>,
      messages: [
        { role: 'system', content: this.systemPrompt },
        {
          role: 'user',
          content: [
            `Question: ${request.question}`,
            '',
            'Schema context:',
            request.schemaContext,
            '',
            'Semantic context:',
            request.semanticContext
          ].join('\n')
        }
      ]
    });

    return resolveSemanticQuery(result.output, this.catalog);
  }
}
