import { describe, expect, it } from 'vitest';
import { DrizzleAdapter } from '../src/index.js';

const schemaProvider = {
  getEntity: (name: string) => name === 'orders'
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

describe('DrizzleAdapter', () => {
  it('delegates compilation and execution to application-owned functions', async () => {
    const adapter = new DrizzleAdapter({
      schemaProvider,
      compile: (query) => ({ query, compiled: true }),
      execute: async (compiled) => ({ executed: compiled })
    });

    const query = {
      source: { name: 'orders' },
      select: [{ field: { entity: 'orders', field: 'id' } }],
      limit: 10
    } as const;

    const compiled = adapter.compile(query);
    expect(compiled.compiled).toBe(true);
    await expect(adapter.execute(compiled)).resolves.toMatchObject({
      executed: { compiled: true }
    });
  });
});
