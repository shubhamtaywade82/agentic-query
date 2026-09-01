# Roadmap

Agentic Query is being developed in staged layers. Deterministic query execution and security primitives are built before broader autonomous behavior.

## Completed foundations

### v0.1 — Deterministic core

- Shared Query AST foundation
- TypeScript core package
- Ruby gem foundation
- Query validation
- Entity and field policy validation
- CI/repository governance

### v0.2 — ORM/model boundaries

- ActiveRecord adapter foundation
- Prisma adapter boundary
- Drizzle adapter boundary
- Model provider abstraction
- Ollama provider package
- Schema provider/retrieval abstraction
- Semantic catalog foundation
- Bounded query repair
- Agent orchestration foundation
- Semantic Query v0.2 foundation

## Next

### v0.3 — Production adapter/runtime hardening

- Complete cross-ORM conformance suite
- PostgreSQL integration tests
- Association-aware ActiveRecord execution coverage
- Complete Prisma/Drizzle AST coverage
- Database-level timeout/cancellation controls
- Strong tenant/row-level security semantics
- Deterministic query planning and explainability

### v0.4 — Agent runtime

- Semantic-aware query generation
- Multi-step planning
- Query repair with structured diagnostics
- Result normalization
- Natural-language result synthesis
- Conversation/task context

### v0.5 — Advanced semantic layer

- Derived metrics
- Metric formulas
- Time grains
- Reusable dimensions
- Domain-specific catalogs
- Semantic lineage

### v0.6 — Evaluation and observability

- Golden query dataset
- Semantic correctness evaluation
- Security adversarial evaluation
- Provider/model benchmarks
- Query-plan telemetry
- Cost/latency metrics

### v0.7 — Provider ecosystem

- Production Ollama integration
- Additional model-provider adapters
- Streaming support
- Provider capability negotiation

### v1.0 — Stable developer platform

- Stable Query AST
- Stable policy API
- Stable provider/adapter contracts
- Production documentation
- Release provenance
- Compatibility policy
- npm and RubyGems release automation

## Non-goals

- Direct unrestricted LLM-to-database SQL execution
- LLM-generated application code execution
- Authorization implemented only through prompts
- Hiding unsupported database semantics behind silent fallbacks
