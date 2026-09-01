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
      rows = relation.limit(@policy.max_rows).to_a
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
  end
end
