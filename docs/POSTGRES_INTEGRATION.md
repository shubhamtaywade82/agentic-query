# PostgreSQL integration

PostgreSQL integration tests are the runtime semantic gate for Agentic Query.

## Why PostgreSQL

Compilation tests can prove that an adapter returns a native query representation, but they cannot prove that the resulting operation returns the intended rows. PostgreSQL integration tests therefore validate execution semantics for supported Query AST constructs.

## Test environment

Use a disposable PostgreSQL instance in CI (a GitHub Actions service
container running `postgres:17`) and a minimal schema containing `accounts`
and `orders`. The integration job fails when zero examples execute — the
PostgreSQL suite is mandatory, not advisory.

## Timeouts and cancellation

`AgenticQuery::PostgreSQLAdapter` enforces per-query
`statement_timeout` with `SET LOCAL` inside a transaction, so the timeout:

- is enforced by the database (cancellation, not a post-hoc elapsed check);
- is automatically reset when the transaction ends, keeping pooled
  connections clean;
- maps statement-timeout errors to `QueryExecutionError`.

A deterministic slow fixture (`SELECT pg_sleep(...)`) verifies cancellation
in CI, and a `SHOW statement_timeout` assertion verifies the reset.

## Required assertions

- selected fields map to the intended columns;
- filters preserve parameter values and operators;
- ordering is deterministic;
- limits and offsets are enforced;
- aggregate results are correct where the adapter advertises support;
- tenant/row constraints cannot be bypassed;
- unsupported AST constructs fail explicitly.

Integration tests should assert returned data and relevant adapter behavior rather than relying only on SQL string snapshots.
