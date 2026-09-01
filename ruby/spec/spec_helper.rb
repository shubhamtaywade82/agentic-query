# frozen_string_literal: true

$LOAD_PATH.unshift File.expand_path("../lib", __dir__)
require "agentic_query"

require "active_record"
require "sqlite3"

# Shared in-memory SQLite schema for the fast unit suite (plan §12).
ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:")

ActiveRecord::Schema.define do
  create_table :accounts, force: true do |table|
    table.string :name, null: false
    table.string :region, null: false
  end

  create_table :customers, force: true do |table|
    table.string :name, null: false
    table.string :password_hash, null: false
  end

  create_table :orders, force: true do |table|
    table.integer :account_id, null: false
    table.integer :customer_id, null: false
    table.decimal :amount, null: false
    table.string :status, null: false
    table.text :internal_note
  end
end

class Account < ActiveRecord::Base
  has_many :orders
end

class Customer < ActiveRecord::Base
  has_many :orders
end

class Order < ActiveRecord::Base
  belongs_to :account
  belongs_to :customer
end

RSpec.configure do |config|
  config.expect_with :rspec do |expectations|
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
  end

  config.disable_monkey_patching!
  config.order = :random

  # Clean slate between examples so every spec file is isolated.
  config.before do
    [Account, Customer, Order].each(&:delete_all)
  end
end
