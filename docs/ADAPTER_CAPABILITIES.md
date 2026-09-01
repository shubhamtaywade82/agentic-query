# Adapter Capability Matrix

This matrix is intentionally conservative. An unsupported capability must fail explicitly rather than silently producing a different query.

| Capability | ActiveRecord | Prisma | Drizzle |
|---|---:|---:|---:|
| Basic select | Foundation | Foundation | Boundary |
| Scalar filters | Foundation | Foundation | Host-defined |
| Ordering | Foundation | Foundation | Host-defined |
| Limit / offset | Foundation | Foundation | Host-defined |
| Aggregates | Foundation | Planned | Host-defined |
| Grouping | Foundation | Planned | Host-defined |
| HAVING | Fail-closed | Fail-closed | Host-defined |
| Relation joins | Foundation | Planned | Host-defined |
| Semantic resolution | Core | Core | Core |
| Policy validation | Core | Core | Core |
| Tenant / row constraints | Rails runtime | Planned | Host-defined |

## Conformance rule

The core conformance suite validates shared Query AST semantics. Adapter-specific execution tests are still required to prove database behavior.

## Design rule

Adapter packages must reject unsupported AST constructs explicitly. They must never fall back to raw SQL or dynamically generated application code supplied by a model.
