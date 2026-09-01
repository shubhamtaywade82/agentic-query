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

- [ ] Complete ActiveRecord association-aware join semantics
- [ ] Complete Prisma relation-aware execution semantics
- [ ] Implement optional/native Drizzle compiler where feasible
- [ ] Cross-ORM conformance result-equivalence suite
- [ ] PostgreSQL integration matrix
- [ ] Database-level timeout/cancellation verification
- [ ] Query complexity and resource limits
- [ ] Complete tenant/row-security adversarial suite
- [ ] Result normalization contract
- [ ] CI green across all required jobs

## v0.4 — Agent runtime

- [ ] LLM-generated multi-step plans
- [ ] Intermediate result references
- [ ] Plan explanation
- [ ] Structured repair diagnostics
- [ ] Conversation/task context
- [ ] Safe answer synthesis

## v0.5 — Advanced semantic layer

- [ ] Derived metrics
- [ ] Metric formulas
- [ ] Time grains
- [ ] Reusable dimensions
- [ ] Semantic lineage
- [ ] Domain-specific catalogs
- [ ] Catalog versioning and invalidation

## v0.6 — Evaluation and observability

- [ ] Golden query dataset
- [ ] Semantic correctness evaluation
- [ ] Execution correctness evaluation
- [ ] Security adversarial evaluation
- [ ] Provider/model benchmarks
- [ ] OpenTelemetry bridge
- [ ] Token/cost/latency metrics
- [ ] Regression dashboards

## v0.7 — Provider ecosystem

- [ ] Production Ollama capability coverage
- [ ] Additional provider adapters
- [ ] Streaming structured generation
- [ ] Provider capability negotiation
- [ ] Provider fallback strategy

## v0.8 — Performance and operations

- [ ] Schema retrieval caching
- [ ] Semantic catalog caching
- [ ] Prompt/context budgets
- [ ] Concurrency controls
- [ ] Backpressure
- [ ] Result serialization limits
- [ ] Operational audit logging

## v0.9 — Release candidate

- [ ] Full documentation synchronization
- [ ] Migration guide
- [ ] Compatibility test matrix
- [ ] Security review
- [ ] Dependency/license review
- [ ] Reproducible release verification
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
