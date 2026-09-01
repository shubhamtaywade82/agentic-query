import type { QueryAdapter } from '@agentic-query/core';
import { basicReadFixture, assertConformance } from '@agentic-query/core';
import { DrizzleAdapter, type DrizzleQueryConfig } from './index.js';

export function drizzleConformanceAdapter<CompiledQuery = unknown, Result = unknown>(
  config: DrizzleQueryConfig<CompiledQuery>
): QueryAdapter<CompiledQuery, Result> {
  return new DrizzleAdapter<CompiledQuery, Result>(config);
}

export function assertDrizzleBasicReadConformance<CompiledQuery = unknown, Result = unknown>(
  config: DrizzleQueryConfig<CompiledQuery>
): void {
  assertConformance(drizzleConformanceAdapter<CompiledQuery, Result>(config), basicReadFixture);
}
