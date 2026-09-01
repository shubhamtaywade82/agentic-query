# Testing and Conformance

Agentic Query has two classes of correctness to protect:

1. deterministic runtime correctness;
2. model-dependent semantic correctness.

## Running the suites

```bash
pnpm check                # typecheck + lint + unit tests + build + version consistency
cd ruby && bundle exec rspec --exclude-pattern "spec/integration/*"   # SQLite fast suite
DATABASE_URL=postgresql://... bundle exec rspec spec/integration        # PostgreSQL suite
```

CI additionally runs dedicated `security`, `conformance`, and
`postgres-integration` jobs with zero-test guards: a required suite that
executes zero examples is a failure, not a pass.

## Unit tests

Core unit tests cover AST validation, policy decisions (including operator,
aggregate, join, and complexity limits), semantic resolution, schema
retrieval (scrubbing, caching, budgets), repair behavior, result
normalization, synthesis, evaluation metrics, observability, and provider
contracts.

## Adapter tests

Each ORM adapter tests every supported AST construct and explicitly tests
unsupported constructs fail closed (unregistered joins, capability denial,
unknown columns, denied fields, oversized limits).

## Conformance fixtures

Shared JSON fixtures under `spec/conformance/v0.2/` describe canonical query
families: selection, filters, ordering, pagination, aggregates, groupBy,
joins, and policy rejection. The TypeScript core, Prisma, and Drizzle
suites and the Ruby ActiveRecord suite all execute the same files, asserting
semantic expectations through adapter probes rather than SQL snapshots.
Unsupported constructs must fail closed with a message containing the
expected reason.

```text
          canonical fixture (spec/conformance/v0.2/basic-read.json)
                 |
        +--------+---------+---------+
        |        |         |         |
        v        v         v         v
     core     prisma    drizzle    Ruby
     probes   probes    probes    ActiveRecord
        |        |         |         |
        +--------+---------+---------+
                 v
          same semantics, real assertions
```

## Security regression tests

Test attempts to:

- access denied entities;
- select denied fields;
- bypass tenant scopes through filters or joins;
- exceed result limits;
- trigger unbounded repair loops;
- introduce executable code or SQL through model output.

## Evaluation tests

Maintain a golden question set containing expected entities, semantic concepts, policies, and result expectations. Run it when changing prompts, models, retrievers, planners, or semantic definitions.
