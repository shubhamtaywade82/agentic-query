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

  const ids = new Set<string>();
  for (const step of plan.steps) {
    if (!step.id || ids.has(step.id)) throw new Error(`Invalid or duplicate plan step id: ${step.id}`);
    ids.add(step.id);
    if (!step.query) throw new Error(`Plan step requires a query: ${step.id}`);
    for (const dependency of step.dependsOn ?? []) {
      if (dependency === step.id || !ids.has(dependency)) {
        throw new Error(`Invalid plan dependency: ${step.id} -> ${dependency}`);
      }
    }
  }
}
