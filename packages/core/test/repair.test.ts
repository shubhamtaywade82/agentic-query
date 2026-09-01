import { describe, expect, it } from 'vitest';
import { QueryRepairer, type ModelProvider } from '../src/index.js';

describe('QueryRepairer', () => {
  it('repairs an invalid query and returns a policy-valid AST', async () => {
    let calls = 0;
    const provider: ModelProvider = {
      async generateStructured() {
        calls += 1;
        return {
          output: {
            source: { name: 'orders' },
            select: [{ field: { entity: 'orders', field: 'id' } }],
            limit: 5
          }
        };
      }
    };

    const repairer = new QueryRepairer({ provider, model: 'test-model', maxAttempts: 2 });
    const result = await repairer.repair(
      'List recent orders',
      'Entity: orders\nFields: id: integer',
      { source: { name: 'orders' }, select: [] },
      { allowedEntities: ['orders'], maxRows: 10 }
    );

    expect(calls).toBe(1);
    expect(result.limit).toBe(5);
  });

  it('fails closed after the attempt budget is exhausted', async () => {
    const provider: ModelProvider = {
      async generateStructured() {
        return { output: { source: { name: 'orders' }, select: [] } };
      }
    };

    const repairer = new QueryRepairer({ provider, model: 'test-model', maxAttempts: 1 });

    await expect(
      repairer.repair(
        'List orders',
        'Entity: orders',
        { source: { name: 'orders' }, select: [] },
        { allowedEntities: ['orders'] }
      )
    ).rejects.toThrow('Unable to produce a policy-valid query');
  });
});
