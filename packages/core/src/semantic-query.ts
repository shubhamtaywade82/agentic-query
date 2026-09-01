import type { Query, SelectExpression, SemanticQuery, QuerySelectExpression } from './index.js';
import type { SemanticCatalog } from './semantic.js';

function resolveSelectExpression(
  expression: QuerySelectExpression,
  catalog: SemanticCatalog
): SelectExpression {
  if ('field' in expression) return expression;

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

export function resolveSemanticSelect(
  expression: Exclude<QuerySelectExpression, SelectExpression>,
  catalog: SemanticCatalog
): SelectExpression {
  return resolveSelectExpression(expression, catalog);
}

export function resolveSemanticQuery(
  query: SemanticQuery | Query,
  catalog: SemanticCatalog
): Query {
  return {
    ...query,
    select: query.select.map((expression) => resolveSelectExpression(expression, catalog))
  };
}
