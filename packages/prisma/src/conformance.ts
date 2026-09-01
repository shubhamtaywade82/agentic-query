import type { ConformanceProbes, QueryAdapter, ConformanceSuite } from '@agentic-query/core';
import { runConformanceSuite } from '@agentic-query/core';
import { PrismaAdapter, type PrismaCompiledQuery } from './index.js';

export function prismaConformanceProbes(models?: Record<string, string>): ConformanceProbes {
  const modelToEntity = new Map(Object.entries(models ?? {}).map(([entity, model]) => [model, entity]));
  return {
    source: (compiled: unknown) => {
      const model = (compiled as PrismaCompiledQuery)?.model;
      // Reverse-map the compiled model name back to the language-neutral
      // entity name so fixtures stay ORM-independent.
      return model !== undefined ? modelToEntity.get(model) ?? model : undefined;
    },
    selectedFields: (compiled: unknown, query) => {
      const args = (compiled as PrismaCompiledQuery)?.args;
      const selected: string[] = [];
      const select = args?.select as Record<string, unknown> | undefined;
      if (select) {
        for (const [key, value] of Object.entries(select)) {
          if (value === true) selected.push(key);
        }
      }
      // groupBy projections surface as `by`.
      const by = args?.by as string[] | undefined;
      if (by) selected.push(...by.filter((field) => !selected.includes(field)));
      // Relation reads project through nested include select blocks.
      const include = args?.include as Record<string, unknown> | undefined;
      if (include) {
        for (const block of Object.values(include)) {
          if (block !== null && typeof block === 'object') {
            const nested = (block as { select?: Record<string, unknown> }).select;
            if (nested) {
              for (const [key, value] of Object.entries(nested)) {
                if (value === true) selected.push(key);
              }
            }
          }
        }
      }
      return selected.length > 0 ? selected : [];
    },
    filterFields: (compiled: unknown) => {
      const where = (compiled as PrismaCompiledQuery)?.args?.where as Record<string, unknown> | undefined;
      return where ? Object.keys(where) : undefined;
    },
    orderBy: (compiled: unknown) => {
      const orderBy = (compiled as PrismaCompiledQuery)?.args?.orderBy as
        | Record<string, 'asc' | 'desc'>[]
        | undefined;
      return orderBy?.map((entry) => {
        const [field, direction] = Object.entries(entry)[0]!;
        return { field, direction };
      });
    },
    limit: (compiled: unknown) => {
      const take = (compiled as PrismaCompiledQuery)?.args?.take;
      return typeof take === 'number' ? take : undefined;
    },
    offset: (compiled: unknown) => {
      const skip = (compiled as PrismaCompiledQuery)?.args?.skip;
      return typeof skip === 'number' ? skip : undefined;
    },
    groupByFields: (compiled: unknown) => {
      const by = (compiled as PrismaCompiledQuery)?.args?.by as string[] | undefined;
      return by;
    },
    aggregateFunctions: (compiled: unknown) => {
      const args = (compiled as PrismaCompiledQuery)?.args as Record<string, unknown> | undefined;
      if (!args) return undefined;
      const functions: { function: string; field: string }[] = [];
      for (const [key, value] of Object.entries(args)) {
        if (!key.startsWith('_')) continue;
        if (value === null || typeof value !== 'object') continue;
        for (const field of Object.keys(value as Record<string, unknown>)) {
          functions.push({ function: key.slice(1), field });
        }
      }
      return functions;
    },
    joinEntities: (compiled: unknown, query) => {
      const include = (compiled as PrismaCompiledQuery)?.args?.include as Record<string, unknown> | undefined;
      if (!include) return undefined;
      // Map compiled relation includes back to the AST join entity names.
      return (query.joins ?? []).map((join) => join.entity.name);
    }
  };
}

export function prismaConformanceAdapter(
  options: ConstructorParameters<typeof PrismaAdapter>[0]
): QueryAdapter<PrismaCompiledQuery, unknown> {
  const adapter = new PrismaAdapter(options);
  return {
    compile: (query, policy) => adapter.compile(query, policy),
    execute: async () => undefined
  };
}

export function runPrismaConformance(
  options: ConstructorParameters<typeof PrismaAdapter>[0],
  suite: ConformanceSuite
): void {
  const adapter = new PrismaAdapter(options);
  runConformanceSuite(
    (query, policy) => adapter.compile(query, policy),
    suite,
    prismaConformanceProbes(options.models)
  );
}
