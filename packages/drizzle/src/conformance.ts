import type { QueryAdapter } from '@agentic-query/core';
import { runConformanceSuite, type ConformanceSuite } from '@agentic-query/core';
import { DrizzleAdapter, type DrizzleQueryConfig } from './index.js';

export function drizzleConformanceAdapter<CompiledQuery = unknown, Result = unknown>(
  config: DrizzleQueryConfig<CompiledQuery>
): QueryAdapter<CompiledQuery, Result> {
  return new DrizzleAdapter<CompiledQuery, Result>(config);
}

export function runDrizzleConformance<CompiledQuery = unknown, Result = unknown>(
  config: DrizzleQueryConfig<CompiledQuery, Result>,
  suite: ConformanceSuite
): void {
  const adapter = drizzleConformanceAdapter<CompiledQuery, Result>(config);
  runConformanceSuite((query) => adapter.compile(query), suite);
}
