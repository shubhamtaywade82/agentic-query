import { describe, expect, it } from 'vitest';
import { PrismaAdapter } from '../src/index.js';

describe('PrismaAdapter', () => {
  const adapter = new PrismaAdapter({
    models: { orders: 'order' },
    fields: { orders: { customer_id: 'customerId' } }
  });

  it('compiles a constrained read query', () => {
    const result = adapter.compile({
      source: { name: 'orders' },
      select: [
        { field: { field: 'id' } },
        { field: { field: 'customer_id' } }
      ],
      filters: [{ field: { field: 'status' }, operator: 'eq', value: 'completed' }],
      orderBy: [{ field: { field: 'id' }, direction: 'desc' }],
      limit: 10
    });

    expect(result).toEqual({
      model: 'order',
      operation: 'findMany',
      args: {
        select: { id: true, customerId: true },
        where: { status: 'completed' },
        orderBy: [{ id: 'desc' }],
        take: 10
      }
    });
  });

  it('compiles a grouped query with native groupBy', () => {
    const result = adapter.compile({
      source: { name: 'orders' },
      select: [{ field: { field: 'status' } }, { field: { field: 'id' }, aggregate: 'count' }],
      groupBy: [{ field: 'status' }]
    });

    expect(result.operation).toBe('groupBy');
    expect(result.args).toMatchObject({ by: ['status'] });
  });

  it('compiles a native aggregate query', () => {
    const result = adapter.compile({
      source: { name: 'orders' },
      select: [{ field: { field: 'amount' }, aggregate: 'sum' }],
      filters: [{ field: { field: 'status' }, operator: 'eq', value: 'completed' }]
    });

    expect(result.operation).toBe('aggregate');
    expect(result.args.where).toEqual({ status: 'completed' });
  });

  it('rejects unregistered models', () => {
    expect(() => adapter.compile({ source: { name: 'users' }, select: [{ field: { field: 'id' } }] }))
      .toThrow('Prisma model is not registered');
  });

  it('enforces core policy before compilation', () => {
    expect(() => adapter.compile({
      source: { name: 'orders' },
      select: [{ field: { field: 'amount' } }],
      limit: 50
    }, { maxRows: 10 })).toThrow('Query limit exceeds policy maximum');
  });
});
