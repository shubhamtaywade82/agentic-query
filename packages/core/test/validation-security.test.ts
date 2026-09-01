import { describe, expect, it } from 'vitest';
import { QueryValidationError, validateQuery, type Query } from '../src/index.js';

const baseQuery = (): Query => ({
  source: { name: 'orders' },
  select: [{ field: { entity: 'orders', field: 'id' } }]
});

describe('query validation security', () => {
  it('rejects semantic-shaped expressions at the physical validator boundary', () => {
    expect(() => validateQuery({
      ...baseQuery(),
      select: [{ field: undefined as never }]
    })).toThrow(QueryValidationError);
  });

  it('rejects malformed pagination', () => {
    expect(() => validateQuery({ ...baseQuery(), limit: 0 })).toThrow(QueryValidationError);
    expect(() => validateQuery({ ...baseQuery(), offset: -1 })).toThrow(QueryValidationError);
  });

  it('rejects unsafe oversized limits', () => {
    expect(() => validateQuery({ ...baseQuery(), limit: 10001 })).toThrow(QueryValidationError);
  });

  it('rejects denied fields even when the entity is allowed', () => {
    expect(() => validateQuery(baseQuery(), {
      allowedEntities: ['orders'],
      deniedFields: { orders: ['id'] }
    })).toThrow(/Field is not allowed/);
  });

  it('rejects unapproved join types', () => {
    expect(() => validateQuery({
      ...baseQuery(),
      joins: [{
        entity: { name: 'users' },
        type: 'cross' as never,
        on: {
          left: { entity: 'orders', field: 'user_id' },
          right: { entity: 'users', field: 'id' }
        }
      }]
    })).toThrow(QueryValidationError);
  });

  it('rejects malformed between filters', () => {
    expect(() => validateQuery({
      ...baseQuery(),
      filters: [{
        field: { entity: 'orders', field: 'amount' },
        operator: 'between',
        values: [1]
      }]
    })).toThrow(QueryValidationError);
  });
});
