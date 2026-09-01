import { describe, expect, it } from 'vitest';
import {
  capabilityAllowed,
  computeQueryComplexity,
  forcedFiltersFor,
  mergePolicies,
  validatePolicy,
  validateQuery,
  QueryValidationError
} from '../src/index.js';

describe('QueryPolicy validation', () => {
  it('rejects malformed policies fail-closed', () => {
    expect(() => validatePolicy({ maxRows: -1 })).toThrow(QueryValidationError);
    expect(() => validatePolicy({ maxComplexity: 0 })).toThrow(QueryValidationError);
    expect(() => validatePolicy({ timeoutMs: 'x' as unknown as number })).toThrow(QueryValidationError);
    expect(() => validatePolicy({ allowedOperators: ['explode' as never] })).toThrow(/unknown operator/);
    expect(() => validatePolicy({ allowedAggregates: ['median' as never] })).toThrow(/unknown aggregate/);
    expect(() => validatePolicy({ allowedJoinTypes: ['outer' as never] })).toThrow(/unknown join type/);
    expect(() => validatePolicy({ allowedCapabilities: ['write'] })).toThrow(/unknown capability/);
  });

  it('accepts well-formed policies', () => {
    expect(() =>
      validatePolicy({ allowedEntities: ['orders'], maxRows: 100, allowedCapabilities: ['read', 'aggregate'] })
    ).not.toThrow();
  });

  it('enforces allowed operators, aggregates, and join types during validation', () => {
    const query = {
      source: { name: 'orders' },
      select: [
        { field: { field: 'amount' }, aggregate: 'sum' as const },
        { field: { field: 'id' } }
      ],
      filters: [{ field: { field: 'status' }, operator: 'eq' as const, value: 'completed' }],
      joins: [
        {
          entity: { name: 'accounts' },
          type: 'inner' as const,
          on: { left: { field: 'account_id' }, right: { entity: 'accounts', field: 'id' } }
        }
      ]
    };

    expect(() => validateQuery(query, { allowedOperators: ['gt'] })).toThrow(/operator is not allowed/);
    expect(() => validateQuery(query, { allowedAggregates: ['count'] })).toThrow(/Aggregate is not allowed/);
    expect(() => validateQuery(query, { allowedJoinTypes: ['left'] })).toThrow(/Join type is not allowed/);
    expect(() => validateQuery(query, {})).not.toThrow();
  });

  it('enforces maxComplexity with a deterministic score', () => {
    const query = {
      source: { name: 'orders' },
      select: [{ field: { field: 'a' } }, { field: { field: 'b' } }, { field: { field: 'c' } }],
      filters: [{ field: { field: 'x' }, operator: 'eq' as const, value: 1 }],
      joins: []
    };
    expect(computeQueryComplexity(query)).toBe(4);

    const withJoin = {
      ...query,
      joins: [
        {
          entity: { name: 'accounts' },
          type: 'inner' as const,
          on: { left: { field: 'account_id' }, right: { field: 'id' } }
        }
      ]
    };
    expect(computeQueryComplexity(withJoin)).toBe(6);

    expect(() => validateQuery(withJoin, { maxComplexity: 5 })).toThrow(/complexity 6 exceeds/);
    expect(() => validateQuery(withJoin, { maxComplexity: 6 })).not.toThrow();
  });

  it('exposes forced filters and capability checks', () => {
    const policy = {
      forcedFilters: { orders: [{ field: { field: 'tenant_id' }, operator: 'eq' as const, value: 42 }] },
      allowedCapabilities: ['read']
    };
    expect(forcedFiltersFor(policy, 'orders')).toHaveLength(1);
    expect(forcedFiltersFor(policy, 'other')).toEqual([]);
    expect(capabilityAllowed(policy, 'read')).toBe(true);
    expect(capabilityAllowed(policy, 'aggregate')).toBe(false);
    expect(capabilityAllowed({}, 'aggregate')).toBe(true);
  });
});

describe('mergePolicies', () => {
  it('narrows permissions: the overlay can never widen the base', () => {
    const base = { allowedEntities: ['orders', 'customers'], maxRows: 1000, allowedOperators: ['eq', 'gt'] };
    const overlay = { allowedEntities: ['orders', 'invoices'], maxRows: 50 };

    const merged = mergePolicies(base, overlay);
    expect(merged.allowedEntities).toEqual(['orders']);
    expect(merged.maxRows).toBe(50);
    expect(merged.allowedOperators).toEqual(['eq', 'gt']);
  });

  it('unions denied fields and forced filters', () => {
    const merged = mergePolicies(
      { deniedFields: { orders: ['internal_note'] } },
      { deniedFields: { orders: ['audit_flag'], customers: ['password_hash'] } }
    );
    expect(merged.deniedFields?.orders?.sort()).toEqual(['audit_flag', 'internal_note']);
    expect(merged.deniedFields?.customers).toEqual(['password_hash']);
  });

  it('keeps base-only values when the overlay is empty', () => {
    const merged = mergePolicies({ maxRows: 100, timeoutMs: 5000 }, {});
    expect(merged.maxRows).toBe(100);
    expect(merged.timeoutMs).toBe(5000);
  });

  it('rejects queries that an overlay entity removed', () => {
    const merged = mergePolicies({ allowedEntities: ['orders'] }, { allowedEntities: ['customers'] });
    expect(merged.allowedEntities).toEqual([]);
    const query = { source: { name: 'orders' }, select: [{ field: { field: 'id' } }] };
    expect(() => validateQuery(query, merged)).toThrow(/Entity is not allowed/);
  });
});
