# frozen_string_literal: true

require "bundler/setup"
require "active_record"
require "agentic_query"

RSpec.describe "PostgreSQL integration" do
  before(:context) do
    skip "DATABASE_URL is not configured" unless ENV["DATABASE_URL"]

    ActiveRecord::Base.establish_connection(ENV.fetch("DATABASE_URL"))
    ActiveRecord::Schema.define do
      create_table :orders, force: true do |t|
        t.string :status, null: false
        t.decimal :amount, precision: 12, scale: 2, null: false
        t.integer :account_id, null: false
      end
    end

    class Order < ActiveRecord::Base
    end

    Order.insert_all([
      { status: "completed", amount: 100, account_id: 1 },
      { status: "completed", amount: 200, account_id: 2 },
      { status: "pending", amount: 50, account_id: 1 }
    ])
  end

  after(:context) do
    ActiveRecord::Base.connection.drop_table(:orders, if_exists: true) if ActiveRecord::Base.connected?
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
end
