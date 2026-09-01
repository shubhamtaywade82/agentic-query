# Query AST Conformance v0.2

Conformance fixtures define the minimum semantic behavior expected from every Agentic Query adapter.

Each adapter is responsible for translating the canonical AST into its native ORM representation while preserving the same intent.

## Rules

- Fixtures are language-neutral JSON.
- Adapters must not weaken policy semantics.
- Unsupported constructs must fail closed.
- Adapter tests should assert semantic properties rather than exact SQL formatting.

The initial v0.2 suite covers basic selection, filtering, ordering, and limits.
