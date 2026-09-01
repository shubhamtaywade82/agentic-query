import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaAdapter, PrismaExecutor } from '../src/index.js';
import { runPrismaConformance } from '../src/conformance.js';
import type { ConformanceSuite } from '@agentic-query/core';

const conformanceSuite: ConformanceSuite = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../spec/conformance/v0.2/basic-read.json', import.meta.url)), 'utf8')
) as ConformanceSuite;

const prismaOptions = {
  models: { orders: 'Order', accounts: 'Account' },
  fields: {},
  relations: { orders: { accounts: 'account' } }
};

describe('PrismaAdapter', () => {
  it('compiles findMany with projection, filters, ordering, pagination', () => {
    const adapter = new PrismaAdapter({ models: { orders: 'Order' } });

    const compiled = adapter.compile({
      source: { name: 'orders' },
      select: [
        { field: { entity: 'orders', field: 'id' } },
        { field: { entity: 'orders', field: 'status' } }
      ],
      filters: [{ field: { entity: 'orders', field: 'status' }, operator: 'eq', value: 'completed' }],
      orderBy: [{ field: { entity: 'orders', field: 'id' }, direction: 'desc' }],
      limit: 10,
      offset: 20
    });

    expect(compiled.operation).toBe('findMany');
    expect(compiled.args).toEqual({
      select: { id: true, status: true },
      where: { status: 'completed' },
      orderBy: [{ id: 'desc' }],
      take: 10,
      skip: 20
    });
  });

  it('compiles aggregates without double-nesting (regression)', () => {
    const adapter = new PrismaAdapter({ models: { orders: 'Order' } });

    const compiled = adapter.compile({
      source: { name: 'orders' },
      select: [
        { field: { entity: 'orders', field: 'amount' }, aggregate: 'sum', alias: 'total' },
        { field: { entity: 'orders', field: 'id' }, aggregate: 'count' }
      ]
    });

    expect(compiled.operation).toBe('aggregate');
    // The bug previously produced { _sum: { _sum: {...} } } and `_sum_count`.
    expect(compiled.args).toEqual({
      _sum: { amount: true },
      _count: { id: true }
    });
  });

  it('compiles groupBy with aggregates at the top level', () => {
    const adapter = new PrismaAdapter({ models: { orders: 'Order' } });

    const compiled = adapter.compile({
      source: { name: 'orders' },
      select: [
        { field: { entity: 'orders', field: 'status' } },
        { field: { entity: 'orders', field: 'amount' }, aggregate: 'sum', alias: 'revenue' }
      ],
      groupBy: [{ entity: 'orders', field: 'status' }]
    });

    expect(compiled.operation).toBe('groupBy');
    expect(compiled.args).toMatchObject({
      by: ['status'],
      _sum: { amount: true }
    });
  });

  it('compiles relation-aware nested reads for registered relations', () => {
    const adapter = new PrismaAdapter(prismaOptions);

    const compiled = adapter.compile({
      source: { name: 'orders' },
      select: [
        { field: { entity: 'orders', field: 'id' } },
        { field: { entity: 'accounts', field: 'name' } }
      ],
      joins: [
        {
          entity: { name: 'accounts' },
          type: 'inner',
          on: { left: { entity: 'orders', field: 'account_id' }, right: { entity: 'accounts', field: 'id' } }
        }
      ],
      filters: [
        { field: { entity: 'orders', field: 'status' }, operator: 'eq', value: 'completed' },
        { field: { entity: 'accounts', field: 'region' }, operator: 'eq', value: 'EU' }
      ]
    });

    expect(compiled.operation).toBe('findMany');
    expect(compiled.args).toEqual({
      select: { id: true },
      where: { status: 'completed' },
      include: {
        account: {
          where: { region: 'EU' },
          select: { name: true }
        }
      }
    });
  });

  it('fails closed for unregistered relation joins', () => {
    const adapter = new PrismaAdapter({ models: { orders: 'Order' } });

    expect(() =>
      adapter.compile({
        source: { name: 'orders' },
        select: [{ field: { entity: 'orders', field: 'id' } }],
        joins: [
          {
            entity: { name: 'accounts' },
            type: 'inner',
            on: { left: { entity: 'orders', field: 'account_id' }, right: { entity: 'accounts', field: 'id' } }
          }
        ]
      })
    ).toThrow(/relation mapping/);
  });

  it('rejects unregistered models', () => {
    const adapter = new PrismaAdapter({ models: { orders: 'Order' } });

    expect(() =>
      adapter.compile({ source: { name: 'unknown' }, select: [{ field: { field: 'id' } }] })
    ).toThrow(/not registered/);
  });

  it('rejects limits above maxRows and bounds take when no limit is set', () => {
    const adapter = new PrismaAdapter({ models: { orders: 'Order' } });

    // Oversized limits fail closed during validation.
    expect(() =>
      adapter.compile(
        {
          source: { name: 'orders' },
          select: [{ field: { entity: 'orders', field: 'amount' } }],
          limit: 500
        },
        { maxRows: 100 }
      )
    ).toThrow(/exceeds policy maximum/);

    // Without an explicit limit, take is bounded by policy maxRows.
    const bounded = adapter.compile(
      {
        source: { name: 'orders' },
        select: [{ field: { entity: 'orders', field: 'amount' } }],
        filters: [{ field: { entity: 'orders', field: 'status' }, operator: 'eq', value: 'completed' }]
      },
      {
        maxRows: 100,
        forcedFilters: {
          orders: [{ field: { entity: 'orders', field: 'tenant_id' }, operator: 'eq', value: 42 }]
        }
      }
    );

    expect(bounded.args.take).toBe(100);
    expect(bounded.args.where).toEqual({
      status: 'completed',
      tenant_id: 42
    });
  });

  it('fails closed for HAVING predicates until an aggregate-aware API exists', () => {
    const adapter = new PrismaAdapter({ models: { orders: 'Order' } });

    expect(() =>
      adapter.compile({
        source: { name: 'orders' },
        select: [
          { field: { entity: 'orders', field: 'status' } },
          { field: { entity: 'orders', field: 'amount' }, aggregate: 'sum', alias: 'revenue' }
        ],
        groupBy: [{ entity: 'orders', field: 'status' }],
        having: [{ field: { entity: 'orders', field: 'amount' }, operator: 'gt', value: 100 }]
      })
    ).toThrow(/HAVING requires aggregate-aware/);
  });

  it('rejects aggregates when the policy denies the capability', () => {
    const adapter = new PrismaAdapter({ models: { orders: 'Order' } });

    expect(() =>
      adapter.compile(
        {
          source: { name: 'orders' },
          select: [{ field: { entity: 'orders', field: 'amount' }, aggregate: 'sum' }]
        },
        { allowedCapabilities: ['read', 'filter'] }
      )
    ).toThrow(/capability/);
  });
});

