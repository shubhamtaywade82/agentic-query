# frozen_string_literal: true

require "set"
require_relative "agentic_query/policy"
require_relative "agentic_query/active_record"

module AgenticQuery
  VERSION = "0.1.0"

  class QueryValidationError < StandardError; end

  module QueryValidator
    module_function

    def validate!(query, policy = {})
      select = query.fetch("select")
      raise QueryValidationError, "Query must select at least one expression" if select.empty?

      if policy[:max_rows] && query["limit"] && query["limit"] > policy[:max_rows]
        raise QueryValidationError, "Query limit exceeds policy maximum"
      end

      allowed = policy[:allowed_entities]
      if allowed
        entities = [query.fetch("source").fetch("name"), *Array(query["joins"]).map { |join| join.fetch("entity").fetch("name") }]
        entities.each do |entity|
          raise QueryValidationError, "Entity is not allowed: #{entity}" unless allowed.include?(entity)
        end
      end

      query
    end
  end
end
