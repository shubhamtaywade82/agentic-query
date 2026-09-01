# Query AST v0.1 Conformance

Implementations MUST preserve the semantics of the v0.1 Query AST.

## Required behaviors

- `source.name` identifies a registered entity.
- `select` contains at least one field expression.
- `aggregate` supports `count`, `sum`, `avg`, `min`, and `max`.
- `filters` support the operators defined by the schema.
- `groupBy` groups by referenced fields.
- `orderBy.direction` is limited to `asc` or `desc`.
- `limit` is positive and bounded by the runtime policy.
- `offset` is non-negative.
- Unknown entities, fields, operators, or unsafe policy violations MUST fail closed.
- Policy behavior is part of the runtime contract and MUST NOT depend on an LLM prompt.

## Fixture rule

Every language/runtime implementation should consume the JSON fixtures in this directory or equivalent decoded fixtures and assert the same acceptance/rejection semantics.

Generated SQL is implementation-specific; query meaning is not.
