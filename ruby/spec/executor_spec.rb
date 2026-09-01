# frozen_string_literal: true

require "spec_helper"

RSpec.describe AgenticQuery::Executor do
  subject(:executor) do
    described_class.new(
      adapter: AgenticQuery::ActiveRecordAdapter.new(models: { orders: Order }),
      policy: policy
    )
  end

  let(:policy) do
    AgenticQuery::Policy.new(
      execution_policy: AgenticQuery::ExecutionPolicy.new(max_rows: 2, timeout_ms: 5_000)
    )
  end

  before do
    3.times { |index| Order.create!(account_id: 1, customer_id: 1, status: "completed", amount: index + 1) }
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

  it "returns bounded, normalized results with execution metadata" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "id" } }]
    }

    result = executor.execute(query)

    expect(result["row_count"]).to eq(2)
    expect(result["rows"].length).to eq(2)
    expect(result).to include("duration_ms")
    expect(result["normalized"]["row_count"]).to eq(2)
    expect(result["normalized"]["columns"].map { |column| column["name"] }).to include("id")
  end
end
