# frozen_string_literal: true

require "spec_helper"

RSpec.describe AgenticQuery::Policy do
  let(:query) do
    {
      "source" => { "name" => "orders" },
      "select" => [
        { "field" => { "field" => "amount" } }
      ],
      "filters" => [
        {
          "field" => { "field" => "status" },
          "operator" => "eq",
          "value" => "completed"
        }
      ],
      "limit" => 10
    }
  end

  it "allows configured entities and fields" do
    policy = described_class.new(max_rows: 100)
    policy.allow_entities("orders")

    expect(policy.authorize!(query)).to eq(query)
  end

  it "rejects an entity outside the allowlist" do
    policy = described_class.new
    policy.allow_entities("customers")

    expect { policy.authorize!(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /Entity is not allowed/)
  end

  it "rejects denied selected fields" do
    policy = described_class.new
    policy.deny_fields("orders", "amount")

    expect { policy.authorize!(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /Field is not allowed/)
  end

  it "rejects limits above the policy maximum" do
    policy = described_class.new(max_rows: 5)

    expect { policy.authorize!(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /limit exceeds/)
  end

  it "rejects operators outside the allowed set" do
    policy = described_class.new
    policy.allow_operators("gt")

    expect { policy.authorize!(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /operator is not allowed/)
  end

  it "rejects aggregates outside the allowed set" do
    aggregate_query = query.merge(
      "select" => [{ "field" => { "field" => "amount" }, "aggregate" => "sum" }]
    )
    policy = described_class.new
    policy.allow_aggregates("count")

    expect { policy.authorize!(aggregate_query) }
      .to raise_error(AgenticQuery::QueryValidationError, /Aggregate is not allowed/)
  end

  it "enforces a deterministic complexity ceiling" do
    policy = described_class.new
    policy.max_complexity = 1

    expect { policy.validate_structure!(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /complexity 2 exceeds policy maximum 1/)
  end

  it "supports both execution_policy and convenience kwargs" do
    expect(described_class.new(max_rows: 10).max_rows).to eq(10)
    expect(described_class.new(timeout_ms: 500).timeout_ms).to eq(500)
    expect do
      described_class.new(execution_policy: AgenticQuery::ExecutionPolicy.new, max_rows: 10)
    end.to raise_error(ArgumentError)
  end
end
