# frozen_string_literal: true

module AgenticQuery
  class Executor
    def initialize(adapter:, policy: Policy.new)
      @adapter = adapter
      @policy = policy
    end

    def execute(query)
      relation = @adapter.compile(query, policy: @policy)
      started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      rows = execute_relation(relation)
      elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000).round

      if elapsed_ms > @policy.timeout_ms
        raise QueryExecutionError, "Query exceeded execution policy timeout"
      end

      { "rows" => rows, "row_count" => rows.length, "duration_ms" => elapsed_ms }
    rescue QueryValidationError
      raise
    rescue StandardError => e
      raise QueryExecutionError, e.message
    end

    private

    def execute_relation(relation)
      adapter = @adapter
      if adapter.respond_to?(:execute)
        result = adapter.execute(relation, max_rows: @policy.max_rows, timeout_ms: @policy.timeout_ms)
        return Array(result)
      end

      Array(relation.limit(@policy.max_rows).to_a)
    end
  end
end
