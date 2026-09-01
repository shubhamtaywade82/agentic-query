import { AgenticQueryAgent, SimpleSchemaRetriever } from '@agentic-query/core';
import { OllamaProvider, type OllamaClientLike } from '@agentic-query/ollama';
import type { SchemaProvider, QueryAdapter } from '@agentic-query/core';

// Adapt your Ollama client (e.g. @nemesis-oss/ollama-sdk) to OllamaClientLike.
// The host owns transport; Agentic Query owns policy and orchestration.
const ollamaClient: OllamaClientLike = {
  async generateStructured(request) {
    // Wire this example to your configured Ollama client.
    throw new Error('Wire this example to your configured Ollama client');
  }
};

const provider = new OllamaProvider({
  client: ollamaClient,
  model: 'qwen3',
  timeoutMs: 30_000,
  maxRetries: 2
});

// Describe the entities the agent may see; the retriever scrubs denied
// fields from prompt context automatically.
const schemaProvider: SchemaProvider = {
  listEntities: () => [
    {
      name: 'orders',
      table: 'orders',
      primaryKey: 'id',
      fields: [
        { name: 'id', type: 'integer' },
        { name: 'status', type: 'string' },
        { name: 'amount', type: 'decimal' }
      ],
      relations: []
    }
  ],
  getEntity: (name) => (name === 'orders' ? schemaProvider.listEntities()[0] : undefined)
};

// Adapter boundary: validate + compile + execute are application-owned.
const queryAdapter: QueryAdapter<unknown, Record<string, unknown>[]> = {
  compile: (query) => query,
  execute: async () => []
};

const agent = new AgenticQueryAgent({
  model: 'qwen3',
  modelProvider: provider,
  schemaProvider,
  queryAdapter,
  policy: {
    allowedEntities: ['orders'],
    maxRows: 100
  },
  schemaRetriever: new SimpleSchemaRetriever({ provider: schemaProvider, maxEntities: 4 })
});

const result = await agent.ask('Show completed orders with their amounts');
console.log(JSON.stringify({ query: result.query, normalized: result.normalized }, null, 2));
