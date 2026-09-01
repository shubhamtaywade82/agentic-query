/**
 * Agent planning (plan §8).
 *
 * Plans are bounded DAGs of query steps plus deterministic derived
 * computations. There is no arbitrary code execution: computation steps
 * declare operator/inputs, and the executor interprets them.
 */
import type { Query } from './ast.js';
import { validateQuery } from './ast.js';
import type { QueryPolicy } from './policy.js';
import type { ComputationNode } from './semantic-query.js';

export type PlanStepId = string;

export interface QueryPlanStep {
  id: PlanStepId;
  query: Query;
  dependsOn?: readonly PlanStepId[];
  /** Per-step policy overlay; may only narrow the request policy. */
  policy?: QueryPolicy;
  /** Per-step timeout in milliseconds. */
  timeoutMs?: number;
}

export interface DerivedComputationStep {
  id: PlanStepId;
  dependsOn?: readonly PlanStepId[];
  /** Output column name. */
  alias: string;
  /** Deterministic computation tree. */
  expression: ComputationNode;
  /** Step whose normalized result feeds the computation. */
  sourceStep: PlanStepId;
}

export type PlanStep = QueryPlanStep | DerivedComputationStep;

export function isQueryPlanStep(step: PlanStep): step is QueryPlanStep {
  return (step as QueryPlanStep).query !== undefined;
}

export function isDerivedComputationStep(step: PlanStep): step is DerivedComputationStep {
  return (step as DerivedComputationStep).expression !== undefined;
}

export interface QueryPlan {
  steps: readonly PlanStep[];
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

export class PlanValidationError extends Error {
  readonly code = 'PLAN_VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'PlanValidationError';
  }
}

export function validateQueryPlan(plan: QueryPlan): void {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new PlanValidationError('Query plan must contain at least one step');
  }

  const byId = new Map<PlanStepId, PlanStep>();
  for (const step of plan.steps) {
    if (!step?.id || byId.has(step.id)) {
      throw new PlanValidationError(`Invalid or duplicate plan step id: ${step.id}`);
    }
    const isQuery = isQueryPlanStep(step);
    const isComputation = isDerivedComputationStep(step);
    if (!isQuery && !isComputation) {
      throw new PlanValidationError(`Plan step requires a query or an expression: ${step.id}`);
    }
    if (isDerivedComputationStep(step) && !step.sourceStep) {
      throw new PlanValidationError(`Derived computation step requires sourceStep: ${step.id}`);
    }
    byId.set(step.id, step);
  }

  const visiting = new Set<PlanStepId>();
  const visited = new Set<PlanStepId>();
  const visit = (id: PlanStepId): void => {
    if (visiting.has(id)) throw new PlanValidationError(`Query plan contains a dependency cycle at: ${id}`);
    if (visited.has(id)) return;

    const step = byId.get(id);
    if (!step) throw new PlanValidationError(`Unknown plan dependency: ${id}`);

    visiting.add(id);
    for (const dependency of step.dependsOn ?? []) {
      if (dependency === id) throw new PlanValidationError(`Invalid plan dependency: ${id} -> ${dependency}`);
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const step of plan.steps) visit(step.id);

  for (const step of plan.steps) {
    if (!isDerivedComputationStep(step)) continue;
    if (!byId.has(step.sourceStep)) {
      throw new PlanValidationError(`Unknown sourceStep for derived computation: ${step.id} -> ${step.sourceStep}`);
    }
    const dependencies = step.dependsOn ?? [];
    if (!dependencies.includes(step.sourceStep)) {
      throw new PlanValidationError(`Derived computation must depend on its sourceStep: ${step.id}`);
    }
  }
}

/** Stable topological order; deterministic for equal inputs. */
export function planTopologicalOrder(plan: QueryPlan): readonly PlanStepId[] {
  validateQueryPlan(plan);
  const byId = new Map(plan.steps.map((step) => [step.id, step]));
  const order: PlanStepId[] = [];
  const visited = new Set<PlanStepId>();

  const visit = (id: PlanStepId): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const step = byId.get(id)!;
    for (const dependency of (step.dependsOn ?? []).slice().sort()) visit(dependency);
    order.push(id);
  };

  for (const step of plan.steps.slice().sort((left, right) => left.id.localeCompare(right.id))) {
    visit(step.id);
  }
  return order;
}

/** Explainable plan serialization for logs and evaluation. */
export function serializeQueryPlan(plan: QueryPlan): string {
  validateQueryPlan(plan);
  const order = planTopologicalOrder(plan);
  const lines = order.map((id) => {
    const step = plan.steps.find((candidate) => candidate.id === id)!;
    const dependencies = (step.dependsOn ?? []).join(', ');
    if (isQueryPlanStep(step)) {
      const selects = step.query.select
        .map((expression) => (expression.aggregate ? `${expression.aggregate}(${expression.field.field})` : expression.field.field))
        .join(', ');
      return `step ${id} [query] ${step.query.source.name}(${selects})${dependencies ? ` <- ${dependencies}` : ''}`;
    }
    return `step ${id} [compute] ${step.alias} = ${renderComputation(step.expression)} from ${step.sourceStep}${dependencies ? ` <- ${dependencies}` : ''}`;
  });
  return `Plan (${plan.steps.length} steps)\n${lines.join('\n')}`;
}

function renderComputation(node: ComputationNode): string {
  switch (node.kind) {
    case 'input':
      return node.metric;
    case 'constant':
      return String(node.value);
    case 'binary':
      return `(${renderComputation(node.left)} ${node.operator} ${renderComputation(node.right)})`;
  }
}
