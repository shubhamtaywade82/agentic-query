import type { Query } from './ast.js';
import type { QueryPolicy } from './policy.js';

export interface QueryAdapter<CompiledQuery = unknown, Result = unknown> {
  compile(query: Query, policy?: QueryPolicy | undefined): CompiledQuery;
  execute(compiled: CompiledQuery): Promise<Result> | Result;
}

export interface EntitySchema {
  name: string;
  table?: string | undefined;
  primaryKey?: string | undefined;
  fields: readonly FieldSchema[];
  relations: readonly RelationSchema[];
}

export interface FieldSchema {
  name: string;
  type: string;
  nullable?: boolean | undefined;
}

export interface RelationSchema {
  name: string;
  target: string;
  type?: string | undefined;
}

export interface SchemaProvider {
  getEntity(name: string): EntitySchema | undefined;
  listEntities(): readonly EntitySchema[];
}
