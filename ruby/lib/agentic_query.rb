# frozen_string_literal: true

require "set"
require "json"
require "securerandom"
require_relative "agentic_query/version"
require_relative "agentic_query/execution_policy"
require_relative "agentic_query/policy"
require_relative "agentic_query/row_constraint"
require_relative "agentic_query/tenant_scope"
require_relative "agentic_query/active_record"
require_relative "agentic_query/postgresql_adapter"
require_relative "agentic_query/schema"
require_relative "agentic_query/schema_retriever"
require_relative "agentic_query/result_normalizer"
require_relative "agentic_query/conformance"
require_relative "agentic_query/executor"
require_relative "agentic_query/agent"

module AgenticQuery
  class QueryValidationError < StandardError; end
  class QueryExecutionError < StandardError; end
  class QueryGenerationError < QueryValidationError; end

  # Deterministic structural validation of the language-neutral query AST.
  module QueryValidator
    module_function

    # Accepts either a Policy instance or policy keyword options:
    #   validate!(query)
    #   validate!(query, policy)
    #   validate!(query, max_rows: 100)
    def validate!(query, policy = {})
      policy = coerce_policy(policy)
      policy.validate_structure!(query)
      policy.authorize!(query)
      query
    end

    def coerce_policy(policy)
      return policy if policy.is_a?(Policy)
      return Policy.new if policy.nil? || (policy.respond_to?(:empty?) && policy.empty?)

      Policy.new(**policy)
    end
  end
end
