import { describe, expect, it } from 'vitest';
import { DeterministicQueryPlanner, executeQueryPlan, validateQueryPlan, type QueryAdapter, type QueryPolicy } from '../src/index.js';

describe('query planning', () => {
  const query = {
    source: { name: 'orders' },
    select: [{ field: { field: 'id' } }]
  };

  it('validates a dependency DAG including forward references', () => {
    expect(() => validateQueryPlan({
      steps: [
        { id: 'two', query, dependsOn: ['one'] },
        { id: 'one', query }
      ]
    })).not.toThrow();
  });

  it('rejects dependency cycles', () => {
    expect(() => validateQueryPlan({
      steps: [
        { id: 'one', query, dependsOn: ['two'] },
        { id: 'two', query, dependsOn: ['one'] }
      ]
    })).toThrow(/cycle/);
  });

  it('executes steps in dependency order and enforces max steps', async () => {
    const calls: string[] = [];
    const adapter: QueryAdapter<string, string> = {
      compile: (q) => q.source.name,
      execute: (compiled) => {
        calls.push(compiled);
        return compiled;
      }
    };
    const policy: QueryPolicy = { allowedEntities: ['orders'] };
    const plan = {
      steps: [
        { id: 'two', query, dependsOn: ['one'] },
        { id: 'one', query }
      ]
    };

    const result = await executeQueryPlan(plan, { adapter, policy, maxSteps: 2 });
    expect(result.steps.map((step) => step.id)).toEqual(['one', 'two']);
    expect(calls).toEqual(['orders', 'orders']);
  });

  it('provides a deterministic one-step planner', () => {
    const planner = new DeterministicQueryPlanner(() => query);
    expect(planner.plan({ question: 'x', schemaContext: 'y' }).steps).toHaveLength(1);
  });
});
