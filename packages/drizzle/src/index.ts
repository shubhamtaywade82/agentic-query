/**
 * Drizzle adapter boundary (plan Phase N3, mode 1: host-owned compiler).
 *
 * The host application owns the Drizzle schema and query construction.
 * This boundary enforces: validation-before-compile, policy propagation,
 * schema-provider wiring, capability declaration, and optional result
 * normalization. It deliberately does NOT hide host responsibility behind
 * a fake universal compiler.
 */
import {
  validateQuery,
  QueryValidationError,
  normalizeRowsResult,
  type Query,
  type QueryAdapter,
  type QueryPolicy,
  type QueryResult,
  type SchemaProvider
} from '@agentic-query/core';

export interface DrizzleCapability {
  capability: string;
  supported: boolean;
  /** Failure mode when an unsupported AST construct reaches the compiler. */
  mode: 'fail-closed';
}

/** Declared capabilities for documentation and runtime introspection. */
export const DRIZZLE_CAPABILITIES: readonly DrizzleCapability[] = [
  { capability: 'read', supported: true, mode: 'fail-closed' },
  { capability: 'filter', supported: true, mode: 'fail-closed' },
  { capability: 'order', supported: true, mode: 'fail-closed' },
  { capability: 'paginate', supported: true, mode: 'fail-closed' },
  { capability: 'aggregate', supported: true, mode: 'fail-closed' },
  { capability: 'groupBy', supported: true, mode: 'fail-closed' },
  { capability: 'having', supported: false, mode: 'fail-closed' },
  { capability: 'join', supported: true, mode: 'fail-closed' },
  { capability: 'relationRead', supported: true, mode: 'fail-closed' }
];

export interface DrizzleQueryConfig<CompiledQuery = unknown> {
  schemaProvider: SchemaProvider;
  compile: (query: Query, policy?: QueryPolicy | undefined) => CompiledQuery;
  execute: (compiled: CompiledQuery) => Promise<unknown> | unknown;
}

export class DrizzleAdapter<CompiledQuery = unknown, Result = unknown>
  implements QueryAdapter<CompiledQuery, Result> {
  readonly schemaProvider: SchemaProvider;
  readonly capabilities: readonly DrizzleCapability[] = DRIZZLE_CAPABILITIES;

  constructor(private readonly config: DrizzleQueryConfig<CompiledQuery>) {
    this.schemaProvider = config.schemaProvider;
  }

  compile(query: Query, policy?: QueryPolicy | undefined): CompiledQuery {
    // Deterministic validation always precedes host compilation so policy
    // failures never reach Drizzle-specific code paths.
    validateQuery(query, policy ?? {});
    if (query.having?.length) {
      throw new QueryValidationError('Drizzle boundary does not support HAVING predicates (fail-closed)');
    }
    return this.config.compile(query, policy);
  }

  async execute(compiled: CompiledQuery): Promise<Result> {
    return this.config.execute(compiled) as Promise<Result>;
  }

  /** Normalizes an executed row-shaped result through the shared policy. */
  normalizeResult(rows: Record<string, unknown>[], metadata: Record<string, unknown> = {}): QueryResult {
    return normalizeRowsResult(rows, metadata);
  }
}
