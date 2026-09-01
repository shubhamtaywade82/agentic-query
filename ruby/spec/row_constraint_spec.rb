# frozen_string_literal: true

require "spec_helper"

RSpec.describe AgenticQuery::RowConstraint do
  it "requires a callable" do
    expect { described_class.new(Object.new) }.to raise_error(ArgumentError)
  end

  it "rejects a callable that does not return an ActiveRecord relation" do
    constraint = described_class.new(->(_relation) { :not_a_relation })

    expect { constraint.apply(Order.all) }
      .to raise_error(AgenticQuery::QueryValidationError, /ActiveRecord::Relation/)
  end

  it "returns the constrained relation" do
    constraint = described_class.new(->(relation) { relation.where(account_id: 42) })

    expect(constraint.apply(Order.all).where_values_hash["account_id"]).to eq(42)
  end
end
