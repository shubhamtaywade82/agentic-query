/**
 * Prisma adapter (plan Phase N2).
 *
 * Compiles the validated Query AST into native Prisma operations
 * (`findMany`, `groupBy`, `aggregate`, `findMany` with nested relation
 * reads). Never emits raw SQL. Policy is enforced at compile time and
 * forced filters (tenant/row constraints) are injected into the `where`
 * path where the AST cannot remove them.
 */
import {
  validateQuery,
  QueryValidationError,
  capabilityAllowed,
  forcedFiltersFor,
  type Filter,
  type Query,
  type QueryPolicy,
  type SelectExpression
} from '@agentic-query/core';
import { normalizeAggregateResult, normalizeRowsResult, type QueryResult } from '@agentic-query/core';

export interface PrismaFieldMap { [entity: string]: Record<string, string> }
export interface PrismaRelationMap { [entity: string]: Record<string, string> }
export interface PrismaModelMap { [entity: string]: string }

export interface PrismaCompiledQuery {
  model: string;
  operation: 'findMany' | 'groupBy' | 'aggregate';
  args: Record<string, unknown>;
}

/** Client delegate the host supplies for execution (e.g. `prisma.<model>`). */
export interface PrismaClientLike {
  [model: string]: unknown;
}

export interface PrismaExecutorLike {
  (compiled: PrismaCompiledQuery): Promise<unknown>;
}

export interface PrismaAdapterOptions {
  models: PrismaModelMap;
  fields?: PrismaFieldMap;
  relations?: PrismaRelationMap;
}

export class PrismaAdapter {
  private readonly models: PrismaModelMap;
  private readonly fields: PrismaFieldMap;
  private readonly relations: PrismaRelationMap;

  constructor(options: PrismaAdapterOptions) {
    this.models = options.models;
    this.fields = options.fields ?? {};
    this.relations = options.relations ?? {};
  }

  compile(query: Query, policy: QueryPolicy = {}): PrismaCompiledQuery {
    validateQuery(query, policy);
    const entity = query.source.name;
    const model = this.models[entity];
    if (!model) throw new QueryValidationError(`Prisma model is not registered: ${entity}`);

    if (query.groupBy?.length || query.having?.length) return this.compileGroupBy(entity, model, query, policy);
    if (query.select.some((expression) => expression.aggregate)) return this.compileAggregate(entity, model, query, policy);
    return { model, operation: 'findMany', args: this.compileFindManyArgs(entity, query, policy) };
  }

