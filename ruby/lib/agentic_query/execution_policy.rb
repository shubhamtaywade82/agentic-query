# frozen_string_literal: true

module AgenticQuery
  # Deterministic execution safeguards owned by the application, never by the LLM.
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
