# frozen_string_literal: true
require 'agentic_query'
RSpec.describe AgenticQuery::QueryValidator do
  let(:query) { { 'source' => { 'name' => 'orders' }, 'select' => [{ 'field' => { 'field' => 'amount' } }], 'limit' => 10 } }
  it 'accepts a valid query' do
    expect(described_class.validate!(query, max_rows: 100)).to eq(query)
  end
  it 'rejects a query above the configured row limit' do
    expect { described_class.validate!(query.merge('limit' => 101), max_rows: 100) }.to raise_error(AgenticQuery::QueryValidationError)
  end
end
