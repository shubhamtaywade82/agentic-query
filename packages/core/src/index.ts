export type Aggregate = 'count' | 'sum' | 'avg' | 'min' | 'max';
export type ComparisonOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'like' | 'is_null' | 'is_not_null' | 'between';

export interface EntityRef { name: string }
export interface FieldRef { entity?: string; field: string }
export interface SemanticReference { kind: 'metric' | 'dimension'; name: string }
export interface SelectExpression { field: FieldRef; aggregate?: Aggregate; alias?: string }
export interface SemanticSelectExpression { semantic: SemanticReference; alias?: string }
export type QuerySelectExpression = SelectExpression | SemanticSelectExpression;
export interface Filter { field: FieldRef; operator: ComparisonOperator; value?: unknown; values?: unknown[] }
export interface Join { entity: EntityRef; type: 'inner' | 'left'; on: { left: FieldRef; right: FieldRef } }
export interface OrderBy { field: FieldRef; direction: 'asc' | 'desc' }

export interface Query {
  source: EntityRef;
  select: SelectExpression[];
  joins?: Join[];
  filters?: Filter[];
  groupBy?: FieldRef[];
  having?: Filter[];
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
}

export interface SemanticQuery {
  source: EntityRef;
  select: QuerySelectExpression[];
  joins?: Join[];
  filters?: Filter[];
  groupBy?: FieldRef[];
  having?: Filter[];
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
}

export interface QueryPolicy {
  allowedEntities?: readonly string[];
  deniedFields?: Readonly<Record<string, readonly string[]>>;
  maxRows?: number;
}

export class QueryValidationError extends Error {
  readonly code = 'QUERY_VALIDATION_ERROR';
  constructor(message: string) { super(message); this.name = 'QueryValidationError'; }
}

function assertFieldRef(field: unknown, label: string): asserts field is FieldRef {
  const ref = field as FieldRef | null;
  if (!ref || typeof ref !== 'object' || typeof ref.field !== 'string' || ref.field.length === 0) {
    throw new QueryValidationError(`${label} must contain a non-empty field name`);
  }
  if (ref.entity !== undefined && (typeof ref.entity !== 'string' || ref.entity.length === 0)) {
    throw new QueryValidationError(`${label}.entity must be a non-empty string`);
  }
}

function validateFilter(filter: Filter, label: string): void {
  assertFieldRef(filter?.field, `${label}.field`);
  const operators: readonly ComparisonOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'like', 'is_null', 'is_not_null', 'between'];
  if (!operators.includes(filter.operator)) throw new QueryValidationError(`${label}.operator is unsupported`);
  if (['in', 'not_in', 'between'].includes(filter.operator) && !Array.isArray(filter.values)) {
    throw new QueryValidationError(`${label}.values must be an array`);
  }
  if (filter.operator === 'between' && filter.values?.length !== 2) {
    throw new QueryValidationError(`${label}.values must contain exactly two values`);
  }
}

