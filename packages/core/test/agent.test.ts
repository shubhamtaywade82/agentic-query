import { describe, expect, it } from 'vitest';
import {
  AgenticQueryAgent,
  type ModelProvider,
  type QueryAdapter,
  type SchemaProvider
} from '../src/index.js';

describe('AgenticQueryAgent', () => {
  it('generates, validates, compiles, and executes a query', async () => {
    const modelProvider: ModelProvider = {
      async generateStructured() {
        return {
          output: {
            source: { name: 'orders' },
            select: [{ field: { entity: 'orders', field: 'id' } }],
            limit: 10
          }
        };
      }
    };

    const schemaProvider: SchemaProvider = {
      getEntity: (name) => name === 'orders'
        ? { name: 'orders', table: 'orders', primaryKey: 'id', fields: [{ name: 'id', type: 'integer' }], relations: [] }
        : undefined,
      listEntities: () => [
        { name: 'orders', table: 'orders', primaryKey: 'id', fields: [{ name: 'id', type: 'integer' }], relations: [] }
      ]
    };

    const adapter: QueryAdapter<string, string[]> = {
      compile: () => 'compiled-query',
      execute: async (compiled) => [compiled]
    };

    const agent = new AgenticQueryAgent({
      model: 'test-model',
      modelProvider,
      schemaProvider,
      queryAdapter: adapter,
      policy: { allowedEntities: ['orders'], maxRows: 100 }
    });

    await expect(agent.ask('List recent orders')).resolves.toEqual({
      query: {
        source: { name: 'orders' },
        select: [{ field: { entity: 'orders', field: 'id' } }],
        limit: 10
      },
      result: ['compiled-query']
    });
  });
});
