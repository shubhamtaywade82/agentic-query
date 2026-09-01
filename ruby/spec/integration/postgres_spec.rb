# frozen_string_literal: true

require "spec_helper"

RSpec.describe "PostgreSQL integration" do
  before(:context) do
    skip "DATABASE_URL is not configured for PostgreSQL" unless ENV["DATABASE_URL"]&.start_with?("postgres")

    ActiveRecord::Base.establish_connection(ENV.fetch("DATABASE_URL"))
    ActiveRecord::Schema.define do
      create_table :orders, force: true do |t|
        t.string :status, null: false
        t.decimal :amount, precision: 12, scale: 2, null: false
        t.integer :account_id, null: false
      end
    end

    Order.delete_all
    Order.insert_all([
      { status: "completed", amount: 100, account_id: 1 },
      { status: "completed", amount: 200, account_id: 2 },
      { status: "pending", amount: 50, account_id: 1 }
    ])
  end

  after(:context) do
    if ActiveRecord::Base.connected? && ENV["DATABASE_URL"]&.start_with?("postgres")
      ActiveRecord::Base.connection.drop_table(:orders, if_exists: true)
      ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:")
      ActiveRecord::Schema.define do
        create_table :accounts, force: true do |table|
          table.string :name, null: false
          table.string :region, null: false
        end

        create_table :customers, force: true do |table|
          table.string :name, null: false
          table.string :password_hash, null: false
        end

        create_table :orders, force: true do |table|
          table.integer :account_id, null: false
          table.integer :customer_id, null: false
          table.decimal :amount, null: false
          table.string :status, null: false
          table.text :internal_note
        end
      end
    end
  end

  def adapter
    AgenticQuery::ActiveRecordAdapter.new(models: { "orders" => Order })
  end

  it "executes a policy-valid filtered relation" do
    policy = AgenticQuery::Policy.new
    policy.allow_entities("orders")

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "entity" => "orders", "field" => "id" } }],
      "filters" => [{
        "field" => { "entity" => "orders", "field" => "status" },
        "operator" => "eq",
        "value" => "completed"
      }],
      "limit" => 10
    }

    expect(adapter.compile(query, policy: policy).to_a.size).to eq(2)
  end

  it "enforces the tenant scope on PostgreSQL" do
    policy = AgenticQuery::Policy.new
    policy.constrain_tenant("orders") { |relation| relation.where(account_id: 1) }

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "entity" => "orders", "field" => "amount" } }]
    }

    amounts = adapter.compile(query, policy: policy).to_a.map { |row| row.amount.to_f }
    expect(amounts).to contain_exactly(100.0, 50.0)
  end

  it "enforces the execution row cap" do
    policy = AgenticQuery::Policy.new(
      execution_policy: AgenticQuery::ExecutionPolicy.new(max_rows: 1)
    )

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "entity" => "orders", "field" => "id" } }]
    }

    expect(adapter.compile(query, policy: policy).to_a.size).to eq(1)
  end

  it "enforces per-query statement_timeout with a deterministic slow fixture" do
    policy = AgenticQuery::Policy.new(execution_policy: AgenticQuery::ExecutionPolicy.new(max_rows: 10, timeout_ms: 300))
    pg_adapter = AgenticQuery::PostgreSQLAdapter.new

    # Deterministic slow query: pg_sleep(5) exceeds the 300ms budget and is
    # cancelled by the database, not by post-hoc elapsed-time checks.
    slow_relation = Order.connection.select_all("SELECT pg_sleep(5)")
    expect do
      pg_adapter.execute(slow_relation, max_rows: 10, timeout_ms: policy.timeout_ms)
    end.to raise_error(AgenticQuery::QueryExecutionError, /timeout/i)
  end

  it "resets statement_timeout after execution on pooled connections" do
    pg_adapter = AgenticQuery::PostgreSQLAdapter.new
    fast_relation = Order.limit(1)

    pg_adapter.execute(fast_relation, max_rows: 10, timeout_ms: 300)

    # SET LOCAL is scoped to the transaction; after execution the session
    # must not retain a narrowed timeout on the pooled connection.
    remaining = Order.connection.select_value("SHOW statement_timeout").to_s
    expect(remaining).not_to eq("300ms")
  end

  it "normalizes database errors through the executor" do
    policy = AgenticQuery::Policy.new
    policy.deny_fields("orders", "amount")
    executor = AgenticQuery::Executor.new(adapter: AgenticQuery::PostgreSQLAdapter.new, policy: policy)

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "entity" => "orders", "field" => "amount" } }]
    }

    expect { executor.execute(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /Field is not allowed/)
  end
end
