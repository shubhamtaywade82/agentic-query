# frozen_string_literal: true

module AgenticQuery
  # Immutable wrapper for trusted application-owned row constraints.
  class RowConstraint
    def initialize(callable)
      raise ArgumentError, "row constraint requires a callable" unless callable.respond_to?(:call)

      @callable = callable
    end

    def apply(relation)
      result = @callable.call(relation)
      unless result.is_a?(ActiveRecord::Relation)
        raise QueryValidationError, "Row constraint must return an ActiveRecord::Relation"
      end

      result
    end
  end
end
