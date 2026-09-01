/**
 * Cross-ORM conformance (plan §12).
 *
 * Shared language-neutral fixtures under `spec/conformance/` are executed
 * by every adapter. `assertConformanceCase` verifies semantic properties
 * of the compiled output through adapter-supplied probes rather than
 * comparing exact SQL strings.
 */
import type { Query } from './ast.js';

export interface ConformanceExpectation {
  source: string;
  selectedFields: readonly string[];
  filterFields?: readonly string[];
  orderBy?: readonly { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
  groupByFields?: readonly string[];
  aggregateFunctions?: readonly { function: string; field: string }[];
  joinEntities?: readonly string[];
  /** Expected rejection: the adapter must throw. */
  expectRejection?: { contains?: string };
}

export interface ConformanceCase {
  name: string;
  query: Query;
  /** Policy to compile with, when the case exercises policy behavior. */
  policy?: Record<string, unknown>;
  expected: ConformanceExpectation;
}

export interface ConformanceSuite {
  version: string;
  cases: readonly ConformanceCase[];
}

/**
 * Adapter probes: capability-specific semantic extractors supplied by each
 * adapter's conformance harness. Returning `undefined` means "not
 * extracted"; the assertion then fails only if the expectation is present.
 */
export interface ConformanceProbes {
  /** Source entity/model the compiled query targets. */
  source?: (compiled: unknown, query: Query) => string | undefined;
  /** Fields projected in the compiled output. */
  selectedFields?: (compiled: unknown, query: Query) => readonly string[] | undefined;
  /** Fields referenced in compiled filter predicates. */
  filterFields?: (compiled: unknown, query: Query) => readonly string[] | undefined;
  /** Compiled ordering clauses. */
  orderBy?: (compiled: unknown, query: Query) => readonly { field: string; direction: 'asc' | 'desc' }[] | undefined;
  /** Compiled row limit; adapters that fold limits into policy may report undefined. */
  limit?: (compiled: unknown, query: Query) => number | undefined;
  /** Compiled row offset. */
  offset?: (compiled: unknown, query: Query) => number | undefined;
  /** Compiled group-by fields. */
  groupByFields?: (compiled: unknown, query: Query) => readonly string[] | undefined;
  /** Aggregate functions with their argument fields. */
  aggregateFunctions?: (compiled: unknown, query: Query) => readonly { function: string; field: string }[] | undefined;
  /** Join targets in the compiled output. */
  joinEntities?: (compiled: unknown, query: Query) => readonly string[] | undefined;
}

export type ConformanceAdapter = (query: Query, policy?: Record<string, unknown>) => unknown;

function sortUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function arraysEqual(actual: readonly string[], expected: readonly string[]): boolean {
  return sortUnique(actual).join('\u0000') === sortUnique(expected).join('\u0000');
}

export function assertConformanceCase(
  adapter: ConformanceAdapter,
  testCase: ConformanceCase,
  probes: ConformanceProbes = {}
): void {
  const expectation = testCase.expected;

  let compiled: unknown;
  try {
    compiled = adapter(testCase.query, testCase.policy);
  } catch (error) {
    if (expectation.expectRejection) {
      const contains = expectation.expectRejection.contains;
      if (contains !== undefined) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes(contains)) {
          throw new Error(
            `Conformance case "${testCase.name}" rejected with an unexpected message: "${message}" (expected to contain "${contains}")`
          );
        }
      }
      return;
    }
    throw new Error(
      `Conformance case "${testCase.name}" failed: adapter rejected a query it must support (${error instanceof Error ? error.message : String(error)})`
    );
  }

  if (compiled === undefined || compiled === null) {
    throw new Error(`Adapter returned no compiled query for case: ${testCase.name}`);
  }

  if (expectation.expectRejection) {
    throw new Error(`Conformance case "${testCase.name}" expected a rejection but the adapter compiled the query`);
  }

  if (probes.source) {
    const actual = probes.source(compiled, testCase.query);
    if (actual !== undefined && actual !== expectation.source) {
      throw new Error(`Conformance case "${testCase.name}" expected source ${expectation.source}, got ${actual}`);
    }
  }

  if (probes.selectedFields && expectation.selectedFields) {
    const actual = probes.selectedFields(compiled, testCase.query);
    if (actual !== undefined && !arraysEqual(actual, expectation.selectedFields)) {
      throw new Error(
        `Conformance case "${testCase.name}" expected selected fields [${expectation.selectedFields.join(', ')}], got [${actual.join(', ')}]`
      );
    }
  }

  if (probes.filterFields && expectation.filterFields) {
    const actual = probes.filterFields(compiled, testCase.query);
    if (actual !== undefined && !arraysEqual(actual, expectation.filterFields)) {
      throw new Error(
        `Conformance case "${testCase.name}" expected filter fields [${expectation.filterFields.join(', ')}], got [${actual.join(', ')}]`
      );
    }
  }

  if (probes.orderBy && expectation.orderBy) {
    const actual = probes.orderBy(compiled, testCase.query);
    if (actual !== undefined) {
      const expectedSorted = [...expectation.orderBy].sort((left, right) => left.field.localeCompare(right.field));
      const actualSorted = [...actual].sort((left, right) => left.field.localeCompare(right.field));
      const same =
        actualSorted.length === expectedSorted.length &&
        actualSorted.every((item, index) => item.field === expectedSorted[index]!.field && item.direction === expectedSorted[index]!.direction);
      if (!same) {
        throw new Error(`Conformance case "${testCase.name}" ordering mismatch: expected ${JSON.stringify(expectedSorted)}, got ${JSON.stringify(actualSorted)}`);
      }
    }
  }

  if (probes.limit && expectation.limit !== undefined) {
    const actual = probes.limit(compiled, testCase.query);
    if (actual !== undefined && actual !== expectation.limit) {
      throw new Error(`Conformance case "${testCase.name}" expected limit ${expectation.limit}, got ${actual}`);
    }
  }

  if (probes.offset && expectation.offset !== undefined) {
    const actual = probes.offset(compiled, testCase.query);
    if (actual !== undefined && actual !== expectation.offset) {
      throw new Error(`Conformance case "${testCase.name}" expected offset ${expectation.offset}, got ${actual}`);
    }
  }

  if (probes.groupByFields && expectation.groupByFields) {
    const actual = probes.groupByFields(compiled, testCase.query);
    if (actual !== undefined && !arraysEqual(actual, expectation.groupByFields)) {
      throw new Error(
        `Conformance case "${testCase.name}" expected groupBy fields [${expectation.groupByFields.join(', ')}], got [${actual.join(', ')}]`
      );
    }
  }

  if (probes.aggregateFunctions && expectation.aggregateFunctions) {
    const actual = probes.aggregateFunctions(compiled, testCase.query);
    if (actual !== undefined) {
      const expectedSorted = [...expectation.aggregateFunctions].sort((left, right) => left.function.localeCompare(right.function) || left.field.localeCompare(right.field));
      const actualSorted = [...actual].sort((left, right) => left.function.localeCompare(right.function) || left.field.localeCompare(right.field));
      const same =
        actualSorted.length === expectedSorted.length &&
        actualSorted.every((item, index) => item.function === expectedSorted[index]!.function && item.field === expectedSorted[index]!.field);
      if (!same) {
        throw new Error(`Conformance case "${testCase.name}" aggregate mismatch: expected ${JSON.stringify(expectedSorted)}, got ${JSON.stringify(actualSorted)}`);
      }
    }
  }

  if (probes.joinEntities && expectation.joinEntities) {
    const actual = probes.joinEntities(compiled, testCase.query);
    if (actual !== undefined && !arraysEqual(actual, expectation.joinEntities)) {
      throw new Error(
        `Conformance case "${testCase.name}" expected join entities [${expectation.joinEntities.join(', ')}], got [${actual.join(', ')}]`
      );
    }
  }
}

export function runConformanceSuite(
  adapter: ConformanceAdapter,
  suite: ConformanceSuite,
  probes: ConformanceProbes = {}
): void {
  for (const testCase of suite.cases) {
    assertConformanceCase(adapter, testCase, probes);
  }
}
