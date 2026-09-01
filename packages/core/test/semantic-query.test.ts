import { describe, expect, it } from 'vitest';
import {
  SemanticCatalog,
  resolveSemanticSelect,
  resolveSemanticQuery,
  type Query
} from '../src/index.js';

describe('semantic query resolution', () => {
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

  it('resolves a metric to a trusted physical expression', () => {
    expect(resolveSemanticSelect({ semantic: { kind: 'metric', name: 'revenue' } }, catalog)).toEqual({
      field: { entity: 'orders', field: 'amount' },
      aggregate: 'sum',
      alias: 'revenue'
    });
  });

  it('resolves a dimension to a physical field', () => {
    expect(resolveSemanticSelect({ semantic: { kind: 'dimension', name: 'order_status' } }, catalog)).toEqual({
      field: { entity: 'orders', field: 'status' },
      alias: 'order_status'
    });
  });

  it('preserves physical Query AST objects during v0.2 transition', () => {
    const query: Query = {
      source: { name: 'orders' },
      select: [{ field: { entity: 'orders', field: 'amount' }, aggregate: 'sum' }]
    };

    expect(resolveSemanticQuery(query, catalog)).toEqual(query);
  });

  it('rejects unknown semantic names', () => {
    expect(() => resolveSemanticSelect({ semantic: { kind: 'metric', name: 'missing' } }, catalog))
      .toThrow('Unknown semantic metric: missing');
  });
});
