# frozen_string_literal: true

require "set"
require_relative "agentic_query/execution_policy"
require_relative "agentic_query/policy"
require_relative "agentic_query/row_constraint"
require_relative "agentic_query/active_record"
require_relative "agentic_query/schema"
require_relative "agentic_query/executor"

module AgenticQuery
  VERSION = "0.1.0"

  class QueryValidationError < StandardError; end
  class QueryExecutionError < StandardError; end

  module QueryValidator
    module_function

    def validate!(query, policy = {})
      policy = policy.is_a?(Policy) ? policy : Policy.new(**policy)
      policy.authorize!(query)
      query
    end
  end
end
