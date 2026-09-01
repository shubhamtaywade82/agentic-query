# frozen_string_literal: true

require "spec_helper"

RSpec.describe AgenticQuery::ActiveRecordAdapter do
  subject(:adapter) { described_class.new(models: { orders: Order, accounts: Account }) }

  before do
    eu = Account.create!(name: "Acct 1", region: "EU")
    us = Account.create!(name: "Acct 2", region: "US")
    Order.create!(account_id: eu.id, customer_id: 1, status: "completed", amount: 100)
    Order.create!(account_id: us.id, customer_id: 1, status: "completed", amount: 250)
    Order.create!(account_id: eu.id, customer_id: 1, status: "cancelled", amount: 50)
  end

  it "compiles a filtered relation" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "filters" => [{
        "field" => { "field" => "status" },
        "operator" => "eq",
        "value" => "completed"
      }]
    }

    result = adapter.compile(query).to_a

    expect(result.map(&:amount).map(&:to_f)).to contain_exactly(100.0, 250.0)
  end

  it "compiles an aggregate and group query" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [
        { "field" => { "field" => "status" } },
        { "field" => { "field" => "amount" }, "aggregate" => "sum", "alias" => "total" }
      ],
      "groupBy" => [{ "field" => "status" }]
    }

    result = adapter.compile(query).to_a

    expect(result.map { |row| [row.status, row.total.to_f] })
      .to contain_exactly(["completed", 350.0], ["cancelled", 50.0])
  end

  it "compiles ordering and pagination" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "orderBy" => [{ "field" => { "field" => "amount" }, "direction" => "desc" }],
      "limit" => 2,
      "offset" => 1
    }

    result = adapter.compile(query).to_a

    expect(result.map(&:amount).map(&:to_f)).to eq([100.0, 50.0])
  end

  it "compiles in/not_in/between/null predicates" do
    base = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }]
    }

    in_query = base.merge(
      "filters" => [{ "field" => { "field" => "status" }, "operator" => "in", "values" => %w[completed] }]
    )
    expect(adapter.compile(in_query).to_a.map(&:amount).map(&:to_f)).to contain_exactly(100.0, 250.0)

    between_query = base.merge(
      "filters" => [{ "field" => { "field" => "amount" }, "operator" => "between", "values" => [60, 300] }]
    )
    expect(adapter.compile(between_query).to_a.map(&:amount).map(&:to_f)).to contain_exactly(100.0, 250.0)

    like_query = base.merge(
      "filters" => [{ "field" => { "field" => "status" }, "operator" => "like", "value" => "compl%" }]
    )
    expect(adapter.compile(like_query).to_a.length).to eq(2)
  end

  it "joins through registered associations only" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "joins" => [{
        "entity" => { "name" => "accounts" },
        "type" => "inner",
        "on" => { "left" => { "field" => "account_id" }, "right" => { "field" => "id" } }
      }],
      "filters" => [{ "field" => { "entity" => "accounts", "field" => "region" }, "operator" => "eq", "value" => "EU" }]
    }

    expect(adapter.compile(query).to_a.map(&:amount).map(&:to_f)).to contain_exactly(100.0, 50.0)
  end

  it "rejects joins that are not registered associations" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "joins" => [{
        "entity" => { "name" => "invoices" },
        "type" => "inner",
        "on" => { "left" => { "field" => "account_id" }, "right" => { "field" => "id" } }
      }]
    }
    expect { adapter.compile(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /not a registered association/)
  end

  it "applies a trusted tenant scope before user filters" do
    policy = AgenticQuery::Policy.new
    tenant_account = Account.create!(name: "Acct 3", region: "EU")
    policy.constrain_tenant("orders") { |relation| relation.where(account_id: tenant_account.id) }

    Order.create!(account_id: tenant_account.id, customer_id: 1, status: "completed", amount: 75)

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "filters" => [{
        "field" => { "field" => "status" },
        "operator" => "eq",
        "value" => "completed"
      }]
    }

    result = adapter.compile(query, policy: policy).to_a

    expect(result.map(&:amount).map(&:to_f)).to contain_exactly(75.0)
  end

  it "caps query rows by the execution policy" do
    policy = AgenticQuery::Policy.new(max_rows: 1)
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }]
    }

    expect(adapter.compile(query, policy: policy).to_a.size).to eq(1)
  end

  it "rejects an unregistered entity" do
    query = {
      "source" => { "name" => "users" },
      "select" => [{ "field" => { "field" => "id" } }]
    }

    expect { adapter.compile(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /not registered/)
  end

  it "enforces denied fields before compilation" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }]
    }
    policy = AgenticQuery::Policy.new
    policy.deny_fields("orders", "amount")

    expect { adapter.compile(query, policy: policy) }
      .to raise_error(AgenticQuery::QueryValidationError, /Field is not allowed/)
  end

  it "rejects unknown columns fail-closed" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "hax" } }]
    }

    expect { adapter.compile(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /Column is not available/)
  end
end
