# Agentic Query — End-to-End Implementation Plan

This document is the master delivery plan for Agentic Query across Ruby on Rails and Node.js/TypeScript applications. It is intentionally exhaustive: architecture, APIs, security, ORM integration, agent runtime, testing, CI/CD, releases, migration, examples, and operational readiness are covered here.

## 1. Product objective

Agentic Query converts natural-language data requests into a validated, policy-controlled, ORM-native query representation and executes only through trusted application code.

Core invariant:

```text
Natural language
  -> schema/semantic retrieval
  -> structured query/plan
  -> deterministic validation
  -> authorization/policy
  -> bounded repair
  -> ORM-native compilation
  -> database execution
  -> normalized result
  -> optional answer synthesis
```

The LLM is never the authorization boundary, never receives unrestricted database credentials, and never executes SQL or application code directly.

## 2. Repository/package architecture

```text
agentic-query/
├── packages/
│   ├── core/              # AST, policies, semantic layer, planner, agent runtime
│   ├── prisma/            # Prisma adapter
│   ├── drizzle/           # Drizzle adapter boundary/compiler
│   └── ollama/            # Ollama ModelProvider
├── ruby/
│   ├── lib/agentic_query/ # Rails/ActiveRecord runtime
│   └── spec/               # Ruby unit/integration/security tests
├── spec/
│   └── conformance/        # language-neutral adapter fixtures
├── docs/
├── examples/
└── .github/workflows/
```

Keep the shared conceptual model language-neutral. Rails and Node.js packages are separate runtime integrations over the same semantic/query contracts.

## 3. Shared architecture and contracts

### 3.1 Query AST

Define a versioned, language-neutral AST supporting:

- source entity
- field references
- aggregates
- aliases
- filters
- ordering
- limit/offset
- group by
- having
- joins
- semantic metric references
- semantic dimension references

Version policy:

- v0.x: additive evolution allowed
- v1.0: schema stability and compatibility guarantees
- every AST change requires fixtures + compatibility tests

### 3.2 QueryPolicy

The policy layer must be application-owned and immutable during a query execution.

Required controls:

- allowed entities
- denied fields
- maximum rows
- maximum query complexity
- tenant scope
- row-level constraints
- allowed operators
- allowed aggregates
- allowed joins
- timeout
- database capability restrictions

Authorization must execute immediately before adapter compilation.

### 3.3 Adapter contract

```ts
interface QueryAdapter<CompiledQuery, Result> {
  compile(query: Query, policy?: QueryPolicy): CompiledQuery;
  execute(compiled: CompiledQuery): Promise<Result> | Result;
}
```

Required adapter guarantees:

- enforce policy during compile
- reject unsupported AST constructs
- never fall back to raw LLM SQL
- preserve tenant/row restrictions
- return typed/normalized results where practical

### 3.4 ModelProvider contract

```ts
interface ModelProvider {
  generateStructured<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>>;
}
```

Provider requirements:

- structured output support
- model identifier
- timeout/retry configuration
- usage accounting when provider exposes it
- trace metadata
- deterministic request envelope

## 4. Rails implementation plan

### Phase R1 — Rails integration foundation

Checklist:

- [ ] `AgenticQuery::Schema` exposes entities, columns, types, primary keys and associations.
- [ ] Registry maps logical entity names to trusted ActiveRecord models.
- [ ] Adapter accepts only registered models.
- [ ] Rails gem supports Rails 7.1 through supported upper bound.
- [ ] Ruby >= 3.1 support is tested across supported Rubies.
- [ ] SQLite unit tests remain fast and deterministic.
- [ ] PostgreSQL integration suite is mandatory for database semantics.

### Phase R2 — ActiveRecord adapter completeness

Implement and test:

- [ ] projection
- [ ] aliases
- [ ] count/sum/avg/min/max
- [ ] equality/inequality predicates
- [ ] `in` / `not_in`
- [ ] null predicates
- [ ] `between`
- [ ] like/contains semantics
- [ ] ordering
- [ ] limit/offset
- [ ] group by
- [ ] having for supported aggregate predicates
- [ ] inner joins
- [ ] left joins
- [ ] association whitelist
- [ ] multi-tenant scopes
- [ ] row constraints
- [ ] denied fields
- [ ] entity allowlist

