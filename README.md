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

Early development. The core query, policy, semantic, retrieval, repair, and adapter foundations are implemented; production hardening, broader AST coverage, full adapter execution support, evaluation, and release validation are still in progress.

## License

MIT
