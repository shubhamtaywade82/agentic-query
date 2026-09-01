/**
 * Plan execution (plan §8).
 *
 * Validates the DAG, executes query steps in deterministic topological
 * order, evaluates derived computation steps deterministically over
 * normalized results, and enforces per-step policies and timeouts.
 */
import { validateQuery, type Query } from './ast.js';
import type { QueryAdapter } from './adapter.js';
import { mergePolicies, type QueryPolicy } from './policy.js';
import { isDerivedComputationStep, isQueryPlanStep, planTopologicalOrder, validateQueryPlan, type QueryPlan } from './planner.js';
import type { ComputationNode } from './semantic-query.js';
import type { QueryResult } from './result.js';

export interface PlanExecutionOptions<CompiledQuery = unknown, Result = unknown> {
  adapter: QueryAdapter<CompiledQuery, Result>;
  policy?: QueryPolicy;
  maxSteps?: number;
  /** Per-step timeout enforced on the compile+execute path. */
  defaultStepTimeoutMs?: number;
  /** Normalizes adapter results into QueryResult when provided. */
  normalize?: (result: Result, stepId: string) => QueryResult;
}

export interface PlanStepResult<Result = unknown> {
  id: string;
  result?: Result;
  /** Normalized result when a normalizer was supplied. */
  normalized?: QueryResult;
  durationMs?: number;
}

export interface PlanExecutionResult<Result = unknown> {
  steps: readonly PlanStepResult<Result>[];
  /** Result of the final step in topological order. */
  final: PlanStepResult<Result>;
}

class PlanStepTimeoutError extends Error {
  readonly code = 'PLAN_STEP_TIMEOUT';
  constructor(stepId: string, timeoutMs: number) {
    super(`Plan step ${stepId} exceeded its timeout of ${timeoutMs}ms`);
    this.name = 'PlanStepTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T> | T, stepId: string, timeoutMs?: number): Promise<T> {
  if (timeoutMs === undefined) return Promise.resolve(promise);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PlanStepTimeoutError(stepId, timeoutMs)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

/** Deterministic evaluation of a computation tree over one result row. */
export function evaluateComputation(node: ComputationNode, lookup: (metric: string) => number | null): number | null {
  switch (node.kind) {
    case 'input': {
      const value = lookup(node.metric);
      return value;
    }
    case 'constant':
      return node.value;
    case 'binary': {
      const left = evaluateComputation(node.left, lookup);
      const right = evaluateComputation(node.right, lookup);
      if (left === null || right === null) return null;
      switch (node.operator) {
        case 'divide':
          return right === 0 ? null : left / right;
        case 'multiply':
          return left * right;
        case 'add':
          return left + right;
        case 'subtract':
          return left - right;
      }
    }
  }
}

/** Applies derived computations to a normalized result, appending columns. */
export function applyComputations(
  result: QueryResult,
  computations: readonly { alias: string; expression: ComputationNode }[]
): QueryResult {
  if (computations.length === 0) return result;

  const columnIndex = new Map(result.columns.map((column, index) => [column.name, index]));
  const lookup = (metric: string): number | null => {
    const index = columnIndex.get(metric);
    if (index === undefined) return null;
    const value = result.rows[0]?.[index];
    if (typeof value !== 'number') return null;
    return value;
  };

  // Computations over multi-row results are evaluated per row.
  const rowIndexes = new Map<string, number>();
  const columns = [...result.columns];
  for (const computation of computations) {
    columns.push({ name: computation.alias, type: 'number', nullable: true });
    rowIndexes.set(computation.alias, columns.length - 1);
  }

  const rows = result.rows.map((row) => {
    const extended = [...row];
    for (const computation of computations) {
      let value: number | null = null;
      if (row.length > 0 && result.rows.length > 0) {
        // Row-scoped lookup: prefer a value from this row, fall back to
        // aggregate (single-row) results produced by other steps.
        const rowLookup = (metric: string): number | null => {
          const index = columnIndex.get(metric);
          if (index !== undefined && typeof row[index] === 'number') return row[index] as number;
          return lookup(metric);
        };
        value = evaluateComputation(computation.expression, rowLookup);
      }
      extended.push(value ?? null);
    }
    return extended;
  });

  return {
    columns,
    rows,
    rowCount: rows.length,
    metadata: { ...result.metadata }
  };
}

export async function executeQueryPlan<CompiledQuery = unknown, Result = unknown>(
  plan: QueryPlan,
  options: PlanExecutionOptions<CompiledQuery, Result>
): Promise<PlanExecutionResult<Result>> {
  validateQueryPlan(plan);
  const maxSteps = options.maxSteps ?? 8;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('maxSteps must be a positive integer');
  if (plan.steps.length > maxSteps) throw new Error('Query plan exceeds maximum step count');

  const basePolicy = options.policy ?? {};
  const order = planTopologicalOrder(plan);
  const byId = new Map(plan.steps.map((step) => [step.id, step]));
  const results = new Map<string, PlanStepResult<Result>>();
  let last: PlanStepResult<Result> | undefined;

  for (const id of order) {
    const step = byId.get(id)!;

    if (isDerivedComputationStep(step)) {
      const source = results.get(step.sourceStep);
      const sourceNormalized = source?.normalized;
      if (!sourceNormalized) {
        throw new Error(`Derived computation step ${step.id} requires a normalized source result; supply options.normalize`);
      }
      const applied = applyComputations(sourceNormalized, [{ alias: step.alias, expression: step.expression }]);
      const stepResult: PlanStepResult<Result> = { id, normalized: applied };
      results.set(id, stepResult);
      last = stepResult;
      continue;
    }

    if (!isQueryPlanStep(step)) {
      throw new Error(`Plan step is neither query nor computation: ${id}`);
    }

    const stepPolicy: QueryPolicy = step.policy ? mergePolicies(basePolicy, step.policy) : basePolicy;
    validateQuery(step.query, stepPolicy);
    const startedAt = performance.now();
    const compiled = options.adapter.compile(step.query, stepPolicy);
    const executed = await withTimeout(options.adapter.execute(compiled), step.id, step.timeoutMs ?? options.defaultStepTimeoutMs);
    const durationMs = Number((performance.now() - startedAt).toFixed(3));

    const stepResult: PlanStepResult<Result> = {
      id,
      result: executed,
      durationMs,
      ...(options.normalize ? { normalized: options.normalize(executed, step.id) } : {})
    };
    results.set(id, stepResult);
    last = stepResult;
  }

  if (!last) throw new Error('Query plan produced no results');
  return { steps: order.map((id) => results.get(id)!), final: last };
}

export function planQueryMap(plan: QueryPlan): ReadonlyMap<string, Query> {
  validateQueryPlan(plan);
  return new Map(
    plan.steps
      .filter(isQueryPlanStep)
      .map((step) => [step.id, step.query])
  );
}
