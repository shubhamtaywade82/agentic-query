# frozen_string_literal: true

require "active_record"
require "arel"

module AgenticQuery
  # Compiles the language-neutral Query AST into an ActiveRecord::Relation.
  # Entity names are resolved only through an explicit registry.
  class ActiveRecordAdapter
    AGGREGATES = {
      "count" => :count,
      "sum" => :sum,
      "avg" => :average,
      "min" => :minimum,
      "max" => :maximum
    }.freeze

    OPERATORS = {
      "eq" => :eq,
      "neq" => :not_eq,
      "gt" => :gt,
      "gte" => :gteq,
      "lt" => :lt,
      "lte" => :lteq
    }.freeze

    def initialize(models:)
      @models = models.transform_keys(&:to_s)
    end

    def compile(query, policy: Policy.new)
      policy.authorize!(query)
      source_name = query.fetch("source").fetch("name").to_s
      model = @models.fetch(source_name) do
        raise QueryValidationError, "Entity is not registered: #{source_name}"
      end

      relation = model.all
      relation = apply_joins(relation, query)
      relation = apply_filters(relation, query)
      relation = apply_select(relation, query)
      relation = relation.group(*group_columns(query)) unless group_columns(query).empty?
      relation = apply_order(relation, query)
      relation = relation.limit([query["limit"] || policy.max_rows, policy.max_rows].min)
      relation = relation.offset(query["offset"]) if query["offset"]
      relation
    end

    private

    def apply_joins(relation, query)
      Array(query["joins"]).each do |join|
        entity = join.fetch("entity").fetch("name").to_s
        # Prefer explicit ActiveRecord association names. Raw join SQL is never accepted.
        association = relation.klass.reflect_on_all_associations.find { |reflection| reflection.name.to_s == entity }
        raise QueryValidationError, "Join is not a registered association: #{entity}" unless association

        relation = relation.joins(association.name)
      end
      relation
    end

    def apply_filters(relation, query)
      Array(query["filters"]).each do |filter|
        field = filter.fetch("field")
        name = field.fetch("field").to_s
        validate_column!(relation.klass, name)
        operator = filter.fetch("operator").to_s

        if operator == "is_null"
          relation = relation.where(name => nil)
        elsif operator == "is_not_null"
          relation = relation.where.not(name => nil)
        elsif operator == "in" || operator == "not_in"
          values = filter.fetch("values")
          relation = operator == "in" ? relation.where(name => values) : relation.where.not(name => values)
        elsif operator == "between"
          values = filter.fetch("values")
          raise QueryValidationError, "between requires exactly two values" unless values.length == 2
          relation = relation.where(name => values[0]..values[1])
        elsif OPERATORS.key?(operator)
          relation = relation.where(name => { OPERATORS.fetch(operator) => filter.fetch("value") })
        elsif operator == "like"
          relation = relation.where(relation.klass.arel_table[name].matches(filter.fetch("value")))
        else
          raise QueryValidationError, "Unsupported filter operator: #{operator}"
        end
      end
      relation
    end

    def apply_select(relation, query)
      expressions = query.fetch("select").map do |expression|
        field = expression.fetch("field")
        name = field.fetch("field").to_s
        validate_column!(relation.klass, name)
        column = relation.klass.arel_table[name]

        aggregate = expression["aggregate"]
        if aggregate
          function = AGGREGATES.fetch(aggregate.to_s) { raise QueryValidationError, "Unsupported aggregate: #{aggregate}" }
          node = column.public_send(function)
          expression["alias"] ? node.as(expression["alias"].to_s) : node
        else
          expression["alias"] ? column.as(expression["alias"].to_s) : column
        end
      end

      relation.select(*expressions)
    end

    def group_columns(query)
      Array(query["groupBy"]).map do |field|
        name = field.fetch("field").to_s
        validate_column!(@models.fetch(query.fetch("source").fetch("name").to_s), name)
        name
      end
    end

    def apply_order(relation, query)
      Array(query["orderBy"]).each do |order|
        name = order.fetch("field").fetch("field").to_s
        validate_column!(relation.klass, name)
        direction = order.fetch("direction").to_s.downcase
        raise QueryValidationError, "Invalid order direction" unless %w[asc desc].include?(direction)

        relation = relation.order(name => direction.to_sym)
      end
      relation
    end

    def validate_column!(model, name)
      return if model.column_names.include?(name)

      raise QueryValidationError, "Column is not available: #{model.name}.#{name}"
    end
  end
end