  private compileFindManyArgs(entity: string, query: Query, policy: QueryPolicy): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    const select = this.compileSelect(entity, query.select);
    if (Object.keys(select).length > 0) args.select = select;
    const where = this.compileFiltersRaw(entity, [...(query.filters ?? []), ...forcedFiltersFor(policy, entity)]);
    if (Object.keys(where).length > 0) args.where = where;
    if (query.orderBy?.length) {
      args.orderBy = query.orderBy.map((order) => ({ [this.mapField(entity, order.field.field)]: order.direction }));
    }
    if (query.limit !== undefined) args.take = query.limit;
    else if (policy.maxRows !== undefined) args.take = policy.maxRows; // bounded materialization
    if (query.offset !== undefined) args.skip = query.offset;
    if (query.joins?.length) return this.compileRelationRead(entity, query, policy, args);
    return args;
  }

  /**
   * Relation-aware nested reads: AST joins over registered relations map to
   * Prisma nested `include`/`where`/`select` blocks. Unregistered relations
   * fail closed.
   */
  private compileRelationRead(
    entity: string,
    query: Query,
    policy: QueryPolicy,
    baseArgs: Record<string, unknown>
  ): Record<string, unknown> {
    const include: Record<string, unknown> = {};

    for (const join of query.joins ?? []) {
      const target = join.entity.name;
      const relationName = this.relations[entity]?.[target];
      if (!relationName) {
        throw new QueryValidationError(
          `Join compilation requires an explicit Prisma relation mapping: ${entity} -> ${target}`
        );
      }

      // Filters that target the joined entity fold into the relation
      // `where` block; projections fold into the relation `select` block.
      const joinFilters = (query.filters ?? []).filter((filter) => (filter.field.entity ?? entity) === target);
      const joinSelects = query.select.filter(
        (expression) => (expression.field.entity ?? entity) === target && !expression.aggregate
      );

      const relationBlock: Record<string, unknown> = {};
      if (joinFilters.length > 0) relationBlock.where = this.compileFiltersRaw(target, joinFilters);
      if (joinSelects.length > 0) {
        relationBlock.select = Object.fromEntries(
          joinSelects.map((expression) => [this.mapField(target, expression.field.field), true])
        );
      }
      include[relationName] = Object.keys(relationBlock).length > 0 ? relationBlock : true;
    }

    // Root where keeps only source-entity filters plus trusted forced filters;
    // root select keeps only source-entity projections.
    const rootFilters = (query.filters ?? []).filter((filter) => {
      const fieldEntity = filter.field.entity ?? entity;
      return fieldEntity === entity;
    });
    const rootSelects = query.select.filter((expression) => {
      const fieldEntity = expression.field.entity ?? entity;
      return fieldEntity === entity && !expression.aggregate;
    });
    const where = this.compileFiltersRaw(entity, [...rootFilters, ...forcedFiltersFor(policy, entity)]);

    const args: Record<string, unknown> = { ...baseArgs, include };
    if (rootSelects.length > 0) {
      args.select = this.compileSelect(entity, rootSelects);
    } else {
      delete args.select;
    }
    if (Object.keys(where).length > 0) args.where = where;
    else delete args.where;
    return args;
  }

  private compileGroupBy(entity: string, model: string, query: Query, policy: QueryPolicy): PrismaCompiledQuery {
    if (!query.groupBy?.length) throw new QueryValidationError('groupBy requires at least one field');
    if (query.joins?.length) {
      const target = query.joins[0]!.entity.name;
      if (!this.relations[entity]?.[target]) {
        throw new QueryValidationError('groupBy with joins requires an explicit Prisma relation mapping');
      }
    }
    if (query.select.some((expression) => !expression.aggregate && !query.groupBy?.some((field) => field.field === expression.field.field))) {
      throw new QueryValidationError('Prisma groupBy requires selected dimensions to appear in groupBy');
    }
    const by = query.groupBy.map((field) => this.mapField(entity, field.field));
    const args: Record<string, unknown> = { by };
    const where = this.compileFiltersRaw(entity, [...(query.filters ?? []), ...forcedFiltersFor(policy, entity)]);
    if (Object.keys(where).length > 0) args.where = where;
    if (query.orderBy?.length) {
      args.orderBy = query.orderBy.map((order) => ({ [this.mapField(entity, order.field.field)]: order.direction }));
    }
    if (query.limit !== undefined) args.take = query.limit;
    else if (policy.maxRows !== undefined) args.take = policy.maxRows;
    if (query.offset !== undefined) args.skip = query.offset;
    if (query.having?.length) {
      // Prisma's having syntax references aggregate projections
      // (`_sum: {...}`); mapping field-level predicates would silently
      // change semantics. Fail closed until an aggregate-aware having API
      // exists.
      throw new QueryValidationError(
        'HAVING requires aggregate-aware Prisma predicates and fails closed by design'
      );
    }
    const aggregates = this.compileAggregates(entity, query.select);
    if (Object.keys(aggregates).length > 0) {
      // Prisma groupBy returns aggregates at the top level of each row.
      Object.assign(args, aggregates);
    }
    return { model, operation: 'groupBy', args };
  }

  private compileAggregate(entity: string, model: string, query: Query, policy: QueryPolicy): PrismaCompiledQuery {
    if (query.groupBy?.length || query.having?.length) {
      throw new QueryValidationError('Use groupBy for grouped aggregate queries');
    }
    if (query.joins?.length) {
      throw new QueryValidationError('Aggregate queries with joins require explicit Prisma relation mapping');
    }
    if (!capabilityAllowed(policy, 'aggregate')) {
      throw new QueryValidationError('Aggregate capability is not allowed by policy');
    }

    const aggregates = this.compileAggregates(entity, query.select);
    const where = this.compileFiltersRaw(entity, [...(query.filters ?? []), ...forcedFiltersFor(policy, entity)]);
    const args: Record<string, unknown> = { ...aggregates };
    if (Object.keys(where).length > 0) args.where = where;
    return { model, operation: 'aggregate', args };
  }

  /** Builds the `_sum`/`_avg`/... argument blocks directly (no nesting bug). */
  private compileAggregates(entity: string, expressions: readonly SelectExpression[]): Record<string, unknown> {
    const aggregates: Record<string, unknown> = {};
    for (const expression of expressions) {
      if (!expression.aggregate) continue;
      const field = this.mapField(entity, expression.field.field);
      const key = `_${expression.aggregate}`;
      const target = (aggregates[key] ??= {}) as Record<string, unknown>;
      target[field] = true;
    }
    return aggregates;
  }

  private compileSelect(entity: string, expressions: readonly SelectExpression[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const expression of expressions) {
      if (expression.aggregate) throw new QueryValidationError('Aggregate expressions must use the aggregate operation');
      result[this.mapField(entity, expression.field.field)] = true;
    }
    return result;
  }

  private compileFiltersRaw(entity: string, filters: readonly Filter[]): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    for (const filter of filters) {
      where[this.mapField(entity, filter.field.field)] = this.compilePredicate(filter);
    }
    return where;
  }

  private compilePredicate(filter: Filter): unknown {
    switch (filter.operator) {
      case 'eq': return filter.value;
      case 'neq': return { not: filter.value };
      case 'gt': return { gt: filter.value };
      case 'gte': return { gte: filter.value };
      case 'lt': return { lt: filter.value };
      case 'lte': return { lte: filter.value };
      case 'in': return { in: filter.values ?? [] };
      case 'not_in': return { notIn: filter.values ?? [] };
      case 'like': return { contains: filter.value };
      case 'is_null': return null;
      case 'is_not_null': return { not: null };
      case 'between': {
        const values = filter.values ?? [];
        if (values.length !== 2) throw new QueryValidationError('between requires exactly two values');
        return { gte: values[0], lte: values[1] };
      }
      default: throw new QueryValidationError(`Unsupported filter operator: ${filter.operator}`);
    }
  }

  private mapField(entity: string, field: string): string { return this.fields[entity]?.[field] ?? field; }

  relation(entity: string, relation: string): string {
    const mapped = this.relations[entity]?.[relation];
    if (!mapped) throw new QueryValidationError(`Prisma relation is not registered: ${entity}.${relation}`);
    return mapped;
  }
}

