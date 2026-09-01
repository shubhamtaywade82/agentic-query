# frozen_string_literal: true

module AgenticQuery
  # Deterministic authorization and resource policy for model-generated queries.
  # Policies are application code and are never delegated to the model.
  class Policy
    attr_reader :max_rows, :timeout_ms

    def initialize(max_rows: 1_000, timeout_ms: 5_000)
      @max_rows = max_rows
      @timeout_ms = timeout_ms
      @allowed_entities = nil
      @denied_fields = Hash.new { |hash, key| hash[key] = [] }
    end

    def allow_entities(*entities)
      @allowed_entities = entities.flatten.map(&:to_s).to_set
    end

    def deny_fields(entity, *fields)
      @denied_fields[entity.to_s].concat(fields.flatten.map(&:to_s)).uniq!
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
      return if limit.nil? || limit.to_i <= @max_rows

      raise QueryValidationError, "Query limit exceeds policy maximum"
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
