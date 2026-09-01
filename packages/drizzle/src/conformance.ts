import type { QueryAdapter, ConformanceProbes, ConformanceSuite } from '@agentic-query/core';
import { runConformanceSuite } from '@agentic-query/core';
import { DrizzleAdapter, type DrizzleQueryConfig } from './index.js';

export function drizzleConformanceAdapter<CompiledQuery = unknown, Result = unknown>(
  config: DrizzleQueryConfig<CompiledQuery>
): QueryAdapter<CompiledQuery, Result> {
  return new DrizzleAdapter<CompiledQuery, Result>(config);
}

/**
 * Host-supplied conformance probes. Because the Drizzle boundary compiles
 * through application code, the host declares how to inspect its compiled
 * representation; a default reflection over a JSON-shaped compiled query
 * covers the common case.
 */
export function drizzleDefaultProbes(): ConformanceProbes {
  return {
    source: (compiled: unknown) =>
      (compiled as { source?: { name?: string } })?.source?.name ?? (compiled as { model?: string })?.model,
    selectedFields: (compiled: unknown) => (compiled as { selectedFields?: readonly string[] })?.selectedFields,
    filterFields: (compiled: unknown) => (compiled as { filterFields?: readonly string[] })?.filterFields,
    orderBy: (compiled: unknown) => (compiled as { orderBy?: readonly { field: string; direction: 'asc' | 'desc' }[] })?.orderBy,
    limit: (compiled: unknown) => (compiled as { limit?: number })?.limit,
    offset: (compiled: unknown) => (compiled as { offset?: number })?.offset,
    groupByFields: (compiled: unknown) => (compiled as { groupByFields?: readonly string[] })?.groupByFields,
    aggregateFunctions: (compiled: unknown) =>
      (compiled as { aggregateFunctions?: readonly { function: string; field: string }[] })?.aggregateFunctions,
    joinEntities: (compiled: unknown) => (compiled as { joinEntities?: readonly string[] })?.joinEntities
  };
}

export function runDrizzleConformance<CompiledQuery = unknown, Result = unknown>(
  config: DrizzleQueryConfig<CompiledQuery>,
  suite: ConformanceSuite,
  probes: ConformanceProbes = drizzleDefaultProbes()
): void {
  const adapter = drizzleConformanceAdapter<CompiledQuery, Result>(config);
  runConformanceSuite((query, policy) => adapter.compile(query, policy), suite, probes);
}
