import type { QueryAdapter } from '@agentic-query/core';
import { basicReadFixture, assertConformance } from '@agentic-query/core';
import { PrismaAdapter, type PrismaCompiledQuery } from './index.js';

export function prismaConformanceAdapter(options: ConstructorParameters<typeof PrismaAdapter>[0]): QueryAdapter<PrismaCompiledQuery, unknown> {
  const adapter = new PrismaAdapter(options);
  return {
    compile: (query) => adapter.compile(query),
    execute: async () => undefined
  };
}

export function assertPrismaBasicReadConformance(options: ConstructorParameters<typeof PrismaAdapter>[0]): void {
  assertConformance(prismaConformanceAdapter(options), basicReadFixture);
}