### Phase R3 — Rails security model

Mandatory execution order:

```text
Model scope
 -> tenant scope
 -> row constraint
 -> joins
 -> filters
 -> select
 -> group/having
 -> order
 -> bounded limit
 -> execution
```

Checklist:

- [ ] tenant scope cannot be removed by query AST
- [ ] row constraint cannot be removed by query AST
- [ ] denied columns fail before SQL generation
- [ ] unauthorized entities fail before SQL generation
- [ ] join targets must be registered associations
- [ ] polymorphic/unsafe joins fail closed unless explicitly supported
- [ ] write operations are rejected unless a separate, explicit mutation API is designed
- [ ] raw SQL fragments are prohibited in model-generated AST

### Phase R4 — PostgreSQL execution controls

Use database-level controls, not elapsed-time checks after execution.

Checklist:

- [ ] per-query `statement_timeout`
- [ ] cancellation/error normalization
- [ ] connection-level timeout policy
- [ ] bounded result materialization
- [ ] query duration measurement
- [ ] database error classification
- [ ] timeout integration test with a deterministic slow query fixture
- [ ] ensure timeout is reset after query execution on pooled connections

### Phase R5 — Rails public API

Target API:

```ruby
agent = AgenticQuery::Agent.new(
  model: "...",
  provider: provider,
  schema: schema,
  adapter: ActiveRecordAdapter.new(models: registry),
  policy: policy,
  semantic_catalog: catalog
)

agent.ask("What was revenue last month?")
```

Return:

```ruby
{
  query: ..., 
  result: ..., 
  metadata: ...
}
```

Optional answer synthesis must remain separate from query execution.

## 5. Node.js / TypeScript implementation plan

### Phase N1 — Core runtime

Checklist:

- [ ] Query AST
- [ ] SemanticQuery
- [ ] QueryPolicy
- [ ] ModelProvider
- [ ] SchemaProvider
- [ ] QueryAdapter
- [ ] SchemaRetriever
- [ ] QueryRepairer
- [ ] QueryPlanner
- [ ] PlanExecutor
- [ ] Observability hooks

### Phase N2 — Prisma

Support through native Prisma APIs, not raw SQL:

- [ ] findMany projection
- [ ] filters
- [ ] ordering
- [ ] take/skip
- [ ] aggregate
- [ ] groupBy
- [ ] having where supported by Prisma API
- [ ] relation-aware nested reads
- [ ] relation filters
- [ ] relation selection
- [ ] policy injection into where/select/order/group paths
- [ ] result normalization
- [ ] integration tests against PostgreSQL

Unsupported constructs must produce a typed capability error.

### Phase N3 — Drizzle

Two supported modes should remain explicit:

1. Host-owned compiler boundary.
2. Optional native compiler package once a stable Drizzle schema capability abstraction is available.

For the host-owned boundary:

- [ ] policy-aware compile callback
- [ ] schema provider
- [ ] capability declaration
- [ ] conformance fixtures
- [ ] execution wrapper
- [ ] documentation showing safe integration

Do not hide host responsibility behind a fake universal compiler.

### Phase N4 — Ollama

Use the existing Ollama SDK integration as a provider implementation.

Checklist:

- [ ] structured generation
- [ ] model selection
- [ ] timeout
- [ ] retry policy
- [ ] usage/token accounting where available
- [ ] tracing
- [ ] model capability metadata
- [ ] malformed structured-output handling
- [ ] provider error normalization

## 6. Semantic layer

### Semantic catalog

Support:

- [ ] metrics
- [ ] dimensions
- [ ] descriptions
- [ ] physical lineage
- [ ] aggregation
- [ ] filters
- [ ] formulas
- [ ] time grain
- [ ] units
- [ ] synonyms
- [ ] ownership/version

