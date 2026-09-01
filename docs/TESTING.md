# Testing and Conformance

Agentic Query has two classes of correctness to protect:

1. deterministic runtime correctness;
2. model-dependent semantic correctness.

## Unit tests

Core unit tests should cover AST validation, policy decisions, semantic resolution, schema retrieval, repair behavior, and provider contracts.

## Adapter tests

Each ORM adapter should test every supported AST construct and explicitly test unsupported constructs fail closed.

## Conformance fixtures

Shared JSON fixtures under `spec/conformance/` describe canonical query cases. Ruby and TypeScript implementations should consume the same fixtures where practical.

```text
          canonical fixture
                 |
        +--------+--------+
        |                 |
        v                 v
      Ruby               TS
        |                 |
   ActiveRecord     Prisma/Drizzle
        |                 |
        +--------+--------+
                 v
          same semantics
```

## Security regression tests

Test attempts to:

- access denied entities;
- select denied fields;
- bypass tenant scopes through filters or joins;
- exceed result limits;
- trigger unbounded repair loops;
- introduce executable code or SQL through model output.

## Evaluation tests

Maintain a golden question set containing expected entities, semantic concepts, policies, and result expectations. Run it when changing prompts, models, retrievers, planners, or semantic definitions.
