# frozen_string_literal: true
module AgenticQuery
  VERSION = '0.1.0'
  class QueryValidationError < StandardError; end
  module QueryValidator
    module_function
    def validate!(query, policy = {})
      select = query.fetch('select')
      raise QueryValidationError, 'Query must select at least one expression' if select.empty?
      if policy[:max_rows] && query['limit'] && query['limit'] > policy[:max_rows]
        raise QueryValidationError, 'Query limit exceeds policy maximum'
      end
      if policy[:allowed_entities]
        entities = [query.fetch('source').fetch('name'), *Array(query['joins']).map { |join| join.fetch('entity').fetch('name') }]
        entities.each { |entity| raise QueryValidationError, "Entity is not allowed: #{entity}" unless policy[:allowed_entities].include?(entity) }
      end
      query
    end
  end
end