Example:

```yaml
metric: revenue
source: orders
expression:
  aggregate: sum
  field: amount
filter:
  status: completed
```

### Semantic resolution

```text
SemanticQuery
  -> catalog lookup
  -> trusted physical expression
  -> Query AST
  -> policy validation
```

Checklist:

- [ ] unknown metrics fail closed
- [ ] unauthorized physical fields cannot be reached through a metric
- [ ] formulas are deterministic
- [ ] circular metric definitions are rejected
- [ ] semantic versioning is recorded
- [ ] catalog changes invalidate affected caches

## 7. Schema retrieval

Implement tiers:

### Tier 1 — deterministic lexical retrieval

- entity names
- field names
- relation names
- question terms

### Tier 2 — hybrid retrieval

- lexical score
- embedding score
- semantic catalog score
- configurable weighted ranking

### Tier 3 — cache

- catalog/version keyed
- tenant/domain keyed
- TTL
- invalidation on schema/catalog change

Checklist:

- [ ] max entity count
- [ ] max token budget
- [ ] deterministic ordering
- [ ] tenant-aware retrieval
- [ ] no secret/system fields leaked into prompt context

## 8. Agent planning

Plan representation:

```text
Plan
├── query step
├── query step
└── derived computation
```

Checklist:

- [ ] stable step IDs
- [ ] DAG validation
- [ ] cycle detection
- [ ] forward references
- [ ] maximum step count
- [ ] per-step timeout
- [ ] per-step policy
- [ ] deterministic dependency ordering
- [ ] intermediate result references
- [ ] no arbitrary code execution
- [ ] explainable plan serialization

Example:

```text
Question: Top strategies by P&L contribution

Step 1: total P&L
Step 2: P&L grouped by strategy
Step 3: contribution = strategy P&L / total P&L
```

## 9. Result normalization and synthesis

### Result normalization

Convert adapter-specific results into:

```ts
interface QueryResult {
  columns: readonly ResultColumn[];
  rows: readonly unknown[][];
  rowCount: number;
  metadata: ResultMetadata;
}
```

Checklist:

- [ ] Prisma normalization
- [ ] Drizzle normalization
- [ ] ActiveRecord normalization
- [ ] decimal/date/time normalization policy
- [ ] null handling
- [ ] deterministic column order
- [ ] row count
- [ ] execution metadata

### Answer synthesis

Separate concerns:

```text
Database result
 -> deterministic result normalization
 -> optional LLM answer synthesis
```

The synthesis model receives only the normalized result and safe contextual metadata.

Checklist:

- [ ] no query rewriting during synthesis
- [ ] no access to database credentials
- [ ] no fabricated values
- [ ] cite columns/rows where useful
- [ ] return raw structured result alongside natural-language answer
- [ ] answer confidence/unsupported caveat when needed

## 10. Evaluation framework

Create a golden dataset with:

- natural-language question
- expected entities
- expected semantic metrics/dimensions
- expected filters
- expected sort
- expected limit
- expected result
- expected policy behavior

Metrics:

- AST exact match
- semantic intent accuracy
- execution correctness
- answer correctness
- policy violation rate
- repair success rate
- latency
- token usage
- cost

Adversarial dataset:

- prompt injection
- denied field requests
- unauthorized entities
- cross-tenant leakage attempts
- SQL injection-like text
- hallucinated schema fields
- oversized limits
- expensive query patterns
- unsupported semantics

## 11. Observability

Minimum event set:

```text
agent.started
schema.retrieved
plan.generated
query.generated
query.validation_failed
query.repaired
query.validated
query.compiled
query.executed
query.failed
answer.generated
agent.completed
```

Metadata:

- request ID
- tenant/domain ID when application supplies one
- model/provider
- model latency
- tokens/input/output when available
- query complexity
- plan step count
- database duration
- result row count
- repair attempts
- error code

Provide an observer interface and OpenTelemetry-compatible bridge without hard-coupling core to a telemetry vendor.

## 12. Testing strategy

