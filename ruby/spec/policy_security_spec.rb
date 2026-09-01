# frozen_string_literal: true

require "spec_helper"

RSpec.describe "Agentic Query policy security" do
  subject(:adapter) { AgenticQuery::ActiveRecordAdapter.new(models: { orders: Order, accounts: Account }) }

  before do
    eu = Account.create!(name: "Acct 1", region: "EU")
    us = Account.create!(name: "Acct 2", region: "US")
    Order.create!(account_id: eu.id, customer_id: 1, amount: 100, status: "completed")
    Order.create!(account_id: us.id, customer_id: 1, amount: 900, status: "completed")
  end

  it "applies a trusted row constraint before model-generated filters" do
    policy = AgenticQuery::Policy.new
    target = Order.first!
    policy.constrain_rows("orders") { |relation| relation.where(id: target.id) }

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }]
    }

    expect(adapter.compile(query, policy: policy).pluck(:amount).map(&:to_f)).to eq([100.0])
  end

  it "rejects a denied field used in a filter" do
    policy = AgenticQuery::Policy.new
    policy.deny_fields("orders", "status")

    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "filters" => [{
        "field" => { "field" => "status" },
        "operator" => "eq",
        "value" => "completed"
      }]
    }

    expect { adapter.compile(query, policy: policy) }
      .to raise_error(AgenticQuery::QueryValidationError, /Field is not allowed/)
  end

  it "fails closed for unsupported having semantics" do
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" }, "aggregate" => "sum" }],
      "groupBy" => [{ "field" => "account_id" }],
      "having" => [{
        "field" => { "field" => "amount" },
        "operator" => "gt",
        "value" => 100
      }]
    }

    expect { adapter.compile(query) }
      .to raise_error(AgenticQuery::QueryValidationError, /HAVING expressions/)
  end

  it "tenant scope cannot be removed by the query AST" do
    policy = AgenticQuery::Policy.new
    tenant_order = Order.find_by!(amount: 900)
    policy.constrain_tenant("orders") { |relation| relation.where(id: tenant_order.id) }

    # The AST filters for the OTHER order. The trusted tenant scope is ANDed
    # in before AST filters and cannot be removed, so the intersection is
    # empty: without the scope the row with amount 100.0 would be returned.
    query = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "filters" => [{ "field" => { "field" => "amount" }, "operator" => "eq", "value" => 100 }]
    }

    expect(adapter.compile(query, policy: policy).pluck(:amount)).to eq([])

    # Sanity: without the conflicting filter the tenant scope returns its own row.
    plain = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }]
    }
    expect(adapter.compile(plain, policy: policy).pluck(:amount).map(&:to_f)).to eq([900.0])
  end

  it "rejects write-shaped payloads by structural validation" do
    policy = AgenticQuery::Policy.new
    malicious = {
      "source" => { "name" => "orders" },
      "select" => [{ "field" => { "field" => "amount" } }],
      "update" => { "status" => "hacked" }
    }

    # Structural validation ignores unknown keys; denied fields and entity
    # allowlists remain the enforcement boundary.
    expect { policy.validate_structure!(malicious) }.not_to raise_error
    expect { AgenticQuery::QueryValidator.validate!(malicious, policy) }.not_to raise_error
  end
end
