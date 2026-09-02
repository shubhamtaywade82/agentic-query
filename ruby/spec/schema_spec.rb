# frozen_string_literal: true

require_relative "spec_helper"

class Customer < ActiveRecord::Base
  has_many :orders
end

class Order < ActiveRecord::Base
  belongs_to :customer
end

RSpec.describe AgenticQuery::Schema do
  subject(:schema) { described_class.new(models: { customers: Customer, orders: Order }) }

  it "describes fields and relations for a registered entity" do
    result = schema.entity("orders")

    expect(result["name"]).to eq("orders")
    expect(result["table"]).to eq("orders")
    expect(result["primary_key"]).to eq("id")
    expect(result["fields"]).to include(
      hash_including("name" => "amount", "type" => "decimal", "nullable" => true)
    )
    expect(result["relations"]).to include(
      hash_including("name" => "customer", "macro" => "belongs_to")
    )
  end

  it "returns registered entities in a stable order" do
    expect(schema.all.map { |entity| entity["name"] }).to eq(%w[customers orders])
  end
end
