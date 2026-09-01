import { describe, expect, it } from 'vitest';
import {
  SemanticCatalog,
  resolveSemanticQuery,
  type SemanticQuery
} from '../src/index.js';

describe('SemanticQuery v0.2 resolution', () => {
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

  it('resolves a semantic metric into a physical aggregate', () => {
    const query: SemanticQuery = {
      source: { name: 'orders' },
      select: [{ semantic: { kind: 'metric', name: 'revenue' } }]
    };

    expect(resolveSemanticQuery(query, catalog)).toEqual({
      source: { name: 'orders' },
      select: [{ field: { entity: 'orders', field: 'amount' }, aggregate: 'sum', alias: 'revenue' }],
      joins: undefined,
      filters: undefined,
      groupBy: undefined,
      having: undefined,
      orderBy: undefined,
      limit: undefined,
      offset: undefined
    });
  });

  it('resolves a semantic dimension into a physical field', () => {
    const query: SemanticQuery = {
      source: { name: 'orders' },
      select: [{ semantic: { kind: 'dimension', name: 'order_status' } }]
    };

    expect(resolveSemanticQuery(query, catalog).select[0]).toEqual({
      field: { entity: 'orders', field: 'status' },
      alias: 'order_status'
    });
  });
});
