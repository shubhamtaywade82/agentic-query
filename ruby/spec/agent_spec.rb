# frozen_string_literal: true

require "spec_helper"

RSpec.describe AgenticQuery::Agent do
  let(:models) { { orders: Order } }
  let(:schema) { AgenticQuery::Schema.new(models: models) }
  let(:adapter) { AgenticQuery::ActiveRecordAdapter.new(models: models) }
  let(:policy) { AgenticQuery::Policy.new(max_rows: 10) }

  let(:valid_query) do
    {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "filters" => [{ "field" => { "field" => "status" }, "operator" => "eq", "value" => "completed" }]
    }
  end

  let(:invalid_query) do
    { "source" => { "name" => "orders" }, "select" => [] }
  end

  # Scripted provider mirroring the TS evaluation harness.
  let(:provider) do
    Class.new do
      def initialize(outputs)
        @outputs = outputs
        @calls = 0
      end

      attr_reader :calls

      def generate_structured(request)
        @calls += 1
        repairing = request["messages"].any? { |message| message["content"].include?("Repair the supplied") }
        output = repairing ? @outputs[:repair] : @outputs[:initial]
        { "output" => output }
      end
    end.new(initial: valid_query, repair: valid_query)
  end

  before do
    Order.create!(account_id: 1, customer_id: 1, status: "completed", amount: 100)
    Order.create!(account_id: 2, customer_id: 1, status: "completed", amount: 250)
  end

  subject(:agent) do
    described_class.new(
      model: "qwen3",
      provider: provider,
      schema: schema,
      adapter: adapter,
      policy: policy
    )
  end

  it "executes the full pipeline and returns normalized results" do
    result = agent.ask("What is the revenue of completed orders?")

    expect(result.query["source"]["name"]).to eq("orders")
    expect(result.rows.map(&:amount).map(&:to_f)).to contain_exactly(100.0, 250.0)
    expect(result.normalized["row_count"]).to eq(2)
    # ActiveRecord materializes a partial select with id: nil; the projected
    # amount column must be present with the exact amounts.
    expect(result.normalized["columns"].map { |column| column["name"] }).to include("amount")
    amount_index = result.normalized["columns"].index { |column| column["name"] == "amount" }
    expect(result.normalized["rows"].map { |row| row[amount_index].to_f }).to contain_exactly(100.0, 250.0)
    expect(result.request_id).to start_with("agent-")
    expect(result.schema_context).to include("Entity: orders")
  end

  it "repairs an invalid first output within the bounded budget" do
    scripted = Class.new do
      def initialize(initial, repair)
        @initial = initial
        @repair = repair
      end

      def generate_structured(request)
        repairing = request["messages"].any? { |message| message["content"].include?("Repair the supplied") }
        { "output" => repairing ? @repair : @initial }
      end
    end.new(invalid_query, valid_query)

    agent = described_class.new(
      model: "qwen3",
      provider: scripted,
      schema: schema,
      adapter: adapter,
      policy: policy
    )

    result = agent.ask("List completed order amounts")
    expect(result.repair_attempts).to eq(1)
    expect(result.rows.length).to eq(2)
  end

  it "fails closed when repair cannot produce a policy-valid query" do
    scripted = Class.new do
      def generate_structured(_request)
        { "output" => { "source" => { "name" => "orders" }, "select" => [] } }
      end
    end.new

    agent = described_class.new(
      model: "qwen3",
      provider: scripted,
      schema: schema,
      adapter: adapter,
      policy: policy,
      max_repair_attempts: 1
    )

    expect { agent.ask("anything") }
      .to raise_error(AgenticQuery::QueryValidationError, /bounded repair/)
  end

  it "rejects a provider without generate_structured" do
    expect do
      described_class.new(model: "m", provider: Object.new, schema: schema, adapter: adapter)
    end.to raise_error(ArgumentError, /generate_structured/)
  end

  it "scrubbs denied fields from the prompt context" do
    deny_policy = AgenticQuery::Policy.new
    deny_policy.deny_fields("orders", "internal_note")

    retriever = AgenticQuery::SchemaRetriever.new(schema: schema, policy: deny_policy)
    captured = nil
    scripted = Class.new do
      def initialize(valid_query, capture)
        @valid_query = valid_query
        @capture = capture
      end

      def generate_structured(request)
        @capture[:context] = request["messages"].last["content"]
        { "output" => @valid_query }
      end
    end.new(valid_query, captured = {})

    agent = described_class.new(
      model: "qwen3",
      provider: scripted,
      schema: schema,
      adapter: adapter,
      schema_retriever: retriever
    )

    agent.ask("show internal notes")
    expect(captured[:context]).not_to include("internal_note")
  end
end
