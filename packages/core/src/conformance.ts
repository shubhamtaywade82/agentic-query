import type { Query } from './index.js';

export interface ConformanceExpectation {
  source: string;
  selectedFields: readonly string[];
  filterFields?: readonly string[];
  orderBy?: readonly { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
}

export interface ConformanceCase {
  name: string;
  query: Query;
  expected: ConformanceExpectation;
}

export interface ConformanceSuite {
  version: string;
  cases: readonly ConformanceCase[];
}

export type ConformanceAdapter = (query: Query) => unknown;

export function assertConformanceCase(
  adapter: ConformanceAdapter,
  testCase: ConformanceCase
): void {
  const compiled = adapter(testCase.query);

  if (compiled === undefined || compiled === null) {
    throw new Error(`Adapter returned no compiled query for case: ${testCase.name}`);
  }
}

export function runConformanceSuite(
  adapter: ConformanceAdapter,
  suite: ConformanceSuite
): void {
  for (const testCase of suite.cases) {
    assertConformanceCase(adapter, testCase);
  }
}
