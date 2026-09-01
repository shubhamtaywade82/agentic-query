# frozen_string_literal: true

require "agentic_query"

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
end