export function validateQuery(query: Query, policy: QueryPolicy = {}): void {
  if (!query || typeof query !== 'object' || !query.source || typeof query.source.name !== 'string' || query.source.name.length === 0) {
    throw new QueryValidationError('Query must have a valid source');
  }
  if (!Array.isArray(query.select) || query.select.length === 0) {
    throw new QueryValidationError('Query must have at least one select expression');
  }

  if (policy.maxRows !== undefined && (!Number.isSafeInteger(policy.maxRows) || policy.maxRows <= 0)) {
    throw new QueryValidationError('Policy maxRows must be a positive integer');
  }
  if (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit <= 0 || query.limit > 10000)) {
    throw new QueryValidationError('Query limit must be an integer between 1 and 10000');
  }
  if (policy.maxRows !== undefined && query.limit !== undefined && query.limit > policy.maxRows) {
    throw new QueryValidationError('Query limit exceeds policy maximum');
  }
  if (query.offset !== undefined && (!Number.isSafeInteger(query.offset) || query.offset < 0)) {
    throw new QueryValidationError('Query offset must be a non-negative integer');
  }

  if (policy.allowedEntities !== undefined) {
    const allowed = new Set(policy.allowedEntities);
    const entities = [query.source.name, ...(query.joins ?? []).map((join) => join?.entity?.name)];
    for (const entity of entities) {
      if (typeof entity !== 'string' || !allowed.has(entity)) throw new QueryValidationError(`Entity is not allowed: ${entity}`);
    }
  }

  for (const [index, expression] of query.select.entries()) {
    if (!expression || typeof expression !== 'object') throw new QueryValidationError(`select[${index}] is invalid`);
    const candidate = expression as SelectExpression | SemanticSelectExpression;
    if ('semantic' in candidate) {
      if (!candidate.semantic || !['metric', 'dimension'].includes(candidate.semantic.kind) || typeof candidate.semantic.name !== 'string' || candidate.semantic.name.length === 0) {
        throw new QueryValidationError(`select[${index}].semantic is invalid`);
      }
      continue;
    }
    assertFieldRef(candidate.field, `select[${index}].field`);
    if (candidate.aggregate !== undefined && !(['count', 'sum', 'avg', 'min', 'max'] as readonly string[]).includes(candidate.aggregate)) {
      throw new QueryValidationError(`select[${index}].aggregate is unsupported`);
    }
  }

  for (const [index, field] of (query.groupBy ?? []).entries()) assertFieldRef(field, `groupBy[${index}]`);
  for (const [index, order] of (query.orderBy ?? []).entries()) {
    assertFieldRef(order?.field, `orderBy[${index}].field`);
    if (!['asc', 'desc'].includes(order.direction)) throw new QueryValidationError(`orderBy[${index}].direction is invalid`);
  }
  for (const [index, filter] of (query.filters ?? []).entries()) validateFilter(filter, `filters[${index}]`);
  for (const [index, filter] of (query.having ?? []).entries()) validateFilter(filter, `having[${index}]`);

  for (const [index, join] of (query.joins ?? []).entries()) {
    if (!join?.entity?.name || !['inner', 'left'].includes(join.type)) throw new QueryValidationError(`joins[${index}] is invalid`);
    assertFieldRef(join.on?.left, `joins[${index}].on.left`);
    assertFieldRef(join.on?.right, `joins[${index}].on.right`);
  }

  for (const field of [
    ...query.select.filter((expression): expression is SelectExpression => 'field' in expression).map((expression) => expression.field),
    ...(query.groupBy ?? []),
    ...(query.orderBy ?? []).map((order) => order.field),
    ...(query.filters ?? []).map((filter) => filter.field),
    ...(query.having ?? []).map((filter) => filter.field),
    ...(query.joins ?? []).flatMap((join) => [join.on.left, join.on.right])
  ]) {
    const entity = field.entity ?? query.source.name;
    const denied = policy.deniedFields?.[entity] ?? [];
    if (denied.includes(field.field)) throw new QueryValidationError(`Field is not allowed: ${entity}.${field.field}`);
  }
}

export type { EntitySchema, FieldSchema, RelationSchema, QueryAdapter, SchemaProvider } from './adapter.js';
export type { ModelMessage, StructuredGenerationRequest, StructuredGenerationResult, ModelProvider, QueryGenerationRequest, QueryGenerator } from './model.js';
export { StructuredQueryGenerator, QUERY_AST_SCHEMA, QueryGenerationError } from './query-generator.js';
export { SemanticQueryGenerator, SEMANTIC_QUERY_SCHEMA, type SemanticQueryGeneratorOptions, type SemanticQueryGenerationRequest } from './semantic-generator.js';
export { AgenticQueryAgent, type AgentOptions, type AgentPolicy, type AgentResult } from './agent.js';
export { QueryRepairer, QueryRepairError, type QueryRepairOptions } from './repair.js';
export { SemanticCatalog, type DimensionDefinition, type MetricDefinition, type SemanticCatalogDefinition, type SelectMetricExpression } from './semantic.js';
export { resolveSemanticSelect, resolveSemanticQuery, type SemanticSelectExpression as SemanticResolverSelectExpression } from './semantic-query.js';
export { SchemaRetriever, SimpleSchemaRetriever, formatSchemaContext, type SimpleSchemaRetrieverOptions } from './schema-retriever.js';
export { validateQueryPlan, DeterministicQueryPlanner, type QueryPlan, type QueryPlanStep, type PlanContext, type QueryPlanner } from './planner.js';
export { executeQueryPlan, planQueryMap, type PlanExecutionOptions, type PlanExecutionResult, type PlanStepResult } from './plan-executor.js';
export { CollectingQueryObserver, CompositeQueryObserver, NoopQueryObserver, elapsedMs, type QueryEvent, type QueryEventName, type QueryObserver } from './observability.js';
