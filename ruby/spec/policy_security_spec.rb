# frozen_string_literal: true

require "active_record"
require "agentic_query"

ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:")

ActiveRecord::Schema.define do
  create_table :accounts do |t|
    t.string :name, null: false
  end

  create_table :orders do |t|
    t.integer :account_id, null: false
    t.decimal :amount, null: false
    t.string :status, null: false
  end
end

class Account < ActiveRecord::Base; end
class Order < ActiveRecord::Base; end

RSpec.describe "Agentic Query policy security" do
  subject(:adapter) { AgenticQuery::ActiveRecordAdapter.new(models: { orders: Order }) }

  it "applies a trusted row constraint before model-generated filters" do
    Order.create!(account_id: 1, amount: 100, status: "completed")
    Order.create!(account_id: 2, amount: 900, status: "completed")

    policy = AgenticQuery::Policy.new
    policy.constrain_rows("orders") { |relation| relation.where(account_id: 1) }

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }]
    }

    expect(adapter.compile(query, policy: policy).pluck(:amount).map(&:to_f).to eq([100.0])
  end

  it "rejects a denied field used in a filter" do
    policy = AgenticQuery::Policy.new
    policy.deny_fields("orders", "status")

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "filters" => [{
        "field" => { "field" => "status" },
        "operator" => "eq",
        "value" => "completed"
      }]
    }

    expect { adapter.compile(query, policy: policy) }
      .to raise_error(AgenticQuery::QueryValidationError, /Field is not allowed/)
  end

  it "fails closed for unsupported having semantics" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" }, "aggregate" => "sum" }],
      "groupBy" => [{ "field" => { "field" => "account_id" } }],
      "having" => [{
        "field" => { "field" => "amount" },
        "operator" => "gt",
        "value" => 100
      }]
    }

    expect { adapter.compile(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /HAVING expressions/)
  end
end
