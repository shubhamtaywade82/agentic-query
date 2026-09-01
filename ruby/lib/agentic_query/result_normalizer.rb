# frozen_string_literal: true

module AgenticQuery
  # Deterministic result normalization: adapter-specific rows are converted
  # into a language-neutral hash with columns, rows, row_count, metadata.
  class ResultNormalizer
    attr_reader :max_rows

    def initialize(max_rows: nil)
      @max_rows = max_rows&.to_i
    end

    # Normalizes an array of ActiveRecord-ish row objects (responding to
    # attributes) or plain hashes.
    def normalize_rows(rows, metadata: {})
      records = rows.map { |row| row.respond_to?(:attributes) ? row.attributes : row }
      column_order = []
      seen = {}
      records.each do |record|
        next unless record.is_a?(Hash)

        record.each_key do |key|
          next if seen[key]

          seen[key] = true
          column_order << key
        end
      end

      bounded = @max_rows ? records.first([@max_rows, records.length].min) : records
      truncated = @max_rows ? records.length > bounded.length : false

      columns = column_order.map do |name|
        column = { "name" => name, "nullable" => true, "type" => "unknown" }
        type = nil
        saw_null = false
        bounded.each do |record|
          value = record.is_a?(Hash) ? record[name] : nil
          if value.nil?
            saw_null = true
          elsif type.nil?
            type = infer_type(value)
          end
        end
        column["type"] = type || (bounded.empty? ? "unknown" : "null")
        column["nullable"] = saw_null || bounded.empty?
        column
      end

      {
        "columns" => columns,
        "rows" => bounded.map { |record| column_order.map { |name| record.is_a?(Hash) ? record[name] : nil } },
        "row_count" => bounded.length,
        "metadata" => {
          "row_count" => bounded.length,
          "truncated" => truncated
        }.merge(stringify_keys(metadata))
      }
    end

    # Normalizes aggregate results such as { "sum" => { "amount" => 300 } }.
    def normalize_aggregate(aggregate, metadata: {})
      columns = []
      row = []
      aggregate.each do |key, value|
        if value.is_a?(Hash)
          value.each do |field, field_value|
            columns << { "name" => "#{key}_#{field}", "type" => infer_type(field_value), "nullable" => true }
            row << field_value
          end
        else
          columns << { "name" => key.to_s, "type" => infer_type(value), "nullable" => true }
          row << value
        end
      end

      {
        "columns" => columns,
        "rows" => row.empty? ? [] : [row],
        "row_count" => row.empty? ? 0 : 1,
        "metadata" => { "row_count" => row.empty? ? 0 : 1 }.merge(stringify_keys(metadata))
      }
    end

    # Bounded text serialization for answer-synthesis prompts.
    def serialize(result, max_rows: 50, max_chars: 8_000)
      columns = result["columns"] || []
      header = columns.map { |column| column["name"] }.join(" | ")
      rows = (result["rows"] || []).first(max_rows)
      lines = rows.map { |row| row.map { |value| value.nil? ? "null" : value.to_s }.join(" | ") }
      body = [header, *lines].compact.reject(&:empty?).join("\n")
      total = (result["rows"] || []).length
      body += "\n(#{total - max_rows} more rows not shown; total #{total})" if total > max_rows
      body = "#{body[0, max_chars]}\n(output truncated)" if body.length > max_chars
      body
    end

    private

    def infer_type(value)
      case value
      when nil then "null"
      when String then "string"
      when Integer, Float then "number"
      when TrueClass, FalseClass then "boolean"
      when Time, Date, DateTime then "date"
      when BigDecimal then "decimal"
      else "json"
      end
    end

    def stringify_keys(hash)
      hash.to_h { |key, value| [key.to_s, value] }
    end
  end
end
