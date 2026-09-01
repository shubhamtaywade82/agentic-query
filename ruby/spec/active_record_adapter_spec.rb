# frozen_string_literal: true

require "active_record"
require "agentic_query"

ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:")

ActiveRecord::Schema.define do
  create_table :orders do |table|
    table.string :status, null: false
    table.decimal :amount, null: false
    table.integer :account_id, null: false, default: 0
  end
end

class Order < ActiveRecord::Base; end

RSpec.describe AgenticQuery::ActiveRecordAdapter do
  subject(:adapter) { described_class.new(models: { orders: Order }) }

  before do
    Order.delete_all
    Order.create!(status: "completed", amount: 100, account_id: 1)
    Order.create!(status: "completed", amount: 250, account_id: 2)
    Order.create!(status: "cancelled", amount: 50, account_id: 1)
  end

  it "compiles a filtered relation" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "filters" => [{
        "field" => { "field" => "status" },
        "operator" => "eq",
        "value" => "completed"
      }]
    }

    result = adapter.compile(query).to_a

    expect(result.map(&:amount).map(&:to_f)).to contain_exactly(100.0, 250.0)
  end

  it "compiles an aggregate and group query" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [
        { "field" => { "field" => "status" } },
        { "field" => { "field" => "amount" }, "aggregate" => "sum", "alias" => "total" }
      ],
      "groupBy" => [{ "field" => "status" }]
    }

    result = adapter.compile(query).to_a

    expect(result.map { |row| [row.status, row.total.to_f] })
      .to contain_exactly(["completed", 350.0], ["cancelled", 50.0])
  end

  it "applies a trusted tenant scope before user filters" do
    policy = AgenticQuery::Policy.new
    policy.constrain_tenant("orders") { |relation| relation.where(account_id: 1) }

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "filters" => [{
        "field" => { "field" => "status" },
        "operator" => "eq",
        "value" => "completed"
      }]
    }

    result = adapter.compile(query, policy: policy).to_a

    expect(result.map(&:amount).map(&:to_f)).to contain_exactly(100.0)
  end

  it "caps query rows by the execution policy" do
    policy = AgenticQuery::Policy.new(execution_policy: AgenticQuery::ExecutionPolicy.new(max_rows: 1))
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }]
    }

    expect(adapter.compile(query, policy: policy).to_a.size).to eq(1)
  end

  it "rejects an unregistered entity" do
    query = {
      "source" => { "name" => "users" },
      "select" => [{ "field" => { "field" => "id" } }]
    }

    expect { adapter.compile(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /not registered/)
  end

  it "enforces denied fields before compilation" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }]
    }
    policy = AgenticQuery::Policy.new
    policy.deny_fields("orders", "amount")

    expect { adapter.compile(query, policy: policy) }
      .to raise_error(AgenticQuery::QueryValidationError, /Field is not allowed/)
  end
end