### Unit

- AST validation
- semantic catalog
- semantic resolution
- schema retrieval
- policy
- planner
- repairer
- normalization
- observers

### Integration

Rails:

- SQLite fast suite
- PostgreSQL mandatory suite

Node:

- Prisma PostgreSQL
- Drizzle PostgreSQL
- provider integration tests with mocked model provider

### Conformance

Every adapter must run shared fixtures covering:

- reads
- filters
- ordering
- pagination
- aggregates
- group by
- joins
- policy rejection

### Security

Every supported ORM must prove:

- tenant isolation
- row constraints
- denied fields
- unauthorized entity rejection
- query size/limit enforcement
- timeout behavior
- unsupported construct fail-closed behavior

## 13. CI/CD

### Pull request CI

Required jobs:

- TypeScript typecheck
- lint
- unit tests
- build
- Ruby RSpec
- PostgreSQL integration
- security tests
- conformance suite
- version consistency check

Rules:

- [ ] no placeholder-success jobs
- [ ] no skipped critical suites
- [ ] zero tests in required suites = failure
- [ ] immutable dependency lockfile in CI
- [ ] supported Node/Ruby matrix documented

### Release pipeline

Triggered by version tag.

```text
tag
 -> verify versions
 -> install locked dependencies
 -> typecheck
 -> test
 -> build
 -> conformance
 -> package
 -> publish npm
 -> publish RubyGems
 -> GitHub release
```

Publishing requirements:

- [ ] npm trusted publishing/OIDC
- [ ] RubyGems trusted publishing where supported
- [ ] package provenance
- [ ] changelog verification
- [ ] version/tag equality
- [ ] dry-run validation
- [ ] release artifact verification

## 14. Versioning

Keep one coordinated release version for the workspace unless a package has a deliberate independent lifecycle.

Required files checked by automation:

- root package metadata
- every npm package
- Ruby gemspec
- Ruby VERSION constant
- CHANGELOG
- release tag

No release can proceed if these disagree.

## 15. Documentation checklist

Maintain:

- [ ] README
- [ ] architecture
- [ ] quickstart
- [ ] Rails guide
- [ ] Node.js guide
- [ ] Prisma guide
- [ ] Drizzle guide
- [ ] Ollama/provider guide
- [ ] semantic layer guide
- [ ] security model
- [ ] adapter capabilities
- [ ] conformance guide
- [ ] testing guide
- [ ] PostgreSQL integration guide
- [ ] release guide
- [ ] migration guide
- [ ] API reference
- [ ] examples
- [ ] troubleshooting
- [ ] changelog

Every feature must update documentation in the same delivery slice.

## 16. Rails application adoption checklist

```text
[ ] install gem
[ ] register models
[ ] expose schema provider
[ ] define policy
[ ] define tenant scope
[ ] define row constraints
[ ] deny sensitive fields
[ ] define semantic catalog
[ ] configure model provider
[ ] configure ActiveRecord adapter
[ ] configure PostgreSQL timeout
[ ] enable telemetry
[ ] run security suite
[ ] run golden evaluation
[ ] deploy with read-only DB credentials where possible
```

Recommended production database role:

- SELECT-only
- schema metadata access only where necessary
- no DDL
- no INSERT/UPDATE/DELETE
- no arbitrary functions

## 17. Node.js application adoption checklist

```text
[ ] install @agentic-query/core
[ ] install ORM adapter
[ ] install provider adapter
[ ] register SchemaProvider
[ ] define QueryPolicy
[ ] define tenant/row constraints
[ ] define semantic catalog
[ ] configure model provider
[ ] configure adapter
[ ] enable planner only when required
[ ] normalize results
[ ] enable telemetry
[ ] run PostgreSQL integration suite
[ ] run adversarial evaluation
[ ] deploy with least-privilege DB credentials
```

## 18. Migration strategy

For existing applications:

### Stage 1 — shadow mode

- generate queries
- validate policy
- compile query
- do not execute
- compare against current application result

### Stage 2 — controlled read-only execution

