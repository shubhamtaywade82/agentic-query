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

export function validateQuery(query: Query, policy: QueryPolicy = {}): void {
  if (!query || !query.source?.name || !Array.isArray(query.select) || query.select.length === 0) {
    throw new QueryValidationError('Query must have a source and at least one select expression');
  }
  if (policy.maxRows !== undefined && query.limit !== undefined && query.limit > policy.maxRows) {
    throw new QueryValidationError('Query limit exceeds policy maximum');
  }
  if (policy.allowedEntities !== undefined) {
    const allowed = new Set(policy.allowedEntities);
    const entities = [query.source.name, ...(query.joins ?? []).map((join) => join.entity.name)];
    for (const entity of entities) if (!allowed.has(entity)) throw new QueryValidationError(`Entity is not allowed: ${entity}`);
  }
  const fields: FieldRef[] = [
    ...query.select.map((expression) => expression.field),
    ...(query.groupBy ?? []),
    ...(query.orderBy ?? []).map((order) => order.field),
    ...(query.filters ?? []).map((filter) => filter.field),
    ...(query.having ?? []).map((filter) => filter.field),
    ...(query.joins ?? []).flatMap((join) => [join.on.left, join.on.right])
  ];
  for (const field of fields) {
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
