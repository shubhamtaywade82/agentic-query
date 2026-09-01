# frozen_string_literal: true

module AgenticQuery
  class PostgreSQLAdapter
    def initialize(adapter: ActiveRecordAdapter)
      @adapter = adapter
    end

    def compile(query, policy: Policy.new)
      @adapter.compile(query, policy: policy)
    end

    def execute(relation, max_rows:, timeout_ms:)
      connection = relation.connection
      result = nil
      connection.transaction(requires_new: true) do
        connection.execute("SET LOCAL statement_timeout = #{Integer(timeout_ms)}")
        result = relation.limit(Integer(max_rows)).to_a
      end
      result
    rescue ActiveRecord::StatementInvalid => e
      if e.message.match?(/statement timeout/i)
        raise QueryExecutionError, "Query exceeded execution policy timeout"
      end

      raise
    end
  end
end
