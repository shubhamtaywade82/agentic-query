/**
 * Versioned, language-neutral Query AST.
 *
 * The AST is the only representation the model is allowed to produce. Every
 * other stage (validation, policy, repair, compilation) operates on trusted
 * code over this structure. All sibling modules import from this module —
 * never from `index.js` — to keep the module graph acyclic.
 */

export type Aggregate = 'count' | 'sum' | 'avg' | 'min' | 'max';
export type ComparisonOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'like'
  | 'is_null'
  | 'is_not_null'
  | 'between';
export type JoinType = 'inner' | 'left';
export type OrderDirection = 'asc' | 'desc';

export interface EntityRef { name: string }
export interface FieldRef { entity?: string; field: string }
export interface SemanticReference { kind: 'metric' | 'dimension'; name: string }
export interface SelectExpression { field: FieldRef; aggregate?: Aggregate | undefined; alias?: string | undefined }
export interface SemanticSelectExpression { semantic: SemanticReference; alias?: string | undefined }
export type QuerySelectExpression = SelectExpression | SemanticSelectExpression;
export interface Filter { field: FieldRef; operator: ComparisonOperator; value?: unknown; values?: readonly unknown[] | undefined }
export interface Join { entity: EntityRef; type: JoinType; on: { left: FieldRef; right: FieldRef } }
export interface OrderBy { field: FieldRef; direction: OrderDirection }

/** AST versions understood by this runtime. v0.2 adds semantic references. */
export const SUPPORTED_AST_VERSIONS = ['0.1', '0.2'] as const;
export type SupportedAstVersion = (typeof SUPPORTED_AST_VERSIONS)[number];
export const AST_VERSION: SupportedAstVersion = '0.2';

export interface Query {
  version?: SupportedAstVersion | undefined;
  source: EntityRef;
  select: SelectExpression[];
  joins?: readonly Join[] | undefined;
  filters?: readonly Filter[] | undefined;
  groupBy?: readonly FieldRef[] | undefined;
  having?: readonly Filter[] | undefined;
  orderBy?: readonly OrderBy[] | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/**
 * Queries that may reference semantic metrics/dimensions in select
 * expressions. Resolution into a physical {@link Query} happens through
 * trusted semantic resolution before validation and compilation.
 */
export interface SemanticQuery {
  version?: SupportedAstVersion | undefined;
  source: EntityRef;
  select: QuerySelectExpression[];
  joins?: readonly Join[] | undefined;
  filters?: readonly Filter[] | undefined;
  groupBy?: readonly FieldRef[] | undefined;
  having?: readonly Filter[] | undefined;
  orderBy?: readonly OrderBy[] | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export class QueryValidationError extends Error {
  readonly code: string = 'QUERY_VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

export const COMPARISON_OPERATORS: readonly ComparisonOperator[] = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'like', 'is_null', 'is_not_null', 'between'
];
export const AGGREGATES: readonly Aggregate[] = ['count', 'sum', 'avg', 'min', 'max'];
export const JOIN_TYPES: readonly JoinType[] = ['inner', 'left'];
export const ORDER_DIRECTIONS: readonly OrderDirection[] = ['asc', 'desc'];

/** Absolute ceiling enforced even when a policy does not narrow it. */
export const ABSOLUTE_MAX_ROWS = 10000;

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
  if (!COMPARISON_OPERATORS.includes(filter.operator)) {
    throw new QueryValidationError(`${label}.operator is unsupported`);
  }
  if (['in', 'not_in', 'between'].includes(filter.operator) && !Array.isArray(filter.values)) {
    throw new QueryValidationError(`${label}.values must be an array`);
  }
  if (filter.operator === 'between' && filter.values?.length !== 2) {
    throw new QueryValidationError(`${label}.values must contain exactly two values`);
  }
}

export function fieldEntities(query: Query): readonly string[] {
  return [query.source.name, ...(query.joins ?? []).map((join) => join?.entity?.name)];
}

/** Every field reference that appears anywhere in the query. */
export function queryFieldRefs(query: Query): readonly FieldRef[] {
  return [
    ...query.select.map((expression) => expression.field),
    ...(query.groupBy ?? []),
    ...(query.orderBy ?? []).map((order) => order.field),
    ...(query.filters ?? []).map((filter) => filter.field),
    ...(query.having ?? []).map((filter) => filter.field),
    ...(query.joins ?? []).flatMap((join) => [join.on.left, join.on.right])
  ];
}

/**
 * Deterministic complexity score used by policy `maxComplexity`.
 * Scoring: 1 per select expression, filter, groupBy, orderBy, having;
 * 2 per join. Deliberately simple and stable across versions.
 */
export function computeQueryComplexity(query: Query): number {
  const joins = query.joins?.length ?? 0;
  return (
    query.select.length +
    (query.filters?.length ?? 0) +
    (query.groupBy?.length ?? 0) +
    (query.orderBy?.length ?? 0) +
    (query.having?.length ?? 0) +
    joins * 2
  );
}

export function validateQuery(query: Query, policy: QueryPolicyLike = {}): void {
  if (!query || typeof query !== 'object' || !query.source || typeof query.source.name !== 'string' || query.source.name.length === 0) {
    throw new QueryValidationError('Query must have a valid source');
  }
  if (query.version !== undefined) {
    if (typeof query.version !== 'string' || !(SUPPORTED_AST_VERSIONS as readonly string[]).includes(query.version)) {
      throw new QueryValidationError(`Query AST version is unsupported: ${String(query.version)}`);
    }
  }
  if (!Array.isArray(query.select) || query.select.length === 0) {
    throw new QueryValidationError('Query must have at least one select expression');
  }

  if (policy.maxRows !== undefined && (!Number.isSafeInteger(policy.maxRows) || policy.maxRows <= 0)) {
    throw new QueryValidationError('Policy maxRows must be a positive integer');
  }
  if (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit <= 0 || query.limit > ABSOLUTE_MAX_ROWS)) {
    throw new QueryValidationError(`Query limit must be an integer between 1 and ${ABSOLUTE_MAX_ROWS}`);
  }
  if (policy.maxRows !== undefined && query.limit !== undefined && query.limit > policy.maxRows) {
    throw new QueryValidationError('Query limit exceeds policy maximum');
  }
  if (query.offset !== undefined && (!Number.isSafeInteger(query.offset) || query.offset < 0)) {
    throw new QueryValidationError('Query offset must be a non-negative integer');
  }

