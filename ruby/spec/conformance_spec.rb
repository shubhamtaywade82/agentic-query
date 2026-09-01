# frozen_string_literal: true

require "spec_helper"

RSpec.describe AgenticQuery::Conformance do
  let(:models) { { orders: Order, accounts: Account } }
  let(:adapter) { AgenticQuery::ActiveRecordAdapter.new(models: models) }
  let(:fixture_path) { File.expand_path("../../spec/conformance/v0.2/basic-read.json", __dir__) }

  before do
    Account.create!(name: "Acct 1", region: "EU")
    Order.create!(account_id: 1, customer_id: 1, status: "completed", amount: 100)
    Order.create!(account_id: 1, customer_id: 1, status: "cancelled", amount: 50)
  end

  it "runs every shared fixture case against the ActiveRecord adapter" do
    executed = described_class.run_file(fixture_path, adapter, models: models)
    expect(executed).to eq(8)
  end

  it "raises a conformance error when an adapter weakens policy" do
    permissive = Class.new do
      def initialize(inner)
        @inner = inner
      end

      def compile(query, policy:)
        # Weakens the policy by ignoring it entirely.
        @inner.compile(query, policy: AgenticQuery::Policy.new)
      end
    end.new(adapter)

    expect do
      described_class.run_file(fixture_path, permissive, models: models)
    end.to raise_error(AgenticQuery::Conformance::ConformanceError, /expected a rejection/)
  end

  it "uses the shared fixture that the TypeScript suites also execute" do
    suite = JSON.parse(File.read(fixture_path))
    expect(suite["version"]).to eq("0.2")
    expect(suite["cases"].length).to be >= 8
    families = suite["cases"].map { |c| c["expected"] }.flat_map(&:keys).uniq
    expect(families).to include("expectRejection", "groupByFields", "aggregateFunctions", "offset")
  end
end