describe('PrismaExecutor', () => {
  it('executes compiled operations against the delegate map', async () => {
    const calls: { model: string; operation: string; args: unknown }[] = [];
    const client = {
      Order: {
        findMany(args: unknown) {
          calls.push({ model: 'Order', operation: 'findMany', args });
          return Promise.resolve([{ id: 1, status: 'completed' }]);
        }
      }
    };
    const executor = new PrismaExecutor(client);

    const result = await executor.execute({
      model: 'Order',
      operation: 'findMany',
      args: { select: { id: true } }
    });

    expect(result).toEqual([{ id: 1, status: 'completed' }]);
    expect(calls).toHaveLength(1);
  });

  it('normalizes findMany and aggregate results deterministically', async () => {
    const client = {
      Order: {
        findMany: () => Promise.resolve([{ id: 1 }, { id: 2 }]),
        aggregate: () => Promise.resolve({ _sum: { amount: 300 } })
      }
    };
    const executor = new PrismaExecutor(client);

    const rows = await executor.executeNormalized({ model: 'Order', operation: 'findMany', args: {} });
    expect(rows.rowCount).toBe(2);
    expect(rows.columns.map((column) => column.name)).toEqual(['id']);

    const aggregate = await executor.executeNormalized({ model: 'Order', operation: 'aggregate', args: {} });
    expect(aggregate.rowCount).toBe(1);
    expect(aggregate.columns.map((column) => column.name)).toEqual(['sum_amount']);
    expect(aggregate.rows[0]).toEqual([300]);
  });

  it('rejects execution of unregistered models', async () => {
    const executor = new PrismaExecutor({});
    await expect(executor.execute({ model: 'Missing', operation: 'findMany', args: {} })).rejects.toThrow(
      /not executable/
    );
  });
});

describe('Prisma conformance suite', () => {
  it('passes every shared fixture with real expectation assertions', () => {
    runPrismaConformance(prismaOptions, conformanceSuite);
  });
});
