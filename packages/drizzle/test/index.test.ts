import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DrizzleAdapter, DRIZZLE_CAPABILITIES } from '../src/index.js';
import { runDrizzleConformance } from '../src/conformance.js';
import type { ConformanceSuite, Query } from '@agentic-query/core';

const conformanceSuite: ConformanceSuite = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../spec/conformance/v0.2/basic-read.json', import.meta.url)), 'utf8')
) as ConformanceSuite;

const schemaProvider = {
  getEntity: (name: string) => (name === 'orders'
    ? {
        name: 'orders',
        table: 'orders',
        primaryKey: 'id',
        fields: [
          { name: 'id', type: 'integer' },
          { name: 'status', type: 'string' },
          { name: 'amount', type: 'decimal' },
          { name: 'internal_note', type: 'text' }
        ],
        relations: []
      }
    : undefined),
  listEntities: () => [{
    name: 'orders',
    table: 'orders',
    primaryKey: 'id',
    fields: [
      { name: 'id', type: 'integer' },
      { name: 'status', type: 'string' },
      { name: 'amount', type: 'decimal' },
      { name: 'internal_note', type: 'text' }
    ],
    relations: []
  }]
};

/** Host compiler producing a JSON-shaped representation the probes read. */
function hostCompiler() {
  const compile = (query: Query, _policy?: unknown): Record<string, unknown> => {
    const sourceEntity = query.source.name;
    return {
      source: { name: sourceEntity },
      selectedFields: query.select
        .filter((expression) => !expression.aggregate)
        .map((expression) => expression.field.field),
      aggregateFunctions: query.select
        .filter((expression) => expression.aggregate)
        .map((expression) => ({ function: expression.aggregate, field: expression.field.field })),
      filterFields: (query.filters ?? []).map((filter) => filter.field.field),
      orderBy: (query.orderBy ?? []).map((order) => ({
        field: order.field.field,
        direction: order.direction
      })),
      groupByFields: (query.groupBy ?? []).map((field) => field.field),
      limit: query.limit,
      offset: query.offset,
      joinEntities: (query.joins ?? []).map((join) => join.entity.name)
    };
  };
  return compile;
}

describe('DrizzleAdapter', () => {
  it('delegates compilation and execution to application-owned functions', async () => {
    const calls: unknown[] = [];
    const adapter = new DrizzleAdapter({
      schemaProvider,
      compile: (query, policy) => {
        calls.push(policy);
        return { query, policy, compiled: true };
      },
      execute: async (compiled) => ({ executed: compiled })
    });

    const query = {
      source: { name: 'orders' },
      select: [{ field: { entity: 'orders', field: 'id' } }],
      limit: 10
    } as const;

    const policy = { allowedEntities: ['orders'], maxRows: 10 };
    const compiled = adapter.compile(query, policy);
    expect(compiled.compiled).toBe(true);
    expect(calls).toEqual([policy]);
    await expect(adapter.execute(compiled)).resolves.toMatchObject({ executed: { compiled: true } });
  });

  it('validates the AST before host compilation and rejects policy violations', () => {
    const compileCalls: unknown[] = [];
    const adapter = new DrizzleAdapter({
      schemaProvider,
      compile: (query) => {
        compileCalls.push(query);
        return {};
      },
      execute: () => []
    });

    const denied = {
      source: { name: 'orders' },
      select: [{ field: { entity: 'orders', field: 'internal_note' } }]
    };

    expect(() => adapter.compile(denied, { deniedFields: { orders: ['internal_note'] } })).toThrow(
      /Field is not allowed/
    );
    expect(compileCalls).toHaveLength(0); // host compiler never sees the query
  });

  it('fails closed for HAVING predicates per capability declaration', () => {
    const adapter = new DrizzleAdapter({
      schemaProvider,
      compile: () => ({}),
      execute: () => []
    });

    const query = {
      source: { name: 'orders' },
      select: [{ field: { entity: 'orders', field: 'amount' }, aggregate: 'sum' }],
      groupBy: [{ entity: 'orders', field: 'status' }],
      having: [{ field: { entity: 'orders', field: 'amount' }, operator: 'gt', value: 10 }]
    };

    expect(() => adapter.compile(query)).toThrow(/HAVING/);
  });

  it('exposes fail-closed capability metadata', () => {
    const having = DRIZZLE_CAPABILITIES.find((capability) => capability.capability === 'having');
    expect(having).toMatchObject({ supported: false, mode: 'fail-closed' });
    for (const capability of DRIZZLE_CAPABILITIES) {
      expect(capability.mode).toBe('fail-closed');
    }
  });

  it('normalizes executed rows through the shared result contract', () => {
    const adapter = new DrizzleAdapter({
      schemaProvider,
      compile: () => ({}),
      execute: () => []
    });

    const normalized = adapter.normalizeResult([{ id: 1 }, { id: 2 }], { source: 'drizzle' });
    expect(normalized.rowCount).toBe(2);
    expect(normalized.columns.map((column) => column.name)).toEqual(['id']);
    expect(normalized.metadata.source).toBe('drizzle');
  });

  it('passes the shared cross-ORM conformance fixtures', () => {
    runDrizzleConformance({ schemaProvider, compile: hostCompiler(), execute: () => [] }, conformanceSuite);
  });
});
