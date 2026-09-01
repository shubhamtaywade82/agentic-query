import type { Query } from './index.js';

export interface QueryPlanStep {
  id: string;
  query: Query;
  dependsOn?: readonly string[];
}

export interface QueryPlan {
  steps: readonly QueryPlanStep[];
}

export interface PlanContext {
  question: string;
  schemaContext: string;
  semanticContext?: string;
}

export interface QueryPlanner {
  plan(context: PlanContext): Promise<QueryPlan> | QueryPlan;
}

export class DeterministicQueryPlanner implements QueryPlanner {
  constructor(private readonly queryFactory: (context: PlanContext) => Query) {}

  plan(context: PlanContext): QueryPlan {
    return { steps: [{ id: 'query-1', query: this.queryFactory(context) }] };
  }
}

export function validateQueryPlan(plan: QueryPlan): void {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error('Query plan must contain at least one step');
  }

  const byId = new Map<string, QueryPlanStep>();
  for (const step of plan.steps) {
    if (!step.id || byId.has(step.id)) throw new Error(`Invalid or duplicate plan step id: ${step.id}`);
    if (!step.query) throw new Error(`Plan step requires a query: ${step.id}`);
    byId.set(step.id, step);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`Query plan contains a dependency cycle at: ${id}`);
    if (visited.has(id)) return;

    const step = byId.get(id);
    if (!step) throw new Error(`Unknown plan dependency: ${id}`);

    visiting.add(id);
    for (const dependency of step.dependsOn ?? []) {
      if (dependency === id) throw new Error(`Invalid plan dependency: ${id} -> ${dependency}`);
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const step of plan.steps) visit(step.id);
}
