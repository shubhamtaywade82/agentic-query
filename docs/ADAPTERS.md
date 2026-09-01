# ORM Adapter Guide

Adapters translate the validated physical Query AST into native database/ORM operations.

## Adapter contract

Every adapter should expose two responsibilities:

```ts
interface QueryAdapter<CompiledQuery, Result> {
  compile(query: Query): CompiledQuery;
  execute(compiled: CompiledQuery): Promise<Result> | Result;
}
```

Compilation is deterministic. The adapter must not evaluate model-generated application code.

## ActiveRecord

The Ruby implementation is intended to operate on an explicit model registry and trusted ActiveRecord relations.

Use application policy to control which models and fields may be queried.

## Prisma

`@agentic-query/prisma` provides the TypeScript adapter boundary. Complex query constructs should be implemented only when their semantics can be represented safely and tested against the shared specification.

## Drizzle

`@agentic-query/drizzle` follows the same contract. Prefer typed Drizzle expressions and schema-owned definitions over dynamically evaluating generated code or raw SQL.

## Conformance

Adapters must preserve the semantics of the shared Query AST. When an adapter does not support a construct, it should fail closed with a typed error rather than silently changing semantics.

Recommended adapter test matrix:

- projection;
- filters and null semantics;
- ordering;
- limits and offsets;
- grouping and aggregates;
- joins;
- policy-restricted fields/entities;
- tenant constraints;
- unsupported feature behavior.
