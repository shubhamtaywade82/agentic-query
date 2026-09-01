import { validateQuery, type Filter, type Query, type QueryPolicy, type SelectExpression } from '@agentic-query/core';

export interface PrismaFieldMap {
  [entity: string]: Record<string, string>;
}

export interface PrismaRelationMap {
  [entity: string]: Record<string, string>;
}

export interface PrismaModelMap {
  [entity: string]: string;
}

export interface PrismaCompiledQuery {
  model: string;
  args: Record<string, unknown>;
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
    if (!model) throw new Error(`Prisma model is not registered: ${entity}`);

    const args: Record<string, unknown> = {};
    const select = this.compileSelect(entity, query.select);
    if (Object.keys(select).length > 0) args.select = select;

    const where = this.compileFilters(entity, query.filters ?? []);
    if (Object.keys(where).length > 0) args.where = where;

    if (query.orderBy?.length) {
      args.orderBy = query.orderBy.map((order) => ({
        [this.mapField(entity, order.field.field)]: order.direction
      }));
    }

    if (query.limit !== undefined) args.take = query.limit;
    if (query.offset !== undefined) args.skip = query.offset;

    if (query.joins?.length) {
      throw new Error('Join compilation requires relation-aware selection and is not implemented yet');
    }

    if (query.groupBy?.length || query.having?.length) {
      throw new Error('GroupBy/HAVING compilation is not implemented yet');
    }

    return { model, args };
  }

  private compileSelect(entity: string, expressions: SelectExpression[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const expression of expressions) {
      if (expression.aggregate) {
        throw new Error('Aggregate selection requires the Prisma aggregate API and is not implemented yet');
      }

      const field = this.mapField(entity, expression.field.field);
      result[field] = true;
    }
    return result;
  }

  private compileFilters(entity: string, filters: Filter[]): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    for (const filter of filters) {
      const field = this.mapField(entity, filter.field.field);
      where[field] = this.compilePredicate(filter);
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
        if (values.length !== 2) throw new Error('between requires exactly two values');
        return { gte: values[0], lte: values[1] };
      }
      default: throw new Error(`Unsupported filter operator: ${filter.operator}`);
    }
  }

  private mapField(entity: string, field: string): string {
    return this.fields[entity]?.[field] ?? field;
  }

  relation(entity: string, relation: string): string {
    const mapped = this.relations[entity]?.[relation];
    if (!mapped) throw new Error(`Prisma relation is not registered: ${entity}.${relation}`);
    return mapped;
  }
}
