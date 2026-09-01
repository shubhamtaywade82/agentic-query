import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertConformanceCase,
  runConformanceSuite,
  validateQuery,
  type ConformanceAdapter,
  type ConformanceProbes,
  type ConformanceSuite,
  type Query,
  type QueryPolicy
} from '../src/index.js';

const suite: ConformanceSuite = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../spec/conformance/v0.2/basic-read.json', import.meta.url)), 'utf8')
) as ConformanceSuite;

/** Probe set over a minimal JSON-shaped compiled representation. */
const compiledShape = (query: unknown, policy?: Record<string, unknown>): Record<string, unknown> => {
  const q = query as {
    source: { name: string };
    select: { field: { entity?: string; field: string }; aggregate?: unknown }[];
    filters?: { field: { entity?: string; field: string } }[];
    orderBy?: { field: { entity?: string; field: string }; direction: 'asc' | 'desc' }[];
    groupBy?: { entity?: string; field: string }[];
    limit?: number;
    offset?: number;
    joins?: { entity: { name: string } }[];
  };
  return {
    source: q.source.name,
    selectedFields: q.select
      .filter((expression) => !(expression as { aggregate?: unknown }).aggregate)
      .map((expression) => expression.field.field),
    filterFields: (q.filters ?? []).map((filter) => filter.field.field),
    orderBy: (q.orderBy ?? []).map((order) => ({
      field: order.field.field,
      direction: order.direction
    })),
    groupByFields: (q.groupBy ?? []).map((field) => field.field),
    limit: q.limit,
    offset: q.offset,
    joinEntities: (q.joins ?? []).map((join) => join.entity.name),
    policyApplied: policy !== undefined
  };
};

const identityProbes: ConformanceProbes = {
  source: (compiled) => (compiled as { source?: string })?.source,
  selectedFields: (compiled) => (compiled as { selectedFields?: readonly string[] })?.selectedFields,
  filterFields: (compiled) => (compiled as { filterFields?: readonly string[] })?.filterFields,
  orderBy: (compiled) => (compiled as { orderBy?: readonly { field: string; direction: 'asc' | 'desc' }[] })?.orderBy,
  limit: (compiled) => (compiled as { limit?: number })?.limit,
  offset: (compiled) => (compiled as { offset?: number })?.offset,
  groupByFields: (compiled) => (compiled as { groupByFields?: readonly string[] })?.groupByFields,
  joinEntities: (compiled) => (compiled as { joinEntities?: readonly string[] })?.joinEntities
};

const identityAdapter: ConformanceAdapter = (query, policy) => {
  // A compliant adapter must enforce policy before compiling.
  validateQuery(query as Query, (policy ?? {}) as QueryPolicy);
  return compiledShape(query, policy);
};

describe('conformance harness', () => {
  it('loads the shared v0.2 fixture with all planned case families', () => {
    expect(suite.version).toBe('0.2');
    const families = new Set(suite.cases.map((testCase) => Object.keys(testCase.expected)));
    expect(suite.cases.length).toBeGreaterThanOrEqual(8);
    expect(families.size).toBeGreaterThan(1);
  });

  it('asserts semantic expectations, not just non-null compilation', () => {
    // A passing adapter must satisfy every probe-checked expectation.
    expect(() => runConformanceSuite(identityAdapter, suite, identityProbes)).not.toThrow();

    // Sabotaged probe: wrong limit must be caught (proves assertions are real).
    const sabotage: ConformanceProbes = {
      ...identityProbes,
      limit: () => 999999
    };
    expect(() => runConformanceSuite(identityAdapter, suite, sabotage)).toThrow(/expected limit/);
  });

  it('fails when an adapter silently rejects a supported case', () => {
    const rejectingAdapter: ConformanceAdapter = () => {
      throw new Error('adapter exploded');
    };
    const supportedCase = suite.cases.find((testCase) => testCase.expected.expectRejection === undefined)!;
    expect(() => assertConformanceCase(rejectingAdapter, supportedCase, identityProbes)).toThrow(/rejected a query/);
  });

  it('verifies rejection messages for policy cases', () => {
    const rejectingAdapter: ConformanceAdapter = () => {
      throw new Error('Entity is not allowed: orders');
    };
    const policyCase = suite.cases.find((testCase) => testCase.expected.expectRejection !== undefined)!;
    expect(() => assertConformanceCase(rejectingAdapter, policyCase, identityProbes)).not.toThrow();

    const wrongMessageAdapter: ConformanceAdapter = () => {
      throw new Error('some unrelated failure');
    };
    expect(() => assertConformanceCase(wrongMessageAdapter, policyCase, identityProbes)).toThrow(/unexpected message/);
  });

  it('fails when an adapter compiles a case that must be rejected', () => {
    const permissiveAdapter: ConformanceAdapter = (query, policy) => compiledShape(query, policy);
    const policyCase = suite.cases.find((testCase) => testCase.expected.expectRejection !== undefined)!;
    expect(() => assertConformanceCase(permissiveAdapter, policyCase, identityProbes)).toThrow(/expected a rejection/);
  });
});
