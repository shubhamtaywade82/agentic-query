import { describe, expect, it } from 'vitest';
import { SemanticCatalog } from '../src/index.js';

describe('SemanticCatalog', () => {
  it('indexes metric and dimension definitions', () => {
    const catalog = new SemanticCatalog({
      metrics: [
        {
          name: 'revenue',
          description: 'Completed order value',
          entity: 'orders',
          expression: { field: 'amount', aggregate: 'sum' }
        }
      ],
      dimensions: [
        {
          name: 'order_status',
          description: 'Order lifecycle status',
          entity: 'orders',
          field: 'status'
        }
      ]
    });

    expect(catalog.getMetric('revenue')?.expression.aggregate).toBe('sum');
    expect(catalog.getDimension('order_status')?.field).toBe('status');
    expect(catalog.toPromptContext()).toContain('Metric: revenue');
  });

  it('searches definitions without changing the source schema', () => {
    const catalog = new SemanticCatalog({
      metrics: [
        {
          name: 'revenue',
          description: 'Completed order value',
          entity: 'orders',
          expression: { field: 'amount', aggregate: 'sum' }
        },
        {
          name: 'units',
          description: 'Number of purchased units',
          entity: 'line_items',
          expression: { field: 'quantity', aggregate: 'sum' }
        }
      ]
    });

    expect(catalog.search('revenue').metrics.map((metric) => metric.name)).toEqual(['revenue']);
  });
});
