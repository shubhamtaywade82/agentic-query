import { describe, expect, it } from 'vitest';
import type { Query } from './src-placeholder.js';

const validQuery: Query = {
  source: { name: 'orders' },
  select: [
    { field: { entity: 'orders', field: 'customer_id' } },
    { field: { entity: 'orders', field: 'amount' }, aggregate: 'sum', alias: 'revenue' }
  ],
  filters: [
    {
      field: { entity: 'orders', field: 'status' },
      operator: 'eq',
      value: 'completed'
    }
  ],
  groupBy: [{ entity: 'orders', field: 'customer_id' }],
  orderBy: [{ field: { entity: 'orders', field: 'amount' }, direction: 'desc' }],
  limit: 10
};

describe('Query AST v0.1 conformance', () => {
  it('defines a representative analytical query shape', () => {
    expect(validQuery.source.name).toBe('orders');
    expect(validQuery.select).toHaveLength(2);
    expect(validQuery.groupBy).toHaveLength(1);
    expect(validQuery.limit).toBe(10);
  });
});
