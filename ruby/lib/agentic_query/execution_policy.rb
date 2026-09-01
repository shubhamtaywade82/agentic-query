# frozen_string_literal: true

module AgenticQuery
  # Execution-time safeguards that remain outside the LLM/query AST.
  class ExecutionPolicy
    attr_reader :max_rows, :timeout_ms

    def initialize(max_rows: 1_000, timeout_ms: 5_000)
      @max_rows = Integer(max_rows)
      @timeout_ms = Integer(timeout_ms)
      raise ArgumentError, "max_rows must be positive" unless @max_rows.positive?
      raise ArgumentError, "timeout_ms must be positive" unless @timeout_ms.positive?
    end
  end
end
