# Changelog

All notable changes to Agentic Query will be documented here.

## 0.3.0

End-to-end implementation of the master delivery plan across the TypeScript
packages and the Ruby gem.

### Core (`@agentic-query/core`)

- Versioned query AST (`0.1`, `0.2`) with structural validation, complexity
  scoring, and operator/aggregate/join allowlists.
- Expanded `QueryPolicy`: `maxComplexity`, `allowedOperators`,
  `allowedAggregates`, `allowedJoinTypes`, `timeoutMs`, `forcedFilters`
  (trusted tenant/row predicates), `allowedCapabilities`; `mergePolicies`
  overlays can only narrow permissions.
- Deterministic result normalization (`QueryResult`: columns, rows,
  rowCount, metadata) for row, aggregate, and tuple shapes with decimal,
  date, null, and row-cap policies; bounded serialization for prompts.
- Optional answer synthesis, strictly separate from execution: the
  synthesis model receives only the normalized result and safe context,
  never the AST or credentials.
- Semantic catalog maturity: metric formulas (deterministic computation
  trees), metric-level filters, time grain, units, synonyms, owner,
  versioned definitions with revision-based cache invalidation, and
  circular-definition rejection.
- Schema retrieval tiers: Tier 1 lexical with token budget and cache,
  Tier 2 hybrid ranking (lexical + semantic catalog + optional embedding
  scorer), denied-field scrubbing so secrets never reach prompt context,
  tenant-scoped cache keys, and invalidation.
- Planner: computation steps for derived metrics, per-step policy and
  timeout, stable topological ordering, explainable serialization.
- Plan executor: per-step validation and compile, timeout enforcement,
  deterministic computation evaluation over normalized results.
- Observability: full event set (`agent.started` … `agent.completed`),
  request/tenant/model metadata, and an OpenTelemetry-compatible bridge
  without vendor coupling.
- Evaluation framework: golden and adversarial datasets with AST exact
  match, semantic intent accuracy, policy violation, and repair success
  metrics; deterministic prompt-injection screening.
- Conformance: shared JSON fixtures with real semantic assertions
  (selection, filters, ordering, pagination, aggregates, groupBy, joins,
  policy rejection) executed through adapter probes.
- Fixed a circular-import defect that broke ten test suites; repair now
  reports the true validation failure and retries transient provider
  errors with bounded backoff.

### Prisma (`@agentic-query/prisma`)

- Fixed the aggregate compile defect that double-wrapped `_sum`-style
  arguments.
- Relation-aware nested reads: registered relations compile to
  `include` blocks with folded relation `where`/`select`; unregistered
  joins fail closed.
- `PrismaExecutor` executes compiled operations against host-supplied
  model delegates and normalizes results deterministically.
- Policy `forcedFilters` are injected into `where`; `take` is bounded by
  `maxRows` when no explicit limit exists; aggregate capability gating.

### Drizzle (`@agentic-query/drizzle`)

- Capability declaration with fail-closed semantics; validation always
  precedes host compilation; HAVING rejects closed; result normalization
  passthrough; conformance probes for host-owned compilers.

### Ollama (`@agentic-query/ollama`)

- Full provider: model selection, per-request timeout, bounded retry with
  backoff, usage accounting, trace metadata, capability metadata,
  malformed structured-output rejection, and normalized provider errors.
- Tests (previously none existed).

### Ruby (`agentic_query`)

- `AgenticQuery::Agent` public API: retrieval, bounded repair, compile,
  execute, normalize, optional synthesis; the provider never receives
  credentials.
- Policy: convenience kwargs (`max_rows:`, `timeout_ms:`), structural
  validation, operator/aggregate allowlists, complexity ceilings.
- Fixed the inverted `nullable` flag in `AgenticQuery::Schema`.
- `ResultNormalizer`, `SchemaRetriever` (denied-field scrubbing, cache),
  and a conformance harness executing the shared JSON fixtures.
- PostgreSQL integration: deterministic `pg_sleep` statement-timeout test,
  timeout reset verification on pooled connections, error normalization.
- Shared spec_helper with isolated SQLite schema; fixed the syntax error
  that aborted the suite and the API mismatches in policy specs;
  Gemfile.lock and version constant for reproducible CI.

### CI/CD

- CI now runs typecheck, lint, unit tests, build, Ruby RSpec, PostgreSQL
  integration, the conformance suite, security tests, and the version
  consistency check with immutable lockfiles and zero-test guards.
- Release pipeline: OIDC trusted publishing for npm, RubyGems trusted
  publishing, provenance, changelog and tag verification, and a dry-run
  validation job.
