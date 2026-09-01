# frozen_string_literal: true

require "set"

module AgenticQuery
  # Authorization and query-shaping policy owned entirely by application code.
  class Policy
    attr_reader :execution_policy

    def initialize(execution_policy: ExecutionPolicy.new, row_constraints: {}, tenant_scopes: {})
      @execution_policy = execution_policy
      @allowed_entities = nil
      @denied_fields = Hash.new { |hash, key| hash[key] = [] }
      @row_constraints = row_constraints.transform_keys(&:to_s).transform_values do |constraint|
        constraint.is_a?(RowConstraint) ? constraint : RowConstraint.new(constraint)
      end
      @tenant_scopes = tenant_scopes.transform_keys(&:to_s).transform_values do |scope|
        scope.is_a?(TenantScope) ? scope : TenantScope.new(scope)
      end
    end

    def max_rows
      execution_policy.max_rows
    end

    def timeout_ms
      execution_policy.timeout_ms
    end

    def allow_entities(*entities)
      @allowed_entities = entities.flatten.map(&:to_s).to_set
    end

    def deny_fields(entity, *fields)
      @denied_fields[entity.to_s].concat(fields.flatten.map(&:to_s)).uniq!
    end

    def constrain_rows(entity, &constraint)
      raise ArgumentError, "row constraint requires a block" unless constraint

      @row_constraints[entity.to_s] = RowConstraint.new(constraint)
    end

    def constrain_tenant(entity, &scope)
      raise ArgumentError, "tenant scope requires a block" unless scope

      @tenant_scopes[entity.to_s] = TenantScope.new(scope)
    end

    def row_constraint(entity)
      @row_constraints[entity.to_s]
    end

    def tenant_scope(entity)
      @tenant_scopes[entity.to_s]
    end

    def authorize!(query)
      validate_limit!(query)
      authorize_entities!(query)
      authorize_fields!(query)
      query
    end

    def entity_allowed?(entity)
      @allowed_entities.nil? || @allowed_entities.include?(entity.to_s)
    end

    def field_allowed?(entity, field)
      !@denied_fields.fetch(entity.to_s, []).include?(field.to_s)
    end

    private

    def validate_limit!(query)
      limit = query["limit"]
      return if limit.nil? || Integer(limit) <= max_rows

      raise QueryValidationError, "Query limit exceeds policy maximum"
    rescue ArgumentError, TypeError
      raise QueryValidationError, "Query limit must be an integer"
    end

    def authorize_entities!(query)
      entities = [query.fetch("source").fetch("name")]
      entities.concat(Array(query["joins"]).map { |join| join.fetch("entity").fetch("name") })

      entities.each do |entity|
        next if entity_allowed?(entity)

        raise QueryValidationError, "Entity is not allowed: #{entity}"
      end
    end

    def authorize_fields!(query)
      fields = []
      fields.concat(Array(query["select"]).map { |expression| expression.fetch("field") })
      fields.concat(Array(query["groupBy"]))
      fields.concat(Array(query["orderBy"]).map { |order| order.fetch("field") })
      fields.concat(Array(query["filters"]).map { |filter| filter.fetch("field") })
      fields.concat(Array(query["having"]).map { |filter| filter.fetch("field") })
      fields.concat(Array(query["joins"]).flat_map do |join|
        on = join.fetch("on")
        [on.fetch("left"), on.fetch("right")]
      end)

      fields.each do |field|
        entity = field["entity"] || query.fetch("source").fetch("name")
        name = field.fetch("field")

        next if field_allowed?(entity, name)

        raise QueryValidationError, "Field is not allowed: #{entity}.#{name}"
      end
    end
  end
end