  if (policy.allowedEntities !== undefined) {
    const allowed = new Set(policy.allowedEntities);
    for (const entity of fieldEntities(query)) {
      if (typeof entity !== 'string' || !allowed.has(entity)) {
        throw new QueryValidationError(`Entity is not allowed: ${entity}`);
      }
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
    if (candidate.aggregate !== undefined && !AGGREGATES.includes(candidate.aggregate)) {
      throw new QueryValidationError(`select[${index}].aggregate is unsupported`);
    }
    if (candidate.aggregate !== undefined && policy.allowedAggregates !== undefined && !policy.allowedAggregates.includes(candidate.aggregate)) {
      throw new QueryValidationError(`Aggregate is not allowed by policy: ${candidate.aggregate}`);
    }
  }

  for (const [index, field] of (query.groupBy ?? []).entries()) assertFieldRef(field, `groupBy[${index}]`);
  for (const [index, order] of (query.orderBy ?? []).entries()) {
    assertFieldRef(order?.field, `orderBy[${index}].field`);
    if (!ORDER_DIRECTIONS.includes(order.direction)) throw new QueryValidationError(`orderBy[${index}].direction is invalid`);
  }
  for (const [index, filter] of (query.filters ?? []).entries()) {
    validateFilter(filter, `filters[${index}]`);
    if (policy.allowedOperators !== undefined && !policy.allowedOperators.includes(filter.operator)) {
      throw new QueryValidationError(`Filter operator is not allowed by policy: ${filter.operator}`);
    }
  }
  for (const [index, filter] of (query.having ?? []).entries()) {
    validateFilter(filter, `having[${index}]`);
    if (policy.allowedOperators !== undefined && !policy.allowedOperators.includes(filter.operator)) {
      throw new QueryValidationError(`Filter operator is not allowed by policy: ${filter.operator}`);
    }
  }

  for (const [index, join] of (query.joins ?? []).entries()) {
    if (!join?.entity?.name || !JOIN_TYPES.includes(join.type)) throw new QueryValidationError(`joins[${index}] is invalid`);
    if (policy.allowedJoinTypes !== undefined && !policy.allowedJoinTypes.includes(join.type)) {
      throw new QueryValidationError(`Join type is not allowed by policy: ${join.type}`);
    }
    assertFieldRef(join.on?.left, `joins[${index}].on.left`);
    assertFieldRef(join.on?.right, `joins[${index}].on.right`);
  }

  if (policy.maxComplexity !== undefined) {
    const complexity = computeQueryComplexity(query);
    if (complexity > policy.maxComplexity) {
      throw new QueryValidationError(`Query complexity ${complexity} exceeds policy maximum ${policy.maxComplexity}`);
    }
  }

  for (const field of queryFieldRefs(query)) {
    const entity = field.entity ?? query.source.name;
    const denied = policy.deniedFields?.[entity] ?? [];
    if (denied.includes(field.field)) throw new QueryValidationError(`Field is not allowed: ${entity}.${field.field}`);
  }
}

/**
 * Structural subset of {@link QueryPolicy} referenced by validation. Kept
 * local so `ast.ts` has no runtime dependency on `policy.ts`.
 */
export interface QueryPolicyLike {
  allowedEntities?: readonly string[] | undefined;
  deniedFields?: Readonly<Record<string, readonly string[]>> | undefined;
  maxRows?: number | undefined;
  maxComplexity?: number | undefined;
  allowedOperators?: readonly ComparisonOperator[] | undefined;
  allowedAggregates?: readonly Aggregate[] | undefined;
  allowedJoinTypes?: readonly JoinType[] | undefined;
}
