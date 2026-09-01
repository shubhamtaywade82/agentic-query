export type Aggregate = 'count' | 'sum' | 'avg' | 'min' | 'max';
export type ComparisonOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'like' | 'is_null' | 'is_not_null' | 'between';
export interface EntityRef { name: string }
export interface FieldRef { entity?: string; field: string }
export interface SelectExpression { field: FieldRef; aggregate?: Aggregate; alias?: string }
export interface Filter { field: FieldRef; operator: ComparisonOperator; value?: unknown; values?: unknown[] }
export interface Join { entity: EntityRef; type: 'inner' | 'left'; on: { left: FieldRef; right: FieldRef } }
export interface OrderBy { field: FieldRef; direction: 'asc' | 'desc' }
export interface Query { source: EntityRef; select: SelectExpression[]; joins?: Join[]; filters?: Filter[]; groupBy?: FieldRef[]; having?: Filter[]; orderBy?: OrderBy[]; limit?: number; offset?: number }
export interface QueryPolicy { allowedEntities?: readonly string[]; deniedFields?: Readonly<Record<string, readonly string[]>>; maxRows?: number }
export class QueryValidationError extends Error { readonly code = 'QUERY_VALIDATION_ERROR' }
export function validateQuery(query: Query, policy: QueryPolicy = {}): void {
  if (query.select.length === 0) throw new QueryValidationError('Query must select at least one expression');
  if (policy.maxRows !== undefined && query.limit !== undefined && query.limit > policy.maxRows) throw new QueryValidationError('Query limit exceeds policy maximum');
  if (policy.allowedEntities !== undefined) {
    const allowed = new Set(policy.allowedEntities);
    const entities = [query.source.name, ...(query.joins ?? []).map((join) => join.entity.name)];
    for (const entity of entities) if (!allowed.has(entity)) throw new QueryValidationError(`Entity is not allowed: ${entity}`);
  }
  for (const expression of query.select) {
    const entity = expression.field.entity ?? query.source.name;
    const denied = policy.deniedFields?.[entity] ?? [];
    if (denied.includes(expression.field.field)) throw new QueryValidationError(`Field is not allowed: ${entity}.${expression.field.field}`);
  }
}
