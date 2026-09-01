import { StructuredQueryGenerator } from '@agentic-query/core';
import { OllamaProvider } from '@agentic-query/ollama';

// Adapt your @nemesis-oss/ollama-sdk client to OllamaClientLike.
const ollamaClient = {
  async generateStructured<T>(request: Parameters<NonNullable<unknown>>[0]): Promise<never> {
    throw new Error('Wire this example to your configured @nemesis-oss/ollama-sdk client');
  }
};

const provider = new OllamaProvider({
  client: ollamaClient,
  model: 'qwen3'
});

const generator = new StructuredQueryGenerator({ provider });

const query = await generator.generate({
  model: 'qwen3',
  question: 'Show completed orders from the last 30 days',
  schemaContext: 'orders(id, status, amount, created_at)'
});

console.log(JSON.stringify(query, null, 2));
