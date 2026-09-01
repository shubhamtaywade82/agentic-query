import type { Query, QueryPolicy } from './index.js';

export interface QueryAdapter<CompiledQuery = unknown, Result = unknown> {
  compile(query: Query, policy?: QueryPolicy): CompiledQuery;
  execute(compiled: CompiledQuery): Promise<Result> | Result;
}

export interface EntitySchema {
  name: string;
  table?: string;
  primaryKey?: string;
  fields: readonly FieldSchema[];
  relations: readonly RelationSchema[];
}

export interface FieldSchema {
  name: string;
  type: string;
  nullable?: boolean;
}

export interface RelationSchema {
  name: string;
  target: string;
  type?: string;
}

export interface SchemaProvider {
  getEntity(name: string): EntitySchema | undefined;
  listEntities(): readonly EntitySchema[];
}
