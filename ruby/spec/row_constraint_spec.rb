# frozen_string_literal: true

require "active_record"
require "sqlite3"
require "agentic_query"

ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:")

ActiveRecord::Schema.define do
  create_table :orders, force: true do |table|
    table.integer :account_id, null: false
  end
end

class ConstraintOrder < ActiveRecord::Base
  self.table_name = "orders"
end

RSpec.describe AgenticQuery::RowConstraint do
  it "requires a callable" do
    expect { described_class.new(Object.new) }.to raise_error(ArgumentError)
  end

  it "rejects a callable that does not return an ActiveRecord relation" do
    constraint = described_class.new(->(_relation) { :not_a_relation })

    expect { constraint.apply(ConstraintOrder.all) }
      .to raise_error(AgenticQuery::QueryValidationError, /ActiveRecord::Relation/)
  end

  it "returns the constrained relation" do
    constraint = described_class.new(->(relation) { relation.where(account_id: 42) })

    expect(constraint.apply(ConstraintOrder.all).where_values_hash["account_id"]).to eq(42)
  end
end
