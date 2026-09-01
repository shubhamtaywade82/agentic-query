/**
 * Trusted semantic resolution (plan §6).
 *
 * SemanticQuery -> catalog lookup -> trusted physical expression -> Query AST.
 * Unknown metrics/dimensions fail closed with a typed error. Metric-level
 * filters are merged into the physical query as trusted AND conditions.
 * Formula (derived) metrics expand into their physical inputs plus a
 * deterministic computation descriptor applied post-execution.
 */
import type { Filter, Query, QuerySelectExpression, SemanticQuery, SelectExpression } from './ast.js';
import {
  SemanticCatalog,
  SemanticResolutionError,
  type MetricDefinition,
  type MetricFormula,
  type MetricOperand
} from './semantic.js';

/** A node in a deterministic computation tree for a derived metric. */
export type ComputationNode =
  | { kind: 'input'; metric: string }
  | { kind: 'constant'; value: number }
  | { kind: 'binary'; operator: MetricFormula['operator']; left: ComputationNode; right: ComputationNode };

export interface DerivedComputation {
  /** Output column name for the computed value. */
  alias: string;
  /** Deterministic computation tree over physical input aliases. */
  expression: ComputationNode;
  /** Physical select aliases this computation reads (flat, for convenience). */
  inputs: readonly string[];
}

export interface SemanticResolution {
  query: Query;
  /** Deterministic computations derived from formula metrics, in select order. */
  computations: readonly DerivedComputation[];
}

function metricPhysicalSelect(metric: MetricDefinition, alias?: string): SelectExpression {
  return {
    field: { entity: metric.entity, field: metric.expression.field },
    aggregate: metric.expression.aggregate,
    alias: alias ?? metric.name
  };
}

/**
 * Builds the deterministic computation tree for a formula metric and
 * records the physical input aliases it depends on. Nested derived
 * metrics expand recursively; cycles fail closed.
 */
function buildComputationTree(
  metric: MetricDefinition,
  catalog: SemanticCatalog,
  inputs: string[],
  visited: readonly string[]
): ComputationNode {
  if (visited.includes(metric.name)) {
    throw new SemanticResolutionError(`Circular metric definition detected: ${visited.join(' -> ')} -> ${metric.name}`);
  }
  if (!metric.formula) {
    if (!inputs.includes(metric.name)) inputs.push(metric.name);
    return { kind: 'input', metric: metric.name };
  }

  const childVisited = [...visited, metric.name];
  const operandNode = (operand: MetricOperand): ComputationNode => {
    if ('constant' in operand) return { kind: 'constant', value: operand.constant };
    const dependency = catalog.getMetric(operand.metric);
    if (!dependency) throw new SemanticResolutionError(`Unknown semantic metric: ${operand.metric}`);
    return buildComputationTree(dependency, catalog, inputs, childVisited);
  };

  return {
    kind: 'binary',
    operator: metric.formula.operator,
    left: operandNode(metric.formula.left),
    right: operandNode(metric.formula.right)
  };
}

function resolveSelectExpressions(
  query: SemanticQuery | Query,
  catalog: SemanticCatalog
): { selects: SelectExpression[]; computations: DerivedComputation[] } {
  const selects: SelectExpression[] = [];
  const computations: DerivedComputation[] = [];

  for (const expression of query.select) {
    if ('field' in expression) {
      selects.push(expression);
      continue;
    }

    if (expression.semantic.kind === 'metric') {
      const metric = catalog.findMetric(expression.semantic.name);
      if (!metric) throw new SemanticResolutionError(`Unknown semantic metric: ${expression.semantic.name}`);

      if (!metric.formula) {
        selects.push(metricPhysicalSelect(metric, expression.alias));
        continue;
      }

      const inputs: string[] = [];
      const expressionTree = buildComputationTree(metric, catalog, inputs, []);
      for (const inputName of inputs) {
        const input = catalog.getMetric(inputName);
        if (!input) throw new SemanticResolutionError(`Unknown semantic metric: ${inputName}`);
        selects.push(metricPhysicalSelect(input));
      }
      computations.push({
        alias: expression.alias ?? metric.name,
        expression: expressionTree,
        inputs: [...inputs]
      });
      continue;
    }

    const dimension = catalog.findDimension(expression.semantic.name);
    if (!dimension) throw new SemanticResolutionError(`Unknown semantic dimension: ${expression.semantic.name}`);
    selects.push({
      field: { entity: dimension.entity, field: dimension.field },
      alias: expression.alias ?? dimension.name
    });
  }

  return { selects, computations };
}

/** Metric-level filters that must be AND-merged into the physical query. */
function metricFilters(query: SemanticQuery | Query, catalog: SemanticCatalog): Filter[] {
  const filters: Filter[] = [];
  for (const expression of query.select) {
    if (!('semantic' in expression) || expression.semantic.kind !== 'metric') continue;
    const metric = catalog.findMetric(expression.semantic.name);
    if (!metric) throw new SemanticResolutionError(`Unknown semantic metric: ${expression.semantic.name}`);
    if (metric.expression.filter) filters.push(...metric.expression.filter);
  }
  return filters;
}

export function resolveSemanticSelect(
  expression: Exclude<QuerySelectExpression, SelectExpression>,
  catalog: SemanticCatalog
): SelectExpression {
  if (expression.semantic.kind === 'metric') {
    const metric = catalog.findMetric(expression.semantic.name);
    if (!metric) throw new SemanticResolutionError(`Unknown semantic metric: ${expression.semantic.name}`);
    return metricPhysicalSelect(metric, expression.alias);
  }
  const dimension = catalog.findDimension(expression.semantic.name);
  if (!dimension) throw new SemanticResolutionError(`Unknown semantic dimension: ${expression.semantic.name}`);
  return {
    field: { entity: dimension.entity, field: dimension.field },
    alias: expression.alias ?? dimension.name
  };
}

/** Resolves a SemanticQuery into a physical Query (no computation descriptors). */
export function resolveSemanticQuery(
  query: SemanticQuery | Query,
  catalog: SemanticCatalog
): Query {
  return resolveSemanticQueryDetailed(query, catalog).query;
}

/**
 * Full resolution including deterministic computation descriptors for
 * formula-based (derived) metrics. The caller (agent or plan executor)
 * applies computations to the normalized result after execution.
 */
export function resolveSemanticQueryDetailed(
  query: SemanticQuery | Query,
  catalog: SemanticCatalog
): SemanticResolution {
  const { selects, computations } = resolveSelectExpressions(query, catalog);

  const mergedFilters: Filter[] = [...(query.filters ?? []), ...metricFilters(query, catalog)];

  return {
    query: {
      version: query.version,
      source: query.source,
      select: selects,
      joins: query.joins,
      filters: mergedFilters.length > 0 ? mergedFilters : undefined,
      groupBy: query.groupBy,
      having: query.having,
      orderBy: query.orderBy,
      limit: query.limit,
      offset: query.offset
    },
    computations
  };
}

/** Type-only re-export used by the formula computation descriptor. */
export type { MetricOperand };
