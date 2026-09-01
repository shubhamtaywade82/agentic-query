import type { Query, SelectExpression } from './index.js';
import type { SemanticCatalog } from './semantic.js';

export interface SemanticReference {
  kind: 'metric' | 'dimension';
  name: string;
}

export interface SemanticSelectExpression {
  semantic: SemanticReference;
  alias?: string;
}

export function resolveSemanticSelect(
  expression: SemanticSelectExpression,
  catalog: SemanticCatalog
): SelectExpression {
  if (expression.semantic.kind === 'metric') {
    const metric = catalog.getMetric(expression.semantic.name);
    if (!metric) throw new Error(`Unknown semantic metric: ${expression.semantic.name}`);
    return {
      field: { entity: metric.entity, field: metric.expression.field },
      aggregate: metric.expression.aggregate,
      alias: expression.alias ?? metric.name
    };
  }

  const dimension = catalog.getDimension(expression.semantic.name);
  if (!dimension) throw new Error(`Unknown semantic dimension: ${expression.semantic.name}`);
  return {
    field: { entity: dimension.entity, field: dimension.field },
    alias: expression.alias ?? dimension.name
  };
}

/**
 * Resolve semantic select expressions embedded in a query-like object.
 * Physical Query objects are returned unchanged because the v0.1 AST does
 * not yet model semantic nodes directly. v0.2 semantic nodes are resolved
 * before this function receives the physical Query.
 */
export function resolveSemanticQuery(
  query: Query,
  catalog: SemanticCatalog
): Query {
  return {
    ...query,
    select: query.select.map((selection) => selection)
  };
}
