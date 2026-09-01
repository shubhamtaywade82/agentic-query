# PostgreSQL integration

PostgreSQL integration tests are the runtime semantic gate for Agentic Query.

## Why PostgreSQL

Compilation tests can prove that an adapter returns a native query representation, but they cannot prove that the resulting operation returns the intended rows. PostgreSQL integration tests therefore validate execution semantics for supported Query AST constructs.

## Test environment

Use a disposable PostgreSQL instance in CI (for example, a GitHub Actions service container) and create a minimal schema containing `customers`, `orders`, and `line_items`.

## Required assertions

- selected fields map to the intended columns;
- filters preserve parameter values and operators;
- ordering is deterministic;
- limits and offsets are enforced;
- aggregate results are correct where the adapter advertises support;
- tenant/row constraints cannot be bypassed;
- unsupported AST constructs fail explicitly.

Integration tests should assert returned data and relevant adapter behavior rather than relying only on SQL string snapshots.