function isAggregateResult(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Executes compiled queries against a host-supplied Prisma delegate map
 * and normalizes results deterministically.
 */
export class PrismaExecutor {
  constructor(private readonly models: PrismaClientLike) {}

  async execute(compiled: PrismaCompiledQuery): Promise<unknown> {
    const delegate = this.models[compiled.model];
    if (!delegate || typeof (delegate as Record<string, unknown>)[compiled.operation] !== 'function') {
      throw new QueryValidationError(`Prisma model is not executable: ${compiled.model}.${compiled.operation}`);
    }
    const operation = (delegate as Record<string, unknown>)[compiled.operation] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;
    return operation.call(delegate, compiled.args);
  }

  async executeNormalized(compiled: PrismaCompiledQuery): Promise<QueryResult> {
    const raw = await this.execute(compiled);
    if (compiled.operation === 'aggregate' && isAggregateResult(raw)) {
      return normalizeAggregateResult(raw, { source: 'prisma.aggregate' });
    }
    return normalizeRowsResult(Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [], {
      source: `prisma.${compiled.operation}`
    });
  }
}

/** Convenience adapter that combines compile + execute + normalize. */
export interface PrismaExecutingAdapterOptions extends PrismaAdapterOptions {
  client: PrismaClientLike;
}

export class PrismaExecutingAdapter {
  private readonly compiler: PrismaAdapter;
  private readonly executor: PrismaExecutor;

  constructor(options: PrismaExecutingAdapterOptions) {
    this.compiler = new PrismaAdapter(options);
    this.executor = new PrismaExecutor(options.client);
  }

  compile(query: Query, policy?: QueryPolicy): PrismaCompiledQuery {
    return this.compiler.compile(query, policy ?? {});
  }

  async execute(compiled: PrismaCompiledQuery): Promise<unknown> {
    return this.executor.execute(compiled);
  }

  async ask(query: Query, policy?: QueryPolicy): Promise<QueryResult> {
    return this.executor.executeNormalized(this.compile(query, policy));
  }
}
