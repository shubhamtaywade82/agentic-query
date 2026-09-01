import { describe, expect, it } from 'vitest';
import type { EntitySchema, QueryAdapter, SchemaProvider } from '../src/index.js';

describe('core adapter contracts', () => {
  it('accepts an adapter implementing the shared contract', async () => {
    const adapter: QueryAdapter<string, string[]> = {
      compile: () => 'compiled',
      execute: async () => ['ok']
    };

    expect(adapter.compile({
      source: { name: 'orders' },
      select: [{ field: { field: 'id' } }]
    })).toBe('compiled');

    await expect(adapter.execute('compiled')).resolves.toEqual(['ok']);
  });

  it('models schemas through the language-neutral provider contract', () => {
    const schema: EntitySchema = {
      name: 'orders',
      table: 'orders',
      primaryKey: 'id',
      fields: [{ name: 'id', type: 'integer', nullable: false }],
      relations: []
    };

    const provider: SchemaProvider = {
      getEntity: (name) => (name === 'orders' ? schema : undefined),
      listEntities: () => [schema]
    };

    expect(provider.getEntity('orders')?.table).toBe('orders');
    expect(provider.listEntities()).toHaveLength(1);
  });
});
