/**
 * Semantic layer (plan §6).
 *
 * Metrics and dimensions are trusted, versioned definitions with physical
 * lineage. Resolution into a physical Query AST happens exclusively in
 * `semantic-query.ts` — model output can only reference semantic names,
 * never physical expressions.
 */
import { AGGREGATES, QueryValidationError, type Aggregate, type Filter } from './ast.js';

export type MetricOperand =
  | { metric: string }
  | { constant: number };

export interface MetricFormula {
  /** Deterministic binary operation over two operands. */
  operator: 'divide' | 'multiply' | 'add' | 'subtract';
  left: MetricOperand;
  right: MetricOperand;
}

export interface SelectMetricExpression {
  field: string;
  aggregate: Aggregate;
  alias?: string;
  /** Metric-level filter applied during resolution (e.g. `status: completed`). */
  filter?: readonly Filter[];
}

export interface MetricDefinition {
  name: string;
  description: string;
  entity: string;
  /** Physical lineage: aggregate over a physical field. */
  expression: SelectMetricExpression;
  /** Deterministic formula over other metrics (derived metric). */
  formula?: MetricFormula;
  /** Minimum time grain the metric supports, e.g. `day`. */
  timeGrain?: string;
  /** Unit label, e.g. `USD` or `percent`. */
  units?: string;
  /** Alternative names accepted in natural language. */
  synonyms?: readonly string[];
  /** Catalog-defined semantic version of this metric. */
  version?: string;
  /** Owning team or individual. */
  owner?: string;
}

export interface DimensionDefinition {
  name: string;
  description: string;
  entity: string;
  field: string;
  timeGrain?: string;
  units?: string;
  synonyms?: readonly string[];
  version?: string;
  owner?: string;
}

export interface SemanticCatalogDefinition {
  version?: string;
  metrics?: readonly MetricDefinition[];
  dimensions?: readonly DimensionDefinition[];
}

export class SemanticResolutionError extends QueryValidationError {
  override readonly code = 'SEMANTIC_RESOLUTION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'SemanticResolutionError';
  }
}

function collectFormulaDependencies(operand: MetricOperand): readonly string[] {
  if ('metric' in operand) return [operand.metric];
  return [];
}

function findCycle(
  name: string,
  definitions: ReadonlyMap<string, MetricDefinition>,
  visiting: readonly string[]
): readonly string[] | undefined {
  if (visiting.includes(name)) return [...visiting, name];
  const metric = definitions.get(name);
  if (!metric?.formula) return undefined;
  for (const dependency of [...collectFormulaDependencies(metric.formula.left), ...collectFormulaDependencies(metric.formula.right)]) {
    const cycle = findCycle(dependency, definitions, [...visiting, name]);
    if (cycle) return cycle;
  }
  return undefined;
}

/**
 * Immutable, validated semantic catalog. Every mutation path returns a new
 * catalog with a bumped revision so downstream caches keyed on
 * `revision`/`version` invalidate deterministically.
 */
export class SemanticCatalog {
  readonly version: string;
  /** Monotonic revision; bumps whenever definitions change. */
  readonly revision: number;

  private readonly metricsByName: ReadonlyMap<string, MetricDefinition>;
  private readonly dimensionsByName: ReadonlyMap<string, DimensionDefinition>;

  constructor(definition: SemanticCatalogDefinition = {}, revision = 1) {
    this.version = definition.version ?? '0';
    this.revision = revision;
    this.metricsByName = new Map((definition.metrics ?? []).map((metric) => [metric.name, metric]));
    this.dimensionsByName = new Map((definition.dimensions ?? []).map((dimension) => [dimension.name, dimension]));
    this.validateDefinitions();
  }

  getMetric(name: string): MetricDefinition | undefined {
    return this.metricsByName.get(name);
  }

  getDimension(name: string): DimensionDefinition | undefined {
    return this.dimensionsByName.get(name);
  }

  /** Looks up a metric by canonical name or synonym. */
  findMetric(name: string): MetricDefinition | undefined {
    return (
      this.metricsByName.get(name) ??
      [...this.metricsByName.values()].find((metric) => (metric.synonyms ?? []).includes(name))
    );
  }

  findDimension(name: string): DimensionDefinition | undefined {
    return (
      this.dimensionsByName.get(name) ??
      [...this.dimensionsByName.values()].find((dimension) => (dimension.synonyms ?? []).includes(name))
    );
  }

