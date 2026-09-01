# frozen_string_literal: true

require "spec_helper"

RSpec.describe AgenticQuery::ResultNormalizer do
  it "normalizes rows with deterministic first-seen column order" do
    result = described_class.new.normalize_rows(
      [
        { "status" => "completed", "id" => 2 },
        { "id" => 1, "status" => "pending", "extra" => "x" }
      ]
    )

    expect(result["columns"].map { |column| column["name"] }).to eq(%w[status id extra])
    expect(result["rows"][0]).to eq(["completed", 2, nil])
    expect(result["row_count"]).to eq(2)
  end

  it "caps rows and reports truncation" do
    result = described_class.new(max_rows: 2).normalize_rows(
      [{ "id" => 1 }, { "id" => 2 }, { "id" => 3 }]
    )
    expect(result["row_count"]).to eq(2)
    expect(result["metadata"]["truncated"]).to be(true)
  end

  it "infers types and nullability" do
    result = described_class.new.normalize_rows([{ "id" => 1, "note" => nil }])

    id_column = result["columns"].find { |column| column["name"] == "id" }
    expect(id_column["type"]).to eq("number")
    expect(id_column["nullable"]).to be(false)

    note_column = result["columns"].find { |column| column["name"] == "note" }
    expect(note_column["nullable"]).to be(true)
  end

  it "normalizes activerecord rows through attributes" do
    Order.create!(account_id: 1, customer_id: 1, status: "completed", amount: 42)
    result = described_class.new.normalize_rows(Order.all.to_a)

    expect(result["columns"].map { |column| column["name"] }).to include("amount", "status")
    expect(result["row_count"]).to eq(1)
  end

  it "flattens aggregate hashes" do
    result = described_class.new.normalize_aggregate({ "sum" => { "amount" => 300 } })
    expect(result["columns"].map { |column| column["name"] }).to eq(["sum_amount"])
    expect(result["rows"][0]).to eq([300])
    expect(result["row_count"]).to eq(1)
  end

  it "serializes results with bounded rows" do
    rows = (1..60).map { |index| { "id" => index } }
    result = described_class.new.normalize_rows(rows)
    text = described_class.new.serialize(result, max_rows: 50)

    expect(text).to include("id")
    expect(text).to include("10 more rows not shown")
  end
end