- enable small allowlist of entities
- enforce tenant scope
- enforce max rows/timeouts
- log every execution

### Stage 3 — expanded read scope

- add more entities/metrics
- enable planner
- enable synthesis

### Stage 4 — production default

- enforce all CI/security gates
- monitor violation/error/latency metrics
- maintain regression dataset

## 19. Performance checklist

- [ ] schema retrieval caching
- [ ] semantic catalog caching
- [ ] prompt-size limits
- [ ] model timeout
- [ ] bounded repair attempts
- [ ] bounded plan steps
- [ ] query complexity scoring
- [ ] database statement timeout
- [ ] result row cap
- [ ] result serialization cap
- [ ] concurrency limits
- [ ] backpressure

## 20. Security checklist

Before production:

- [ ] prompt injection defenses
- [ ] strict structured-output validation
- [ ] policy validation after generation and after repair
- [ ] policy passed into adapter compilation
- [ ] tenant scope enforced by trusted code
- [ ] field denial enforced by trusted code
- [ ] no raw SQL from model
- [ ] no arbitrary code execution
- [ ] no write operations in read API
- [ ] DB least privilege
- [ ] database timeouts
- [ ] row limits
- [ ] query complexity limits
- [ ] audit logs
- [ ] adversarial evaluation
- [ ] dependency/security scanning

## 21. Release definition of done

A release is production-ready only when all are true:

### Correctness

- [ ] supported AST features execute correctly
- [ ] conformance suite passes
- [ ] PostgreSQL integration passes
- [ ] golden dataset meets target accuracy

### Security

- [ ] tenant isolation passes
- [ ] denied-field tests pass
- [ ] adversarial suite passes
- [ ] database timeouts are enforced

### Agent

- [ ] structured generation
- [ ] semantic resolution
- [ ] bounded repair
- [ ] planning
- [ ] deterministic execution boundaries
- [ ] result normalization
- [ ] safe synthesis

### Operations

- [ ] telemetry
- [ ] latency/token/cost metrics
- [ ] error taxonomy
- [ ] dashboards/alerts in consuming application

### Distribution

- [ ] all packages version synchronized
- [ ] CI green
- [ ] release automation verified
- [ ] npm package publication verified
- [ ] RubyGems publication verified
- [ ] changelog/release notes complete
- [ ] documentation complete

## 22. Execution order

Use this order to minimize rework:

```text
1. CI/build correctness
2. AST + policy hardening
3. Rails tenant/security + PostgreSQL timeout
4. Prisma/Drizzle supported semantics
5. Cross-ORM conformance
6. Semantic formulas/catalog maturity
7. Planner + multi-step execution
8. Result normalization
9. Answer synthesis
10. Evaluation/golden/adversarial framework
11. Observability/OpenTelemetry bridge
12. Performance/caching/concurrency
13. Release automation
14. Documentation/examples/migration
15. v0.3 production release
16. v1.0 compatibility stabilization
```

## 23. Final program checklist

### Shared core
- [ ] versioned AST
- [ ] semantic AST
- [ ] validator
- [ ] policy
- [ ] schema retrieval
- [ ] semantic catalog
- [ ] repair
- [ ] planner
- [ ] plan executor
- [ ] result normalization
- [ ] answer synthesis
- [ ] observability
- [ ] evaluation

### Rails
- [ ] ActiveRecord adapter complete
- [ ] tenant isolation enforced
- [ ] row constraints enforced
- [ ] PostgreSQL statement timeout
- [ ] association-aware joins
- [ ] PostgreSQL integration matrix
- [ ] gem release pipeline

### Node.js
- [ ] Prisma native semantics
- [ ] Drizzle supported contract
- [ ] provider ecosystem
- [ ] PostgreSQL integrations
- [ ] npm release pipeline

### Platform
- [ ] CI is authoritative
- [ ] security gates are mandatory
- [ ] releases are reproducible
- [ ] docs stay synchronized with code
- [ ] compatibility policy published
- [ ] v1.0 release criteria met
