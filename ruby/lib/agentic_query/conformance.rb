# frozen_string_literal: true

require "json"

module AgenticQuery
  # Runs the shared, language-neutral conformance fixtures from
  # spec/conformance/v0.2 against a Ruby adapter, asserting semantic
  # expectations rather than SQL snapshots.
  module Conformance
    class ConformanceError < StandardError; end

    # Probes extract semantic facts from the compiled output. The default
    # probes work with ActiveRecord relations; adapters may supply their own.
    DEFAULT_PROBES = {
      "source" => lambda do |compiled, _query|
        compiled.klass.table_name if compiled.respond_to?(:klass)
      end,
      "selectedFields" => lambda do |compiled, query|
        select_values = compiled.select_values.map(&:name) if compiled.respond_to?(:select_values) &&
                                                               compiled.select_values.all? { |value| value.respond_to?(:name) }
        group_values = compiled.group_values.map(&:name) if compiled.respond_to?(:group_values)
        fields = Array(select_values)
        Array(group_values).each { |field| fields << field unless fields.include?(field) }
        fields.empty? && query["select"] ? query["select"].filter_map do |expression|
          expression.dig("field", "field") unless expression["aggregate"]
        end : fields
      end,
      "filterFields" => lambda do |compiled, _query|
        if compiled.respond_to?(:where_values)
          # Arel equality predicates expose their left operand column name.
          compiled.where_values.filter_map do |value|
            name = value.respond_to?(:left) && value.left.respond_to?(:name) ? value.left.name : nil
            name
          end
        end
      end,
      "limit" => lambda do |compiled, _query|
        compiled.limit_value if compiled.respond_to?(:limit_value)
      end,
      "offset" => lambda do |compiled, _query|
        compiled.offset_value if compiled.respond_to?(:offset_value)
      end,
      "groupByFields" => lambda do |compiled, _query|
        compiled.group_values.map { |node| node.respond_to?(:name) ? node.name : node.to_s } if compiled.respond_to?(:group_values) && compiled.group_values.any?
      end,
      "aggregateFunctions" => lambda do |_compiled, query|
        Array(query["select"]).filter_map do |expression|
          next unless expression["aggregate"]

          { "function" => expression["aggregate"], "field" => expression.dig("field", "field") }
        end
      end,
      "joinEntities" => lambda do |compiled, _query|
        if compiled.respond_to?(:join_sources) && compiled.join_sources.any?
          compiled.join_sources.map { |join| join.left.name.to_s.singularize }
        end
      end
    }.freeze

    module_function

    # Loads a fixture file and runs every case through the adapter.
    #
    # adapter: object responding to compile(query, policy:) -> relation
    def run_file(path, adapter, models: {}, probes: DEFAULT_PROBES)
      suite = JSON.parse(File.read(path))
      run_suite(suite, adapter, models: models, probes: probes)
    end

    def run_suite(suite, adapter, models: {}, probes: DEFAULT_PROBES)
      entity_to_table = models.to_h { |entity, model| [entity.to_s, model.table_name] }
      failures = []

      suite.fetch("cases").each do |test_case|
        begin
          assert_case(adapter, test_case, entity_to_table, probes)
        rescue ConformanceError => e
          failures << "#{test_case['name']}: #{e.message}"
        end
      end

      raise ConformanceError, "Conformance failures:\n#{failures.join("\n")}" unless failures.empty?

      suite.fetch("cases").length
    end

    def assert_case(adapter, test_case, entity_to_table, probes)
      query = test_case.fetch("query")
      expected = test_case.fetch("expected")
      policy = build_policy(test_case["policy"])

      compiled = begin
        adapter.compile(query, policy: policy)
      rescue QueryValidationError => e
        if expected["expectRejection"]
          contains = expected.dig("expectRejection", "contains")
          if contains && !e.message.include?(contains)
            raise ConformanceError, "rejected with unexpected message: #{e.message}"
          end

          return
        end
        raise ConformanceError, "adapter rejected a query it must support: #{e.message}"
      end

      if expected["expectRejection"]
        raise ConformanceError, "expected a rejection but the adapter compiled the query"
      end

      assert_equalish(entity_to_table[query.dig("source", "name")] || query.dig("source", "name"),
                      run_probe(probes, "source", compiled, query),
                      "source", test_case["name"])

      if expected["selectedFields"]
        assert_fields(expected["selectedFields"], run_probe(probes, "selectedFields", compiled, query),
                      "selected fields", test_case["name"])
      end

      if expected["filterFields"]
        assert_fields(expected["filterFields"], run_probe(probes, "filterFields", compiled, query),
                      "filter fields", test_case["name"])
      end

      if expected["limit"]
        assert_equalish(expected["limit"], run_probe(probes, "limit", compiled, query),
                        "limit", test_case["name"])
      end

      if expected["offset"]
        assert_equalish(expected["offset"], run_probe(probes, "offset", compiled, query),
                        "offset", test_case["name"])
      end

      if expected["groupByFields"]
        assert_fields(expected["groupByFields"], run_probe(probes, "groupByFields", compiled, query),
                        "groupBy fields", test_case["name"])
      end
    end

    def build_policy(raw)
      return Policy.new if raw.nil? || raw.empty?

      policy = Policy.new
      Array(raw["allowedEntities"]).each { |entity| policy.allow_entities(entity) } if raw["allowedEntities"]
      Array(raw["deniedFields"]).each do |entity, fields|
        policy.deny_fields(entity, *Array(fields))
      end if raw["deniedFields"]
      policy
    end

    def run_probe(probes, name, compiled, query)
      probe = probes[name]
      probe&.call(compiled, query)
    end

    def assert_equalish(expected, actual, label, case_name)
      return if actual.nil? # probe not applicable for this adapter

      unless actual.to_s == expected.to_s
        raise ConformanceError, "#{label} mismatch in '#{case_name}': expected #{expected.inspect}, got #{actual.inspect}"
      end
    end

    def assert_fields(expected, actual, label, case_name)
      return if actual.nil?

      expected_sorted = Array(expected).map(&:to_s).sort
      actual_sorted = Array(actual).map(&:to_s).sort
      unless expected_sorted == actual_sorted
        raise ConformanceError, "#{label} mismatch in '#{case_name}': expected #{expected_sorted.inspect}, got #{actual_sorted.inspect}"
      end
    end
  end
end
