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
      filters: [
        {
          field: { field: 'status' },
          operator: 'eq',
          value: 'completed'
        }
      ],
      orderBy: [
        { field: { field: 'id' }, direction: 'desc' }
      ],
      limit: 10
    });

    expect(result).toEqual({
      model: 'order',
      args: {
        select: { id: true, customerId: true },
        where: { status: 'completed' },
        orderBy: [{ id: 'desc' }],
        take: 10
      }
    });
  });

  it('rejects unregistered models', () => {
    expect(() => adapter.compile({
      source: { name: 'users' },
      select: [{ field: { field: 'id' } }]
    })).toThrow('Prisma model is not registered');
  });

  it('rejects unsupported aggregate compilation', () => {
    expect(() => adapter.compile({
      source: { name: 'orders' },
      select: [{
        field: { field: 'amount' },
        aggregate: 'sum'
      }]
    })).toThrow('Aggregate selection requires the Prisma aggregate API');
  });
});
