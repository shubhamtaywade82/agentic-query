# frozen_string_literal: true

require "active_record"
require "sqlite3"
require "agentic_query"

ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:")

ActiveRecord::Schema.define do
  create_table :orders, force: true do |table|
    table.integer :account_id, null: false
    table.decimal :amount, null: false
  end
end

class PolicyOrder < ActiveRecord::Base
  self.table_name = "orders"
end

RSpec.describe "row-level policy enforcement" do
  it "adds the trusted application predicate to the relation" do
    policy = AgenticQuery::Policy.new
    policy.constrain_rows("orders") { |relation| relation.where(account_id: 42) }

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }]
    }

    relation = AgenticQuery::ActiveRecordAdapter.new(models: { orders: PolicyOrder })
      .compile(query, policy: policy)

    expect(relation.where_values_hash["account_id"]).to eq(42)
  end
end
