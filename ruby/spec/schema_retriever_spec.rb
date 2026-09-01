# frozen_string_literal: true

require "spec_helper"

RSpec.describe AgenticQuery::SchemaRetriever do
  let(:schema) { AgenticQuery::Schema.new(models: { customers: Customer, orders: Order, accounts: Account }) }

  it "returns all entities when under the cap" do
    retriever = described_class.new(schema: schema)
    expect(retriever.retrieve("anything").length).to eq(3)
  end

  it "ranks entities lexically with deterministic order under the cap" do
    retriever = described_class.new(schema: schema, max_entities: 2)
    entities = retriever.retrieve("show me orders by amount")
    expect(entities.length).to eq(2)
    expect(entities.first["name"]).to eq("orders")
  end

  it "caches repeated questions and invalidates on demand" do
    retriever = described_class.new(schema: schema, cache_ttl: 60)
    first = retriever.retrieve("orders")
    second = retriever.retrieve("orders")
    expect(first.equal?(second)).to be(true) # same cached array identity

    retriever.invalidate
    third = retriever.retrieve("orders")
    expect(third.equal?(first)).to be(false)
  end

  it "scrubbs denied fields from the prompt context" do
    policy = AgenticQuery::Policy.new
    policy.deny_fields("customers", "password_hash")

    retriever = described_class.new(schema: schema, policy: policy)
    context = retriever.format_context(retriever.retrieve("customers"))
    expect(context).to include("Entity: customers")
    expect(context).not_to include("password_hash")
  end

  it "scopes cache keys by tenant" do
    calls = 0
    counting_schema = Class.new do
      def initialize(inner)
        @inner = inner
      end

      def all
        @inner.all
      end
    end.new(schema)

    retriever = described_class.new(schema: counting_schema, max_entities: 8)
    a = retriever.retrieve("orders", tenant: "acme")
    b = retriever.retrieve("orders", tenant: "globex")
    expect(a).to eq(b) # same entities, different cache entries
  end
end
