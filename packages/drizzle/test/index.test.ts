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
  listEntities: () => [{
    name: 'orders',
    table: 'orders',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'integer' },
      { name: 'status', type: 'string' }
    ],
    relations: []
  }]
};

describe('DrizzleAdapter', () => {
  it('delegates compilation and execution to application-owned functions', async () => {
    const calls: unknown[] = [];
    const adapter = new DrizzleAdapter({
      schemaProvider,
      compile: (query, policy) => {
        calls.push(policy);
        return { query, policy, compiled: true };
      },
      execute: async (compiled) => ({ executed: compiled })
    });

    const query = {
      source: { name: 'orders' },
      select: [{ field: { entity: 'orders', field: 'id' } }],
      limit: 10
    } as const;

    const policy = { allowedEntities: ['orders'], maxRows: 10 };
    const compiled = adapter.compile(query, policy);
    expect(compiled.compiled).toBe(true);
    expect(calls).toEqual([policy]);
    await expect(adapter.execute(compiled)).resolves.toMatchObject({ executed: { compiled: true } });
  });
});
