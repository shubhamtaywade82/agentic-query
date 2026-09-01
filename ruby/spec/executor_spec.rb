# frozen_string_literal: true

require "active_record"
require "agentic_query"

ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:")

ActiveRecord::Schema.define do
  create_table :orders do |table|
    table.string :status, null: false
    table.decimal :amount, null: false
  end
end

class ExecutorOrder < ActiveRecord::Base
  self.table_name = "orders"
end

RSpec.describe AgenticQuery::Executor do
  subject(:executor) do
    described_class.new(
      adapter: AgenticQuery::ActiveRecordAdapter.new(models: { orders: ExecutorOrder }),
      policy: policy
    )
  end

  let(:policy) do
    AgenticQuery::Policy.new(
      execution_policy: AgenticQuery::ExecutionPolicy.new(max_rows: 2, timeout_ms: 5_000)
    )
  end

  before do
    ExecutorOrder.delete_all
    3.times { |index| ExecutorOrder.create!(status: "completed", amount: index + 1) }
  end

  it "enforces the policy row limit" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "id" } }],
      "limit" => 100
    }

    expect { executor.execute(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /limit exceeds/)
  end

  it "returns bounded results" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "id" } }]
    }

    result = executor.execute(query)

    expect(result["row_count"]).to eq(2)
    expect(result["rows"].length).to eq(2)
    expect(result).to include("duration_ms")
  end
end
