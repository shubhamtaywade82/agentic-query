# frozen_string_literal: true

module AgenticQuery
  # Converts the application's registered ActiveRecord models into a stable,
  # language-neutral schema representation for planners and LLM context.
  class Schema
    def initialize(models:)
      @models = models.transform_keys(&:to_s)
    end

    def entity(name)
      model = @models.fetch(name.to_s) do
        raise QueryValidationError, "Entity is not registered: #{name}"
      end

      {
        "name" => name.to_s,
        "table" => model.table_name,
        "primary_key" => model.primary_key,
        "fields" => model.columns.map do |column|
          {
            "name" => column.name,
            "type" => column.type.to_s,
            "nullable" => !column.null,
            "default" => column.default
          }
        end,
        "relations" => model.reflect_on_all_associations.map do |reflection|
          {
            "name" => reflection.name.to_s,
            "macro" => reflection.macro.to_s,
            "class_name" => reflection.class_name
          }
        end
      }
    end

    def all
      @models.keys.sort.map { |name| entity(name) }
    end
  end
end
