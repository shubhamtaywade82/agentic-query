export interface MetricDefinition {
  name: string;
  description: string;
  entity: string;
  expression: SelectMetricExpression;
}

export interface DimensionDefinition {
  name: string;
  description: string;
  entity: string;
  field: string;
}

export interface SelectMetricExpression {
  field: string;
  aggregate: 'count' | 'sum' | 'avg' | 'min' | 'max';
  alias?: string;
}

export interface SemanticCatalogDefinition {
  metrics?: readonly MetricDefinition[];
  dimensions?: readonly DimensionDefinition[];
}

export class SemanticCatalog {
  private readonly metricsByName: ReadonlyMap<string, MetricDefinition>;
  private readonly dimensionsByName: ReadonlyMap<string, DimensionDefinition>;

  constructor(definition: SemanticCatalogDefinition = {}) {
    this.metricsByName = new Map((definition.metrics ?? []).map((metric) => [metric.name, metric]));
    this.dimensionsByName = new Map((definition.dimensions ?? []).map((dimension) => [dimension.name, dimension]));
  }

  getMetric(name: string): MetricDefinition | undefined {
    return this.metricsByName.get(name);
  }

  getDimension(name: string): DimensionDefinition | undefined {
    return this.dimensionsByName.get(name);
  }

  search(query: string): SemanticCatalogDefinition {
    const normalized = query.toLowerCase();
    const metrics = [...this.metricsByName.values()].filter((metric) =>
      `${metric.name} ${metric.description} ${metric.entity}`.toLowerCase().includes(normalized)
    );
    const dimensions = [...this.dimensionsByName.values()].filter((dimension) =>
      `${dimension.name} ${dimension.description} ${dimension.entity} ${dimension.field}`.toLowerCase().includes(normalized)
    );

    return { metrics, dimensions };
  }

  toPromptContext(): string {
    const metrics = [...this.metricsByName.values()].map((metric) =>
      `Metric: ${metric.name}\nDefinition: ${metric.description}\nEntity: ${metric.entity}\nExpression: ${metric.expression.aggregate}(${metric.expression.field})`
    );
    const dimensions = [...this.dimensionsByName.values()].map((dimension) =>
      `Dimension: ${dimension.name}\nDefinition: ${dimension.description}\nEntity: ${dimension.entity}\nField: ${dimension.field}`
    );

    return [...metrics, ...dimensions].join('\n\n');
  }
}
