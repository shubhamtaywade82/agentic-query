# Semantic Layer Guide

The semantic layer separates business meaning from physical database structure.

## Why it exists

A database might store revenue as `orders.amount`, but a business definition may mean only completed orders, exclude refunds, or use a specific currency conversion. Column names cannot reliably encode those rules.

## Definitions

```ts
new SemanticCatalog({
  metrics: [
    {
      name: 'revenue',
      description: 'Completed order value',
      entity: 'orders',
      expression: { field: 'amount', aggregate: 'sum' }
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

Trusted runtime code resolves that reference to a physical query expression before policy validation and ORM compilation.

## Design rules

- Business definitions belong in application-owned configuration.
- Semantic names should be stable and documented.
- Unknown semantic names fail closed.
- Resolved expressions still pass through ordinary query and field policy checks.
- Complex business logic should evolve the semantic expression model rather than being embedded in prompts.

## Future direction

The semantic layer can later support formulas, filters, time grains, derived metrics, dimensions, reusable joins, and domain-specific metric catalogs without changing the model-provider abstraction.
