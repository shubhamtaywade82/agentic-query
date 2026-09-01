# frozen_string_literal: true

require "set"
require_relative "agentic_query/policy"
require_relative "agentic_query/row_constraint"
require_relative "agentic_query/active_record"
require_relative "agentic_query/schema"

module AgenticQuery
  VERSION = "0.1.1"

  class QueryValidationError < StandardError; end

  module QueryValidator
    module_function

    def validate!(query, policy = {})
      Policy.new(**policy).authorize!(query)
      query
    end
  end
end
