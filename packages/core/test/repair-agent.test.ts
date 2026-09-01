import { describe, expect, it } from 'vitest';
import {
  AgenticQueryAgent,
  type ModelProvider,
  type QueryAdapter,
  type SchemaProvider
} from '../src/index.js';

const schemaProvider: SchemaProvider = {
  getEntity: (name) => name === 'orders'
    ? {
        name: 'orders',
        table: 'orders',
        primaryKey: 'id',
        fields: [
          { name: 'id', type: 'integer' },
          { name: 'status', type: 'string' }
        ],
        relations: []
      }
    : undefined,
  listEntities: () => [
    {
      name: 'orders',
      table: 'orders',
      primaryKey: 'id',
      fields: [
        { name: 'id', type: 'integer' },
        { name: 'status', type: 'string' }
      ],
      relations: []
    }
  ]
};

describe('AgenticQueryAgent repair integration', () => {
  it('repairs a generation-policy failure before execution', async () => {
    let calls = 0;
    const modelProvider: ModelProvider = {
      async generateStructured() {
        calls += 1;
        if (calls === 1) {
          return {
            output: {
              source: { name: 'orders' },
              select: [{ field: { entity: 'orders', field: 'status' } }]
            }
          };
        }

        return {
          output: {
            source: { name: 'orders' },
            select: [{ field: { entity: 'orders', field: 'id' } }]
          }
        };
      }
    };

    const adapter: QueryAdapter<string, string[]> = {
      compile: () => 'compiled-query',
      execute: async () => ['ok']
    };

    const agent = new AgenticQueryAgent({
      model: 'test-model',
      modelProvider,
      schemaProvider,
      queryAdapter: adapter,
      policy: {
        allowedEntities: ['orders'],
        deniedFields: { orders: ['status'] }
      },
      maxRepairAttempts: 1
    });

    await expect(agent.ask('List order ids')).resolves.toMatchObject({
      query: {
        source: { name: 'orders' },
        select: [{ field: { entity: 'orders', field: 'id' } }]
      },
      result: ['ok'],
      repairAttempts: 1
    });

    expect(calls).toBe(2);
  });
});
