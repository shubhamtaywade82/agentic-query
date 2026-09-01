# Semantic Layer Guide

The semantic layer separates business meaning from physical database structure.

## Why it exists

A database might store revenue as `orders.amount`, but a business definition may mean only completed orders, exclude refunds, or use a specific currency conversion. Column names cannot reliably encode those rules.

## Definitions

```ts
new SemanticCatalog({
  version: '2025.1',
  metrics: [
    {
      name: 'revenue',
      description: 'Completed order value',
      entity: 'orders',
      expression: {
        field: 'amount',
        aggregate: 'sum',
        filter: [
          { field: { entity: 'orders', field: 'status' }, operator: 'eq', value: 'completed' }
        ]
      },
      timeGrain: 'day',
      units: 'USD',
      synonyms: ['sales', 'turnover'],
      owner: 'data-platform',
      version: '2'
    },
    {
      name: 'revenue_share',
      description: 'Revenue contribution ratio',
      entity: 'orders',
      expression: { field: 'amount', aggregate: 'sum' },
      formula: {
        operator: 'divide',
        left: { metric: 'revenue' },
        right: { metric: 'total_revenue' }
      }
    }
  ],
  dimensions: [
    {
      name: 'order_status',
      description: 'Order lifecycle status',
      entity: 'orders',
      field: 'status'
    }
  ]
});
```

Catalogs are immutable: `withDefinitions` returns a new catalog with a bumped
revision so caches keyed on revision invalidate deterministically. Circular
metric definitions are rejected at construction.

## Resolution

The model may generate:

```json
{
  "semantic": {
    "kind": "metric",
    "name": "revenue"
  }
}
```

Trusted runtime code resolves that reference to a physical query expression
before policy validation and ORM compilation. Metric-level filters are merged
as trusted AND conditions; formula (derived) metrics expand into their
physical inputs plus a deterministic computation tree that the plan executor
evaluates post-execution. Resolution never embeds model output into the
physical expression: only catalog-defined lineage is used.

## Design rules

- Business definitions belong in application-owned configuration.
- Semantic names should be stable and documented; synonyms are matched at
  resolution time.
- Unknown semantic names fail closed with `SemanticResolutionError`.
- Resolved expressions still pass through ordinary query and field policy checks.
- Formulas are deterministic binary trees over metrics and constants; no
  arbitrary code execution.
- Complex business logic should evolve the semantic expression model rather than being embedded in prompts.

## Future direction

Reusable dimensions, domain-specific catalogs, and embedding-based semantic
retrieval can be layered on without changing the model-provider abstraction.
