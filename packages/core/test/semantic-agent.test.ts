import { describe, expect, it } from 'vitest';
import {
  AgenticQueryAgent,
  SemanticCatalog,
  type ModelProvider,
  type QueryAdapter,
  type SchemaProvider
} from '../src/index.js';

describe('AgenticQueryAgent semantic generation', () => {
  it('resolves a semantic metric before ORM execution', async () => {
    const modelProvider: ModelProvider = {
      async generateStructured() {
        return {
          output: {
            source: { name: 'orders' },
            select: [
              { semantic: { kind: 'metric', name: 'revenue' } }
            ]
          }
        };
      }
    };

    const schemaProvider: SchemaProvider = {
      getEntity: () => undefined,
      listEntities: () => [
        {
          name: 'orders',
          table: 'orders',
          primaryKey: 'id',
          fields: [
            { name: 'amount', type: 'decimal' }
          ],
          relations: []
        }
      ]
    };

    const compiled: unknown[] = [];
    const adapter: QueryAdapter<typeof compiled[number], string> = {
      compile: (query) => {
        compiled.push(query);
        return query.select[0];
      },
      execute: async () => 'ok'
    };

    const agent = new AgenticQueryAgent({
      model: 'test-model',
      modelProvider,
      schemaProvider,
      queryAdapter: adapter,
      semanticCatalog: new SemanticCatalog({
        metrics: [
          {
            name: 'revenue',
            description: 'Completed order value',
            entity: 'orders',
            expression: { field: 'amount', aggregate: 'sum' }
          }
        ]
      }),
      policy: { allowedEntities: ['orders'] }
    });

    await expect(agent.ask('What is revenue?')).resolves.toMatchObject({ result: 'ok' });
    expect(compiled[0]).toEqual({
      source: { name: 'orders' },
      select: [
        {
          field: { entity: 'orders', field: 'amount' },
          aggregate: 'sum',
          alias: 'revenue'
        }
      ]
    });
  });
});
