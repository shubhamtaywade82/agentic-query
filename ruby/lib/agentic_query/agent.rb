# frozen_string_literal: true

module AgenticQuery
  # Rails public API (plan Phase R5).
  #
  #   agent = AgenticQuery::Agent.new(
  #     model: "qwen3",
  #     provider: provider,                 # responds to generate_structured(request)
  #     schema: AgenticQuery::Schema.new(models: { orders: Order }),
  #     adapter: AgenticQuery::ActiveRecordAdapter.new(models: { orders: Order }),
  #     policy: policy,
  #     schema_retriever: retriever         # optional; built from schema by default
  #   )
  #   result = agent.ask("What was revenue last month?")
  #
  # The provider never receives database credentials; policy is enforced by
  # trusted code immediately before adapter compilation; synthesis is a
  # strictly separate, optional concern.
  class Agent
    AST_SCHEMA = {
      "type" => "object",
      "required" => %w[source select]
    }.freeze

    Result = Struct.new(:query, :rows, :normalized, :schema_context, :repair_attempts, :request_id, :answer,
                        keyword_init: true)

    def initialize(model:, provider:, schema:, adapter:, policy: nil,
                   schema_retriever: nil, max_repair_attempts: 2,
                   synthesizer: nil, normalizer: nil)
      unless provider.respond_to?(:generate_structured)
        raise ArgumentError, "provider must respond to generate_structured(request)"
      end

      @model = model
      @provider = provider
      @schema = schema
      @adapter = adapter
      @policy = policy || Policy.new
      @schema_retriever = schema_retriever ||
                          SchemaRetriever.new(schema: schema, policy: @policy)
      @max_repair_attempts = max_repair_attempts
      @synthesizer = synthesizer
      @normalizer = normalizer || ResultNormalizer.new(max_rows: @policy.max_rows)
    end

    # Full pipeline: retrieve -> generate -> validate -> (repair) -> compile
    # -> execute -> normalize -> (synthesize). Returns an Agent::Result.
    def ask(question, query: nil, tenant: nil, synthesize: true)
      request_id = "agent-#{SecureRandom.hex(8)}"
      entities = @schema_retriever.retrieve(question, tenant: tenant)
      schema_context = @schema_retriever.format_context(entities)

      compiled_query = query || generate_query(question, schema_context, request_id)
      compiled_query = repair_query(question, schema_context, compiled_query) do |candidate|
        @policy.validate_structure!(candidate)
        @policy.authorize!(candidate)
      end

      executor = Executor.new(adapter: @adapter, policy: @policy, normalizer: @normalizer)
      execution = executor.execute(compiled_query)

      answer = synthesize_answer(question, execution["normalized"]) if @synthesizer && synthesize

      Result.new(
        query: compiled_query,
        rows: execution["rows"],
        normalized: execution["normalized"],
        schema_context: schema_context,
        repair_attempts: @repair_attempts.to_i,
        request_id: request_id,
        answer: answer
      )
    end

    private

    def generate_query(question, schema_context, _request_id)
      response = @provider.generate_structured(
        "model" => @model,
        "schema" => AST_SCHEMA,
        "messages" => [
          { "role" => "system", "content" =>
            "You generate Agentic Query AST objects. Return only JSON conforming to the schema. " \
            "Never invent entities or fields not present in schemaContext. Never return SQL or code." },
          { "role" => "user", "content" =>
            "Question: #{question}\n\nSchema context:\n#{schema_context}" }
        ]
      )
      response.fetch("output")
    rescue StandardError => e
      raise QueryGenerationError, "model generation failed: #{e.message}"
    end

    # Bounded repair: validate, and on failure ask the model to fix the AST
    # within the attempt budget. Fail closed when the budget is exhausted.
    def repair_query(question, schema_context, candidate)
      @repair_attempts = 0
      last_error = nil

      begin
        yield candidate
        return candidate
      rescue QueryValidationError => e
        last_error = e
      end

      (@max_repair_attempts + 1).times do
        @repair_attempts += 1
        response = @provider.generate_structured(
          "model" => @model,
          "schema" => AST_SCHEMA,
          "messages" => [
            { "role" => "system", "content" =>
              "Repair the supplied Agentic Query AST. Return only a corrected AST. Never return SQL or code." },
            { "role" => "user", "content" =>
              "Question: #{question}\n\nSchema context:\n#{schema_context}\n\n" \
              "Candidate AST:\n#{candidate.to_json}\n\nValidation error:\n#{last_error.message}" }
          ]
        )
        candidate = response.fetch("output")

        begin
          yield candidate
          return candidate
        rescue QueryValidationError => e
          last_error = e
        end
      end

      raise QueryValidationError,
            "Unable to produce a policy-valid query after bounded repair attempts: #{last_error.message}"
    end

    def synthesize_answer(question, normalized)
      @synthesizer.call(question: question, result: normalized, model: @model)
    rescue StandardError => e
      raise QueryExecutionError, "answer synthesis failed: #{e.message}"
    end
  end
end
