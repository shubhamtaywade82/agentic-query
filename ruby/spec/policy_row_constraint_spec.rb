# frozen_string_literal: true

require_relative "spec_helper"

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
