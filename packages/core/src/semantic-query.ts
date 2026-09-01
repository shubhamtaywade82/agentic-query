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
    const metric = catalog.metric(expression.semantic.name);
    if (!metric) throw new Error(`Unknown semantic metric: ${expression.semantic.name}`);
    return {
      field: { entity: metric.entity, field: metric.field },
      aggregate: metric.aggregate,
      alias: expression.alias ?? metric.name
    };
  }

  const dimension = catalog.dimension(expression.semantic.name);
  if (!dimension) throw new Error(`Unknown semantic dimension: ${expression.semantic.name}`);
  return {
    field: { entity: dimension.entity, field: dimension.field },
    alias: expression.alias ?? dimension.name
  };
}

export function resolveSemanticQuery(
  query: Query,
  catalog: SemanticCatalog
): Query {
  void catalog;
  return query;
}
