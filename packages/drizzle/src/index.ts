import type { Query, QueryAdapter, QueryPolicy, SchemaProvider } from '@agentic-query/core';

export interface DrizzleQueryConfig<CompiledQuery = unknown> {
  schemaProvider: SchemaProvider;
  compile: (query: Query, policy?: QueryPolicy) => CompiledQuery;
  execute: (compiled: CompiledQuery) => Promise<unknown> | unknown;
}

/**
 * Thin adapter boundary for Drizzle.
 *
 * Agentic Query owns validation/orchestration. The host application owns the
 * Drizzle schema and query construction so this package never evaluates model
 * generated JavaScript or raw SQL.
 */
export class DrizzleAdapter<CompiledQuery = unknown, Result = unknown>
  implements QueryAdapter<CompiledQuery, Result> {
  readonly schemaProvider: SchemaProvider;

  constructor(private readonly config: DrizzleQueryConfig<CompiledQuery>) {
    this.schemaProvider = config.schemaProvider;
  }

  compile(query: Query, policy?: QueryPolicy): CompiledQuery {
    return this.config.compile(query, policy);
  }

  async execute(compiled: CompiledQuery): Promise<Result> {
    return this.config.execute(compiled) as Promise<Result>;
  }
}
