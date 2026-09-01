# frozen_string_literal: true

require "active_record"
require "arel"

module AgenticQuery
  class ActiveRecordAdapter
    AGGREGATES = {
      "count" => "COUNT",
      "sum" => "SUM",
      "avg" => "AVG",
      "min" => "MIN",
      "max" => "MAX"
    }.freeze

    PREDICATES = {
      "eq" => :eq,
      "neq" => :not_eq,
      "gt" => :gt,
      "gte" => :gteq,
      "lt" => :lt,
      "lte" => :lte
    }.freeze

    # Trusted execution order (plan Phase R3):
    #   authorize -> tenant scope -> row constraint -> joins -> filters
    #   -> select -> group -> having -> order -> bounded limit -> offset
    def initialize(models:)
      @models = models.transform_keys(&:to_s)
    end

    def compile(query, policy: Policy.new)
      policy.validate_structure!(query)
      policy.authorize!(query)
      source_name = query.fetch("source").fetch("name").to_s
      model = @models.fetch(source_name) do
        raise QueryValidationError, "Entity is not registered: #{source_name}"
      end

      relation = model.all
      relation = apply_tenant_scope(relation, policy, source_name)
      relation = apply_row_constraint(relation, policy, source_name)
      relation = apply_joins(relation, query, policy)
      relation = apply_filters(relation, query)
      relation = apply_select(relation, query)
      groups = group_columns(relation, query, model)
      relation = relation.group(*groups) unless groups.empty?
      relation = apply_having(relation, query)
      relation = apply_order(relation, query)
      relation = relation.limit([query["limit"] || policy.max_rows, policy.max_rows].min)
      relation = relation.offset(query["offset"]) if query["offset"]
      relation
    end

    private

    def apply_tenant_scope(relation, policy, entity)
      scope = policy.tenant_scope(entity)
      return relation unless scope

      scope.apply(relation)
    end

    def apply_row_constraint(relation, policy, entity)
      constraint = policy.row_constraint(entity)
      return relation unless constraint

      constraint.apply(relation)
    end

    def apply_joins(relation, query, policy)
      Array(query["joins"]).each do |join|
        entity = join.fetch("entity").fetch("name").to_s
        raise QueryValidationError, "Entity is not allowed: #{entity}" unless policy.entity_allowed?(entity)

        association = find_association(relation.klass, entity)
        raise QueryValidationError, "Join is not a registered association: #{entity}" unless association

        join_type = join["type"].to_s
        relation =
          if join_type == "left"
            relation.left_outer_joins(association.name)
          else
            relation.joins(association.name)
          end
      end
      relation
    end

    # Resolves an AST entity name (commonly plural) to a registered
    # association, matching singular/plural and exact names. Joins remain
    # fail-closed: only registered associations resolve.
    def find_association(klass, entity)
      candidates = [entity, entity.singularize, entity.pluralize].uniq
      klass.reflect_on_all_associations.find do |reflection|
        candidates.include?(reflection.name.to_s)
      end
    end

    # Resolves the arel table for a field reference, honoring joined entities.
    def table_for(relation, entity)
      return relation.klass.arel_table if entity.nil?

      model = @models[entity.to_s]
      return relation.klass.arel_table unless model

      model.arel_table
    end

    def validate_column!(relation, field)
      entity = field["entity"]
      name = field.fetch("field").to_s
      model = entity && @models[entity.to_s] ? @models[entity.to_s] : relation.klass
      return if model.column_names.include?(name)

      raise QueryValidationError, "Column is not available: #{model.name}.#{name}"
    end

    def apply_filters(relation, query)
      Array(query["filters"]).each do |filter|
        field = filter.fetch("field")
        validate_column!(relation, field)
        table = table_for(relation, field["entity"])
        column = table[field.fetch("field").to_s]
        operator = filter.fetch("operator").to_s

        predicate = case operator
                    when "is_null" then column.eq(nil)
                    when "is_not_null" then column.not_eq(nil)
                    when "in" then column.in(filter.fetch("values"))
                    when "not_in" then column.not_in(filter.fetch("values"))
                    when "between"
                      values = filter.fetch("values")
                      raise QueryValidationError, "between requires exactly two values" unless values.length == 2

                      column.between(values[0]..values[1])
                    when "like" then column.matches(filter.fetch("value"))
                    when *PREDICATES.keys then column.public_send(PREDICATES.fetch(operator), filter.fetch("value"))
                    else
                      raise QueryValidationError, "Unsupported filter operator: #{operator}"
                    end

        relation = relation.where(predicate)
      end
      relation
    end

    def apply_select(relation, query)
      expressions = query.fetch("select").map do |expression|
        field = expression.fetch("field")
        validate_column!(relation, field)
        table = table_for(relation, field["entity"])
        column = table[field.fetch("field").to_s]

        aggregate = expression["aggregate"]
        if aggregate
          function = AGGREGATES.fetch(aggregate.to_s) { raise QueryValidationError, "Unsupported aggregate: #{aggregate}" }
          node = Arel::Nodes::NamedFunction.new(function, [column])
          expression["alias"] ? node.as(expression["alias"].to_s) : node
        else
          expression["alias"] ? column.as(expression["alias"].to_s) : column
        end
      end
      relation.select(*expressions)
    end

    def group_columns(relation, query, _model)
      Array(query["groupBy"]).map do |field|
        validate_column!(relation, field)
        table_for(relation, field["entity"])[field.fetch("field").to_s]
      end
    end

    def apply_having(relation, query)
      return relation if Array(query["having"]).empty?

      raise QueryValidationError, "HAVING expressions require an aggregate expression API"
    end

    def apply_order(relation, query)
      Array(query["orderBy"]).each do |order|
        field = order.fetch("field")
        validate_column!(relation, field)
        direction = order.fetch("direction").to_s.downcase
        raise QueryValidationError, "Invalid order direction" unless %w[asc desc].include?(direction)

        relation = relation.order(field.fetch("field").to_s => direction.to_sym)
      end
      relation
    end
  end
end
