# Security Guide

Agentic Query is designed for applications where an LLM may propose database queries but must not become the database authorization layer.

## Trust model

```text
LLM output        = untrusted
Query AST         = untrusted until validated
Semantic Catalog  = trusted application configuration
Policy Engine     = trusted
ORM Adapter       = trusted
Database          = trusted execution boundary
```

## Recommended controls

### Entity allowlisting

Expose only the models/entities the agent needs.

### Field restrictions

Deny sensitive fields such as credentials, tokens, secrets, and internal security metadata before ORM execution.

### Tenant isolation

Inject tenant/row constraints through application-owned policy primitives. Never depend on the model remembering a tenant predicate.

### Read-only credentials

Use database roles with only the permissions required by the agent. A read-oriented agent should have a read-oriented database identity.

### Result limits

Configure maximum result sizes. Large result sets increase cost, latency, and accidental data exposure. Limits are enforced at validation time (oversized query limits are rejected fail-closed), at compile time (`take`/`LIMIT` bounded by `maxRows`), and at normalization time (row caps with truncation flags).

### Timeouts

Use database/adapter-specific cancellation where available. A generic elapsed-time check is telemetry/guardrail and is not equivalent to hard database cancellation. The PostgreSQL adapter uses `SET LOCAL statement_timeout` (see [POSTGRES_INTEGRATION.md](./POSTGRES_INTEGRATION.md)); model providers enforce per-request timeouts; the plan executor enforces per-step timeouts.

### Query complexity limits

Policy `maxComplexity` bounds a deterministic score (selects, filters,
groupBy, orderBy, having, and joins) so expensive query shapes fail before
reaching the database. Operator, aggregate, and join-type allowlists narrow
the compiled surface further.

### Prompt-context scrubbing

Denied fields are removed from retrieved schema context before any prompt is
built, so the model cannot even see — let alone request — secret or system
columns.

### Answer synthesis isolation

The synthesis model receives only the normalized result and safe context
metadata: never the query AST, credentials, or the ability to re-run queries.
Synthesis is optional and separately disabled per request.

### Bounded repair

Query repair must have a fixed attempt limit. Every repaired candidate must pass the same validation and policy pipeline before execution.

### Semantic definitions

Business metrics should be resolved from trusted application definitions. The model may request `revenue`; it must not define what `revenue` means at execution time.

## Threats covered by the design

- prompt injection attempting to access restricted fields;
- hallucinated entities and fields;
- cross-tenant data access;
- unbounded result retrieval;
- unsafe ORM code generation;
- model-generated SQL execution;
- repeated repair loops;
- business-semantic drift.

## Operational guidance

Log query plans, policy decisions, execution duration, result size, provider/model, and repair attempts without logging secrets or unnecessary personal data. Treat generated queries as security-sensitive audit events.
