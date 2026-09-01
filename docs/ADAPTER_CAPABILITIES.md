# Adapter Capability Matrix

This matrix is intentionally conservative. An unsupported capability must fail explicitly rather than silently producing a different query.

| Capability | ActiveRecord | Prisma | Drizzle |
|---|---:|---:|---:|
| Basic select | Native | Native (`findMany`) | Host-owned (validated boundary) |
| Scalar filters | Native | Native | Host-defined |
| Ordering | Native | Native | Host-defined |
| Limit / offset | Native | Native (`take`/`skip`, bounded by `maxRows`) | Host-defined |
| Aggregates | Native | Native (`aggregate`) | Host-defined |
| Grouping | Native | Native (`groupBy` with top-level aggregates) | Host-defined |
| HAVING | Fail-closed | Fail-closed (aggregate-aware having API pending) | Fail-closed (declared) |
| Relation joins | Native (registered associations, inner + left) | Native (nested `include` reads with relation `where`/`select`) | Host-defined |
| Result normalization | `ResultNormalizer` | `PrismaExecutor` | Shared `normalizeResult` |
| Semantic resolution | Core | Core | Core |
| Policy validation | Core (structural + authorization) | Core | Core (validation before host compile) |
| Tenant / row constraints | Rails runtime (trusted scopes/constraints) | `forcedFilters` injection | Host-defined |

## Conformance rule

The core conformance suite executes the shared fixtures in
`spec/conformance/v0.2/` against every adapter with semantic expectation
assertions. Adapter-specific execution tests are still required to prove
database behavior (the PostgreSQL integration suite).

## Design rule

Adapter packages must reject unsupported AST constructs explicitly. They must never fall back to raw SQL or dynamically generated application code supplied by a model.
