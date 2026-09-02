# frozen_string_literal: true

require "active_record"
require "sqlite3"
require "agentic_query"

ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:")

ActiveRecord::Schema.define do
  create_table :customers, force: true do |table|
    table.string :name, null: false
  end

  create_table :accounts, force: true do |table|
    table.string :name, null: false
  end

  create_table :orders, force: true do |table|
    table.string :status, null: false, default: "completed"
    table.decimal :amount, null: false
    table.integer :account_id, null: false, default: 0
    table.integer :customer_id
  end
end

RSpec.configure do |config|
  config.before do
    ActiveRecord::Base.connection.tables.each do |table|
      ActiveRecord::Base.connection.execute("DELETE FROM #{table}")
    end
  end
end
