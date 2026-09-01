# Agentic Query

**ORM-native AI query runtime for Rails and Node.js applications.**

Agentic Query lets an LLM interpret a natural-language data question while keeping schema access, semantic definitions, authorization, policy enforcement, ORM compilation, and database execution under application control.

## Core principle

```text
User question
     |
     v
Schema + Semantic Context
     |
     v
Structured model output
     |
     v
Semantic Query AST
     |
     v
Trusted semantic resolution
     |
     v
Policy validation
     |
     v
Bounded repair (when required)
     |
     v
ORM adapter
     |
     v
Database
```

The model does **not** receive unrestricted database execution privileges, and prompts are not treated as an authorization boundary.

## Packages

### TypeScript

- `@agentic-query/core` — Query AST, policies, model-provider contract, schema retrieval, semantic catalog, generator, repair, and agent orchestration.
- `@agentic-query/prisma` — Prisma adapter boundary.
- `@agentic-query/drizzle` — Drizzle adapter boundary.
- `@agentic-query/ollama` — Ollama model-provider integration.

### Ruby

- `agentic_query` — Ruby/Rails foundation with ActiveRecord integration, policy enforcement, row/tenant constraints, and execution controls.

## Example

```ts
const agent = new AgenticQueryAgent({
  model: 'your-model',
  modelProvider,
  schemaProvider,
  queryAdapter,
  policy: {
    allowedEntities: ['orders', 'customers'],
    deniedFields: {
      customers: ['passwordHash']
    },
    maxRows: 100
  },
  semanticCatalog: catalog
});

const result = await agent.ask('Show the top customers by revenue this month');

result.query;        // validated Query AST
result.result;       // adapter-specific execution result
result.normalized;   // deterministic QueryResult (columns/rows/rowCount)
result.answer;       // optional synthesized natural-language answer
```

The exact adapter/provider construction depends on the host application.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Quickstart](docs/QUICKSTART.md)
- [ORM adapters](docs/ADAPTERS.md)
- [Model providers](docs/PROVIDERS.md)
- [Semantic layer](docs/SEMANTIC_LAYER.md)
- [Security](docs/SECURITY.md)
- [Testing and conformance](docs/TESTING.md)
- [Releasing](docs/RELEASING.md)
- [Roadmap](docs/ROADMAP.md)

## Security

Treat all model output as untrusted input. Use explicit entity and field policies, trusted tenant/row constraints, bounded result sizes, database-level least privilege, and adapter-specific execution controls.

See [SECURITY.md](SECURITY.md) and [docs/SECURITY.md](docs/SECURITY.md).

## Status

v0.3.0. The deterministic core is implemented end to end: versioned query AST
with structural validation and complexity limits, application-owned policies
(entities, fields, operators, aggregates, joins, tenant/row constraints),
semantic catalog with formulas and lineage, Tier 1–3 schema retrieval with
denied-field scrubbing, bounded repair, deterministic result normalization,
optional answer synthesis, an evaluation framework with golden and adversarial
datasets, OpenTelemetry-compatible observability, a cross-ORM conformance
suite, Prisma/Drizzle/Ollama integrations, and the Rails runtime with
`AgenticQuery::Agent`. CI enforces typecheck, lint, tests, PostgreSQL
integration, security suites, conformance, and coordinated versions.

## License

MIT