  listMetrics(): readonly MetricDefinition[] {
    return [...this.metricsByName.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  listDimensions(): readonly DimensionDefinition[] {
    return [...this.dimensionsByName.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  /** Deterministic search over names, descriptions, synonyms, lineage. */
  search(query: string): SemanticCatalogDefinition {
    const normalized = query.toLowerCase();
    const matches = (haystack: readonly (string | undefined)[]): boolean =>
      haystack.filter((part): part is string => Boolean(part)).join(' ').toLowerCase().includes(normalized);

    const metrics = [...this.metricsByName.values()].filter((metric) =>
      matches([metric.name, metric.description, metric.entity, metric.units, ...(metric.synonyms ?? [])])
    );
    const dimensions = [...this.dimensionsByName.values()].filter((dimension) =>
      matches([dimension.name, dimension.description, dimension.entity, dimension.field, dimension.units, ...(dimension.synonyms ?? [])])
    );

    return { version: this.version, metrics, dimensions };
  }

  /** Returns a new catalog with additional definitions (cache invalidation by revision bump). */
  withDefinitions(definition: SemanticCatalogDefinition): SemanticCatalog {
    const merged: SemanticCatalogDefinition = {
      version: definition.version ?? this.version,
      metrics: [...this.listMetrics().filter((metric) => !(definition.metrics ?? []).some((m) => m.name === metric.name)), ...(definition.metrics ?? [])],
      dimensions: [...this.listDimensions().filter((dimension) => !(definition.dimensions ?? []).some((d) => d.name === dimension.name)), ...(definition.dimensions ?? [])]
    };
    return new SemanticCatalog(merged, this.revision + 1);
  }

  toPromptContext(): string {
    const metrics = this.listMetrics().map((metric) => {
      const lineage = metric.formula
        ? `Formula: ${metric.formula.operator}(${this.renderOperand(metric.formula.left)}, ${this.renderOperand(metric.formula.right)})`
        : `Expression: ${metric.expression.aggregate}(${metric.expression.field})`;
      return [
        `Metric: ${metric.name}`,
        `Definition: ${metric.description}`,
        `Entity: ${metric.entity}`,
        lineage,
        ...(metric.timeGrain ? [`Time grain: ${metric.timeGrain}`] : []),
        ...(metric.units ? [`Units: ${metric.units}`] : []),
        ...(metric.synonyms?.length ? [`Synonyms: ${metric.synonyms.join(', ')}`] : []),
        ...(metric.version ? [`Version: ${metric.version}`] : []),
        ...(metric.owner ? [`Owner: ${metric.owner}`] : [])
      ].join('\n');
    });

    const dimensions = this.listDimensions().map((dimension) =>
      [
        `Dimension: ${dimension.name}`,
        `Definition: ${dimension.description}`,
        `Entity: ${dimension.entity}`,
        `Field: ${dimension.field}`,
        ...(dimension.timeGrain ? [`Time grain: ${dimension.timeGrain}`] : []),
        ...(dimension.units ? [`Units: ${dimension.units}`] : []),
        ...(dimension.synonyms?.length ? [`Synonyms: ${dimension.synonyms.join(', ')}`] : []),
        ...(dimension.version ? [`Version: ${dimension.version}`] : []),
        ...(dimension.owner ? [`Owner: ${dimension.owner}`] : [])
      ].join('\n')
    );

    return [...metrics, ...dimensions].join('\n\n');
  }

  private renderOperand(operand: MetricOperand): string {
    return 'metric' in operand ? operand.metric : String(operand.constant);
  }

  private validateDefinitions(): void {
    for (const metric of this.metricsByName.values()) {
      if (!metric.name || typeof metric.name !== 'string') {
        throw new SemanticResolutionError('Metric name must be a non-empty string');
      }
      if (!metric.entity || typeof metric.entity !== 'string') {
        throw new SemanticResolutionError(`Metric ${metric.name} must declare an entity`);
      }
      if (!AGGREGATES.includes(metric.expression?.aggregate)) {
        throw new SemanticResolutionError(`Metric ${metric.name} has an unsupported aggregate: ${String(metric.expression?.aggregate)}`);
      }
      if (!metric.expression?.field || typeof metric.expression.field !== 'string') {
        throw new SemanticResolutionError(`Metric ${metric.name} must declare a physical field`);
      }
      for (const filter of metric.expression.filter ?? []) {
        if (!filter?.field || typeof filter.field.field !== 'string') {
          throw new SemanticResolutionError(`Metric ${metric.name} has an invalid metric-level filter`);
        }
      }
      if (metric.formula) {
        const operands = [metric.formula.left, metric.formula.right];
        for (const operand of operands) {
          if (('metric' in operand && typeof operand.metric !== 'string') || ('constant' in operand && typeof operand.constant !== 'number')) {
            throw new SemanticResolutionError(`Metric ${metric.name} has a malformed formula`);
          }
        }
      }
    }

    for (const dimension of this.dimensionsByName.values()) {
      if (!dimension.name || typeof dimension.name !== 'string') {
        throw new SemanticResolutionError('Dimension name must be a non-empty string');
      }
      if (!dimension.entity || !dimension.field) {
        throw new SemanticResolutionError(`Dimension ${dimension.name} must declare an entity and field`);
      }
      if (this.metricsByName.has(dimension.name)) {
        throw new SemanticResolutionError(`Name is claimed by both a metric and a dimension: ${dimension.name}`);
      }
    }

    for (const name of this.metricsByName.keys()) {
      const cycle = findCycle(name, this.metricsByName, []);
      if (cycle) {
        throw new SemanticResolutionError(`Circular metric definition detected: ${cycle.join(' -> ')}`);
      }
    }
  }
}
