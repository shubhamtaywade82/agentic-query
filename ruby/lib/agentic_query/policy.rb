# frozen_string_literal: true

require "set"

module AgenticQuery
  # Authorization and query-shaping policy owned entirely by application code.
  # The policy is immutable during a query execution and is enforced
  # immediately before adapter compilation.
  class Policy
    attr_reader :execution_policy

    AGGREGATES = %w[count sum avg min max].freeze
    OPERATORS = %w[eq neq gt gte lt lte in not_in like is_null is_not_null between].freeze
    JOIN_TYPES = %w[inner left].freeze
    ABSOLUTE_MAX_ROWS = 10_000

    # Convenience constructor:
    #   Policy.new(max_rows: 100, timeout_ms: 5_000)
    #   Policy.new(execution_policy: ExecutionPolicy.new, row_constraints: {})
    def initialize(execution_policy: nil, max_rows: nil, timeout_ms: nil,
                   row_constraints: {}, tenant_scopes: {})
      if execution_policy && (max_rows || timeout_ms)
        raise ArgumentError, "pass either execution_policy: or max_rows:/timeout_ms:, not both"
      end

      @execution_policy =
        if execution_policy
          execution_policy
        else
          ExecutionPolicy.new(max_rows: max_rows, timeout_ms: timeout_ms)
        end

      @allowed_entities = nil
      @denied_fields = Hash.new { |hash, key| hash[key] = [] }
      @allowed_operators = nil
      @allowed_aggregates = nil
      @allowed_join_types = nil
      @max_complexity = nil
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

    def allow_operators(*operators)
      @allowed_operators = operators.flatten.map(&:to_s).to_set
    end

    def allow_aggregates(*aggregates)
      @allowed_aggregates = aggregates.flatten.map(&:to_s).to_set
    end

    def allow_join_types(*types)
      @allowed_join_types = types.flatten.map(&:to_s).to_set
    end

    # Maximum deterministic complexity score (selects + filters + groupBy +
    # orderBy + having + 2 per join).
    def max_complexity=(limit)
      raise ArgumentError, "max_complexity must be a positive integer" unless limit.is_a?(Integer) && limit.positive?

      @max_complexity = limit
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

    # Deterministic complexity score; identical to the TypeScript runtime.
    def complexity(query)
      selects = Array(query["select"]).length
      filters = Array(query["filters"]).length
      group_by = Array(query["groupBy"]).length
      order_by = Array(query["orderBy"]).length
      having = Array(query["having"]).length
      joins = Array(query["joins"]).length
      selects + filters + group_by + order_by + having + joins * 2
    end

    # Structural validation of the raw AST. Fail closed on any malformed shape.
    def validate_structure!(query)
      unless query.is_a?(Hash)
        raise QueryValidationError, "Query must be an object"
      end
      source = query["source"]
      unless source.is_a?(Hash) && source["name"].is_a?(String) && !source["name"].empty?
        raise QueryValidationError, "Query must have a valid source"
      end

      version = query["version"]
      if version && !SUPPORTED_VERSIONS.include?(version.to_s)
        raise QueryValidationError, "Query AST version is unsupported: #{version}"
      end

      select = query["select"]
      unless select.is_a?(Array) && !select.empty?
        raise QueryValidationError, "Query must have at least one select expression"
      end

      validate_limit!(query)

      select.each_with_index do |expression, index|
        validate_select_expression!(expression, index)
      end

      Array(query["groupBy"]).each_with_index { |field, index| validate_field_ref!(field, "groupBy[#{index}]") }
      Array(query["orderBy"]).each_with_index { |order, index| validate_order!(order, index) }
      Array(query["filters"]).each_with_index { |filter, index| validate_filter!(filter, "filters[#{index}]") }
      Array(query["having"]).each_with_index { |filter, index| validate_filter!(filter, "having[#{index}]") }
      Array(query["joins"]).each_with_index { |join, index| validate_join!(join, index) }

      if @max_complexity && complexity(query) > @max_complexity
        raise QueryValidationError, "Query complexity #{complexity(query)} exceeds policy maximum #{@max_complexity}"
      end

      query
    end

    def authorize!(query)
      validate_limit!(query)
      authorize_entities!(query)
      authorize_fields!(query)
      authorize_operators!(query)
      authorize_aggregates!(query)
      query
    end

    def entity_allowed?(entity)
      @allowed_entities.nil? || @allowed_entities.include?(entity.to_s)
    end

    def field_allowed?(entity, field)
      !@denied_fields.fetch(entity.to_s, []).include?(field.to_s)
    end

    def operator_allowed?(operator)
      @allowed_operators.nil? || @allowed_operators.include?(operator.to_s)
    end

    def aggregate_allowed?(aggregate)
      @allowed_aggregates.nil? || @allowed_aggregates.include?(aggregate.to_s)
    end

    def join_type_allowed?(type)
      @allowed_join_types.nil? || @allowed_join_types.include?(type.to_s)
    end

    SUPPORTED_VERSIONS = %w[0.1 0.2].freeze

    private

    def validate_limit!(query)
      limit = query["limit"]
      return if limit.nil?

      limit = Integer(limit)
      if limit <= 0 || limit > ABSOLUTE_MAX_ROWS
        raise QueryValidationError, "Query limit must be an integer between 1 and #{ABSOLUTE_MAX_ROWS}"
      end
      if limit > max_rows
        raise QueryValidationError, "Query limit exceeds policy maximum"
      end
    rescue ArgumentError, TypeError
      raise QueryValidationError, "Query limit must be an integer"
    end

    def validate_field_ref!(field, label)
      unless field.is_a?(Hash) && field["field"].is_a?(String) && !field["field"].empty?
        raise QueryValidationError, "#{label} must contain a non-empty field name"
      end
      entity = field["entity"]
      return if entity.nil? || (entity.is_a?(String) && !entity.empty?)

      raise QueryValidationError, "#{label}.entity must be a non-empty string"
    end

    def validate_select_expression!(expression, index)
      unless expression.is_a?(Hash)
        raise QueryValidationError, "select[#{index}] is invalid"
      end

      if expression["semantic"]
        semantic = expression["semantic"]
        return if semantic.is_a?(Hash) && %w[metric dimension].include?(semantic["kind"]) &&
                  semantic["name"].is_a?(String) && !semantic["name"].empty?

        raise QueryValidationError, "select[#{index}].semantic is invalid"
      end

      validate_field_ref!(expression["field"], "select[#{index}].field")

      aggregate = expression["aggregate"]
      return if aggregate.nil?

      unless AGGREGATES.include?(aggregate.to_s)
        raise QueryValidationError, "select[#{index}].aggregate is unsupported"
      end
    end

    def validate_order!(order, index)
      validate_field_ref!(order.is_a?(Hash) ? order["field"] : nil, "orderBy[#{index}].field")
      direction = order.is_a?(Hash) ? order["direction"] : nil
      return if %w[asc desc].include?(direction.to_s.downcase)

      raise QueryValidationError, "orderBy[#{index}].direction is invalid"
    end

    def validate_filter!(filter, label)
      validate_field_ref!(filter.is_a?(Hash) ? filter["field"] : nil, "#{label}.field")
      operator = filter.is_a?(Hash) ? filter["operator"] : nil
      unless OPERATORS.include?(operator.to_s)
        raise QueryValidationError, "#{label}.operator is unsupported"
      end
      values = filter.is_a?(Hash) ? filter["values"] : nil
      if %w[in not_in between].include?(operator.to_s) && !values.is_a?(Array)
        raise QueryValidationError, "#{label}.values must be an array"
      end
      if operator.to_s == "between" && values.to_a.length != 2
        raise QueryValidationError, "#{label}.values must contain exactly two values"
      end
    end

    def validate_join!(join, index)
      unless join.is_a?(Hash) && join.dig("entity", "name").is_a?(String) &&
             JOIN_TYPES.include?(join["type"].to_s)
        raise QueryValidationError, "joins[#{index}] is invalid"
      end
      validate_field_ref!(join.dig("on", "left"), "joins[#{index}].on.left")
      validate_field_ref!(join.dig("on", "right"), "joins[#{index}].on.right")
    end

    def validate_limit_bounded!(query)
      validate_limit!(query)
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

    def authorize_operators!(query)
      Array(query["filters"]).each do |filter|
        operator = filter.fetch("operator")
        next if operator_allowed?(operator)

        raise QueryValidationError, "Filter operator is not allowed: #{operator}"
      end
      Array(query["having"]).each do |filter|
        operator = filter.fetch("operator")
        next if operator_allowed?(operator)

        raise QueryValidationError, "Filter operator is not allowed: #{operator}"
      end
    end

    def authorize_aggregates!(query)
      Array(query["select"]).each do |expression|
        aggregate = expression["aggregate"]
        next if aggregate.nil?
        next if aggregate_allowed?(aggregate)

        raise QueryValidationError, "Aggregate is not allowed: #{aggregate}"
      end
    end
  end
end
