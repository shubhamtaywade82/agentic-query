# frozen_string_literal: true

module AgenticQuery
  # Deterministic Tier-1 lexical schema retrieval with Tier-3 caching.
  # Denied fields are scrubbed from prompt context so the model can never
  # even see them, let alone reference them.
  class SchemaRetriever
    def initialize(schema:, max_entities: 8, cache_ttl: 60, policy: nil)
      @schema = schema
      @max_entities = max_entities
      @cache_ttl = cache_ttl
      @policy = policy
      @cache = {}
      @revision = 0
    end

    def retrieve(question, tenant: nil)
      key = "#{tenant || '_'}::#{question}"
      cached = @cache[key]
      return cached[:entities] if fresh?(cached)

      entities = rank(question, @schema.all).first(@max_entities)
      entities = scrub_denied_fields(entities)
      @cache[key] = { entities: entities, at: Process.clock_gettime(Process::CLOCK_MONOTONIC) }
      entities
    end

    # Invalidates the cache; call when registered models change.
    def invalidate
      @cache.clear
      @revision += 1
    end

    def format_context(entities)
      entities.map do |entity|
        fields = entity["fields"].map { |field| "#{field['name']}: #{field['type']}#{' nullable' if field['nullable']}" }.join(", ")
        relations = entity["relations"].map { |relation| "#{relation['name']} -> #{relation['class_name']}" }.join(", ")

        lines = ["Entity: #{entity['name']}"]
        lines << "Table: #{entity['table']}" if entity["table"]
        lines << "Primary key: #{entity['primary_key']}" if entity["primary_key"]
        lines << "Fields: #{fields}"
        lines << "Relations: #{relations}" unless relations.empty?
        lines.compact.join("\n")
      end.join("\n\n")
    end

    private

    def fresh?(cached)
      return false unless cached

      age = Process.clock_gettime(Process::CLOCK_MONOTONIC) - cached[:at]
      @cache_ttl.positive? && age < @cache_ttl
    end

    def rank(question, entities)
      return entities if entities.length <= @max_entities

      tokens = tokenize(question)
      scored = entities.each_with_index.map do |entity, index|
        haystack = [entity["name"], entity["table"] || "",
                    *entity["fields"].map { |field| field["name"] },
                    *entity["relations"].map { |relation| relation["name"] }].join(" ").downcase
        score = tokens.sum { |token| haystack.include?(token) ? (entity["name"].downcase == token ? 3 : 1) : 0 }
        { entity: entity, score: score, index: index }
      end

      scored.sort_by { |item| [-item[:score], item[:index]] }.map { |item| item[:entity] }
    end

    # Security: denied fields never leak into prompt context.
    def scrub_denied_fields(entities)
      return entities unless @policy&.respond_to?(:field_allowed?)

      entities.map do |entity|
        allowed = entity["fields"].reject do |field|
          !@policy.field_allowed?(entity["name"], field["name"])
        end
        entity.merge("fields" => allowed)
      end
    end

    def tokenize(question)
      question.to_s.downcase.split(/[^a-z0-9_]+/).select { |token| token.length >= 3 }
    end
  end
end
