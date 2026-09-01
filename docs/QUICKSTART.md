# Quickstart

Agentic Query separates model reasoning from database execution.

## TypeScript

Install the core package and an ORM/provider adapter:

```bash
pnpm add @agentic-query/core @agentic-query/prisma @agentic-query/ollama
```

Create the runtime using your application's existing Prisma client and Ollama client adapter.

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
  }
});

const answer = await agent.ask('Show the top customers by revenue this month');
```

The model produces structured query intent. The runtime validates it before adapter execution.

## Rails

Add the `agentic_query` gem to the application and configure the ActiveRecord adapter. Keep database credentials and authorization in the Rails application.

```ruby
AgenticQuery.policy do
  allow :read, Order
  allow :read, Customer
  deny_fields Customer, [:password_digest]
end
```

## Semantic metrics

Define business concepts separately from physical schema:

```ts
const catalog = new SemanticCatalog({
  metrics: [
    {
      name: 'revenue',
      description: 'Completed order value',
      entity: 'orders',
      expression: { field: 'amount', aggregate: 'sum' }
    }
  ]
});
```

A semantic reference is resolved by trusted runtime code before ORM compilation.

## Security model

Use read-only database credentials for read-oriented agents, explicit entity/field policies, tenant constraints, and bounded result sizes. Do not rely on prompts for authorization.
