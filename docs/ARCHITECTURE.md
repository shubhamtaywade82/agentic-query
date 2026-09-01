# Architecture

Agentic Query is an ORM-native AI query runtime. Its central design principle is that model output is untrusted input and database execution is controlled by trusted application code.

## Runtime

```text
User question
     |
     v
Schema Retriever (scrub denied fields, budget, cache) ---- Semantic Catalog (metrics, dimensions, formulas)
     |                                                             |
     +--------------------------------+------------------------------+
                                    v
                            Structured Query Generator
                                    |
                                    v
                              Semantic Query AST
                                    |
                                    v
                       Semantic Resolution (trusted lineage)
                                    |
                                    v
                              Physical Query AST
                                    |
                                    v
                       Policy Validation (entities, fields,
                       operators, aggregates, joins, complexity)
                                    |
                          +---------+----------+
                          |                    |
                        valid                invalid
                          |                    |
                          |             bounded repair
                          |                    |
                          +---------+----------+
                                    v
                                ORM Adapter
                                    |
                                    v
                                 Database
                                    |
                                    v
                        Result Normalization (QueryResult)
                                    |
                                    v
                     Optional Answer Synthesis (result-only)
```

Planning sits alongside the single-query path: multi-step plans are bounded
DAGs of query steps plus deterministic derived computations, executed in
topological order with per-step policies and timeouts.

## Contracts

### Query AST

The language-neutral, versioned (`0.1`, `0.2`) representation of database
intent. It is designed to be consumed by adapters and validated
independently from any model provider. Validation covers structure,
limits, complexity, operator/aggregate/join allowlists, entity allowlists,
and denied fields.

### Semantic Catalog

Maps business concepts such as `revenue` or `active_customer` to trusted
definitions with physical lineage, metric-level filters, and deterministic
formulas. The model can request a semantic name; only the catalog decides
how that concept resolves to physical fields or expressions. Catalogs are
immutable with revision-keyed invalidation; circular definitions are
rejected at construction.

### Policy

Authorization and execution constraints live outside the model prompt.
Policies restrict entities, fields, operators, aggregates, join types,
rows, tenants, complexity, timeouts, and database capabilities, and can
force trusted filters that adapters must AND into compiled predicates.

### Model Provider

A provider supplies structured model generation with timeout, retry, usage
accounting, trace metadata, and fail-closed malformed-output handling.
Ollama is one provider; other providers can implement the same interface
without changing query or policy logic.

### Query Adapter

An adapter translates the validated physical Query AST into native ORM
operations and normalizes results. Current targets are ActiveRecord,
Prisma, and Drizzle.

### Result normalization and synthesis

Adapter results are converted into a deterministic `QueryResult`
(columns, rows, rowCount, metadata) with explicit decimal, date, null, and
row-cap policies. Answer synthesis is optional and isolated: it receives
only the normalized result and safe context, never the AST or credentials.

## Trust boundaries

1. Model output is untrusted.
2. AST validation is deterministic.
3. Semantic resolution is application-owned.
4. Policy enforcement is application-owned.
5. ORM compilation is trusted code.
6. Database credentials and permissions remain controlled by the host application.

Prompt instructions are not treated as a security boundary.

## Package model

```text
@agentic-query/core
    |
    +-- @agentic-query/prisma
    +-- @agentic-query/drizzle
    +-- @agentic-query/ollama

agentic_query (Ruby)
    |
    +-- ActiveRecord adapter
    +-- Ruby model providers
```

Ruby and TypeScript share protocol semantics, not implementation dependencies.
