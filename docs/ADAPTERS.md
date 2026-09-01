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

The Ruby adapter operates on an explicit model registry and trusted
ActiveRecord relations. It resolves AST join entities to registered
associations (singular and plural forms), supports left joins, compiles
join-entity filters and projections against the associated model's table,
and applies the documented execution order:

```text
authorize -> tenant scope -> row constraint -> joins -> filters
-> select -> group -> having (fail-closed) -> order -> bounded limit
```

Use application policy to control which models and fields may be queried.

## Prisma

`@agentic-query/prisma` compiles to native Prisma operations
(`findMany`, `groupBy`, `aggregate`). Relation-aware reads map registered
relations to nested `include` blocks with folded relation `where`/`select`.
`PrismaExecutor` executes compiled operations against host-supplied model
delegates and normalizes results deterministically. Policy `forcedFilters`
are injected into `where`, `take` is bounded by `maxRows`, and unregistered
joins fail closed.

## Drizzle

`@agentic-query/drizzle` follows the host-owned compiler boundary: the host
application supplies compile/execute callbacks over its own schema. The
boundary validates the AST before host compilation, declares capabilities
(fail-closed for HAVING), and normalizes results through the shared contract.
A native compiler remains a v1.0 candidate once a stable Drizzle schema
capability abstraction exists.

## Conformance

Adapters must preserve the semantics of the shared Query AST. When an adapter does not support a construct, it should fail closed with a typed error rather than silently changing semantics.

Every adapter executes the shared fixtures in `spec/conformance/v0.2/`
(see [TESTING.md](./TESTING.md)) and must satisfy the semantic expectations
through its probes, including policy-rejection cases.

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
