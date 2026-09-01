# agentic_query

Ruby implementation of the Agentic Query runtime: deterministic query
contracts, application-owned policy enforcement, ActiveRecord compilation,
bounded repair, result normalization, and execution controls.

## Example

```ruby
models = { orders: Order, accounts: Account }
policy = AgenticQuery::Policy.new(max_rows: 100)
policy.allow_entities("orders")
policy.deny_fields("customers", "password_hash")
policy.constrain_tenant("orders") { |relation| relation.where(account_id: current_account.id) }

agent = AgenticQuery::Agent.new(
  model: "qwen3",
  provider: provider, # responds to generate_structured(request) -> { "output" => query }
  schema: AgenticQuery::Schema.new(models: models),
  adapter: AgenticQuery::ActiveRecordAdapter.new(models: models),
  policy: policy
)

result = agent.ask("What was revenue for completed orders?")
result.query       # validated query AST
result.rows        # executed rows
result.normalized  # { "columns" => ..., "rows" => ..., "row_count" => ... }
```

## Components

- `AgenticQuery::Policy` — entity/field/operator/aggregate allowlists,
  complexity ceilings, row constraints, tenant scopes, execution limits.
- `AgenticQuery::ActiveRecordAdapter` — trusted compilation in the
  documented execution order (tenant scope -> row constraint -> joins ->
  filters -> select -> group -> having -> order -> bounded limit).
- `AgenticQuery::PostgreSQLAdapter` — database-level `statement_timeout`
  via `SET LOCAL` inside a transaction (reset automatically on pooled
  connections).
- `AgenticQuery::Agent` — the full pipeline with bounded repair.
- `AgenticQuery::ResultNormalizer` — deterministic result normalization.
- `AgenticQuery::Conformance` — runs the shared JSON fixtures from
  `spec/conformance/v0.2` against any adapter.

## Testing

```bash
bundle install
bundle exec rspec --exclude-pattern "spec/integration/*"    # SQLite fast suite
DATABASE_URL=postgresql://... bundle exec rspec spec/integration  # PostgreSQL suite
```
