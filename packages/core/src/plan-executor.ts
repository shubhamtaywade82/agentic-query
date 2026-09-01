import { validateQuery, type Query, type QueryAdapter, type QueryPolicy } from './index.js';
import { validateQueryPlan, type QueryPlan } from './planner.js';

export interface PlanExecutionOptions<CompiledQuery = unknown, Result = unknown> {
  adapter: QueryAdapter<CompiledQuery, Result>;
  policy?: QueryPolicy;
  maxSteps?: number;
}

export interface PlanStepResult<Result> {
  id: string;
  result: Result;
}

export interface PlanExecutionResult<Result> {
  steps: readonly PlanStepResult<Result>[];
}

export async function executeQueryPlan<CompiledQuery = unknown, Result = unknown>(
  plan: QueryPlan,
  options: PlanExecutionOptions<CompiledQuery, Result>
): Promise<PlanExecutionResult<Result>> {
  validateQueryPlan(plan);
  const maxSteps = options.maxSteps ?? 8;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('maxSteps must be a positive integer');
  if (plan.steps.length > maxSteps) throw new Error('Query plan exceeds maximum step count');

  const byId = new Map(plan.steps.map((step) => [step.id, step]));
  const results: PlanStepResult<Result>[] = [];
  const completed = new Set<string>();
  const pending = new Set(plan.steps.map((step) => step.id));

  while (pending.size > 0) {
    let progressed = false;
    for (const step of plan.steps) {
      if (!pending.has(step.id)) continue;
      if ((step.dependsOn ?? []).some((dependency) => !completed.has(dependency))) continue;

      validateQuery(step.query, options.policy ?? {});
      const compiled = options.adapter.compile(step.query, options.policy);
      const result = await options.adapter.execute(compiled);
      results.push({ id: step.id, result });
      completed.add(step.id);
      pending.delete(step.id);
      progressed = true;
    }

    if (!progressed) throw new Error('Query plan cannot make progress; dependency graph is invalid');
  }

  return { steps: results };
}

export function planQueryMap(plan: QueryPlan): ReadonlyMap<string, Query> {
  validateQueryPlan(plan);
  return new Map(plan.steps.map((step) => [step.id, step.query]));
}
