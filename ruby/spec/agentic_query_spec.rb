# frozen_string_literal: true

require "spec_helper"

RSpec.describe AgenticQuery::QueryValidator do
  let(:query) do
    {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "filters" => [{ "field" => { "field" => "status" }, "operator" => "eq", "value" => "paid" }],
      "limit" => 10
    }
  end

  it "accepts a valid query" do
    expect(described_class.validate!(query, max_rows: 100)).to eq(query)
  end

  it "accepts an explicit Policy instance" do
    policy = AgenticQuery::Policy.new(max_rows: 100)
    expect(described_class.validate!(query, policy)).to eq(query)
  end

  it "rejects a query above the configured row limit" do
    expect {
      described_class.validate!(query.merge("limit" => 101), max_rows: 100)
    }.to raise_error(AgenticQuery::QueryValidationError, /exceeds policy maximum/)
  end

  it "rejects structural problems before authorization" do
    expect {
      described_class.validate!({ "source" => { "name" => "orders" }, "select" => [] })
    }.to raise_error(AgenticQuery::QueryValidationError, /at least one select/)
  end

  it "rejects a forbidden field used in a filter" do
    policy = AgenticQuery::Policy.new
    policy.deny_fields("orders", "status")

    expect { policy.authorize!(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /Field is not allowed/)
  end

  it "rejects an entity outside the allowlist" do
    policy = AgenticQuery::Policy.new
    policy.allow_entities("customers")

    expect { policy.authorize!(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /Entity is not allowed/)
  end
end
