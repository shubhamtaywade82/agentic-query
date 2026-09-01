# Roadmap

Agentic Query is developed in dependency order: security and deterministic execution first, then semantic intelligence, planning, evaluation, and distribution.

The exhaustive delivery checklist is maintained in [`docs/IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

## Completed foundations

### v0.1 — Deterministic core

- Shared Query AST foundation
- TypeScript core package
- Ruby gem foundation
- Query validation
- Entity and field policy validation
- CI/repository governance

### v0.2 — Runtime foundations

- ActiveRecord adapter foundation and tenant scope enforcement
- Prisma native read/aggregate/groupBy compilation
- Drizzle policy-aware host compiler boundary
- Model provider abstraction
- Ollama provider package
- Schema provider and retrieval abstraction
- Semantic catalog and semantic-query resolution
- Bounded query repair
- Agent orchestration foundation
- Query planner and bounded plan executor
- Provider-neutral observability hooks
- PostgreSQL integration foundation
- Release/version consistency checks

## v0.3 — Production hardening

- [x] Complete ActiveRecord association-aware join semantics (singular/plural
      association resolution, left joins, join-entity filters and projections)
- [x] Complete Prisma relation-aware execution semantics (nested
      `include` with relation `where`/`select`; unregistered joins fail closed)
- [x] Optional/native Drizzle compiler remains a v1.0 candidate; host-owned
      boundary hardened with capability declaration and fail-closed semantics
- [x] Cross-ORM conformance result-equivalence suite (shared JSON fixtures
      executed by core, Prisma, Drizzle, and the Ruby ActiveRecord adapter)
- [x] Database-level timeout/cancellation verification (deterministic
      `pg_sleep` fixture; `SET LOCAL statement_timeout` reset verified)
- [x] Query complexity and resource limits (deterministic score enforced by
      policy in both runtimes)
- [x] Complete tenant/row-security adversarial suite (TS + Ruby)
- [x] Result normalization contract (columns/rows/rowCount/metadata with
      decimal, date, null, and cap policies)
- [x] CI green across all required jobs (typecheck, lint, unit, build,
      Ruby, PostgreSQL integration, security, conformance, version
      consistency; zero-test guards; frozen lockfiles)

Delivered ahead of the original v0.3 scope (from later milestones):

- Answer synthesis separated from execution (v0.4 scope)
- Derived metrics, formulas, metric-level filters, synonyms, time grains,
  units, ownership, catalog versioning with revision-based invalidation
  (v0.5 scope)
- Golden/adversarial evaluation framework and OpenTelemetry-compatible
  bridge with the full event set (v0.6 scope)
- Ollama provider hardening: timeout, bounded retry, usage accounting,
  trace metadata, capability metadata, fail-closed structured output
  (v0.7 scope)
- Schema retrieval caching with token budgets and tenant-scoped keys,
  result serialization limits (v0.8 scope)
- OIDC trusted publishing, provenance, dry-run artifact verification, and
  coordinated version checks across npm packages, gemspec, VERSION, and
  CHANGELOG (v0.9 scope)

## v0.4 — Agent runtime

- [ ] LLM-generated multi-step plans
- [x] Intermediate result references (derived computations over normalized results)
- [x] Plan explanation (deterministic serialization)
- [ ] Structured repair diagnostics
- [ ] Conversation/task context
- [x] Safe answer synthesis

## v0.5 — Advanced semantic layer

- [x] Derived metrics
- [x] Metric formulas
- [x] Time grains
- [ ] Reusable dimensions
- [x] Semantic lineage (physical field lineage on every definition)
- [ ] Domain-specific catalogs
- [x] Catalog versioning and invalidation

## v0.6 — Evaluation and observability

- [x] Golden query dataset
- [x] Semantic correctness evaluation
- [ ] Execution correctness evaluation against live databases
- [x] Security adversarial evaluation
- [ ] Provider/model benchmarks
- [x] OpenTelemetry bridge
- [x] Token/cost/latency metrics (usage accounting surfaced by providers)
- [ ] Regression dashboards

## v0.7 — Provider ecosystem

- [x] Production Ollama capability coverage
- [ ] Additional provider adapters
- [ ] Streaming structured generation
- [ ] Provider capability negotiation
- [ ] Provider fallback strategy

## v0.8 — Performance and operations

- [x] Schema retrieval caching
- [x] Semantic catalog caching (revision-keyed)
- [x] Prompt/context budgets
- [ ] Concurrency controls
- [ ] Backpressure
- [x] Result serialization limits
- [ ] Operational audit logging

## v0.9 — Release candidate

- [x] Full documentation synchronization
- [ ] Migration guide
- [ ] Compatibility test matrix
- [ ] Security review
- [ ] Dependency/license review
- [x] Reproducible release verification (frozen lockfiles, dry-run job)
- [ ] npm/RubyGems publication rehearsal

## v1.0 — Stable developer platform

- [ ] Stable Query AST
- [ ] Stable policy API
- [ ] Stable semantic API
- [ ] Stable provider/adapter contracts
- [ ] Production documentation
- [ ] Release provenance
- [ ] Compatibility policy
- [ ] npm release automation verified
- [ ] RubyGems release automation verified
- [ ] CI required checks enforced

## Non-goals

- Direct unrestricted LLM-to-database SQL execution
- LLM-generated application code execution
- Authorization implemented only through prompts
- Silent fallback to unsupported database semantics
- Unbounded autonomous database access
