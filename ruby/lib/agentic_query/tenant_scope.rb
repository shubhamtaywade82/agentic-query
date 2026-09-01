# frozen_string_literal: true

module AgenticQuery
  # Trusted, application-owned tenant scope. The query AST cannot remove or replace it.
  class TenantScope
    def initialize(callable)
      raise ArgumentError, "tenant scope requires a callable" unless callable.respond_to?(:call)

      @callable = callable
    end

    def apply(relation)
      result = @callable.call(relation)
      unless result.is_a?(ActiveRecord::Relation)
        raise QueryValidationError, "Tenant scope must return an ActiveRecord::Relation"
      end

      result
    end
  end
end
