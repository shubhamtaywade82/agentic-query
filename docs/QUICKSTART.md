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

The model produces structured query intent. The runtime validates it against
the policy, repairs bounded failures, compiles through the adapter, executes,
normalizes the result deterministically, and can synthesize an answer from
the normalized result alone.

```ts
const result = await agent.ask('Show the top customers by revenue this month');
result.normalized; // QueryResult { columns, rows, rowCount, metadata }
result.answer;     // optional synthesis from the normalized result only
```

## Rails

Add the `agentic_query` gem to the application and configure the ActiveRecord
adapter. Keep database credentials and authorization in the Rails application.

```ruby
models = { orders: Order, customers: Customer }
policy = AgenticQuery::Policy.new(max_rows: 100)
policy.allow_entities("orders", "customers")
policy.deny_fields("customers", "password_digest")
policy.constrain_tenant("orders") { |relation| relation.where(account_id: Current.account.id) }

agent = AgenticQuery::Agent.new(
  model: "qwen3",
  provider: ollama_provider,
  schema: AgenticQuery::Schema.new(models: models),
  adapter: AgenticQuery::ActiveRecordAdapter.new(models: models),
  policy: policy
)

result = agent.ask("What was revenue for completed orders?")
result.normalized # { "columns" => ..., "rows" => ..., "row_count" => ... }
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
      expression: { field: 'amount', aggregate: 'sum', filter: [
        { field: { entity: 'orders', field: 'status' }, operator: 'eq', value: 'completed' }
      ] },
      units: 'USD',
      timeGrain: 'day',
      synonyms: ['sales', 'turnover']
    }
  ]
});
```

A semantic reference is resolved by trusted runtime code before ORM
compilation; derived metrics expand into deterministic computation trees.
Unknown metric names fail closed.

## Security model

Use read-only database credentials for read-oriented agents, explicit entity/field policies, tenant constraints, and bounded result sizes. Do not rely on prompts for authorization.
