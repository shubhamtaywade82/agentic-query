import type { QueryAdapter } from '@agentic-query/core';
import { runConformanceSuite, type ConformanceSuite } from '@agentic-query/core';
import { PrismaAdapter, type PrismaCompiledQuery } from './index.js';

export function prismaConformanceAdapter(
  options: ConstructorParameters<typeof PrismaAdapter>[0]
): QueryAdapter<PrismaCompiledQuery, unknown> {
  const adapter = new PrismaAdapter(options);
  return {
    compile: (query) => adapter.compile(query),
    execute: async () => undefined
  };
}

export function runPrismaConformance(
  options: ConstructorParameters<typeof PrismaAdapter>[0],
  suite: ConformanceSuite
): void {
  const adapter = prismaConformanceAdapter(options);
  runConformanceSuite((query) => adapter.compile(query), suite);
}
