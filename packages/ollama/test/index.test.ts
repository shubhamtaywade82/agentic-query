import { describe, expect, it } from 'vitest';
import { OllamaProvider, type OllamaClientLike } from '../src/index.js';

describe('OllamaProvider', () => {
  it('injects the configured model into the client request', async () => {
    const calls: unknown[] = [];
    const client: OllamaClientLike = {
      async generateStructured(request) {
        calls.push(request);
        return { output: { source: { name: 'orders' }, select: [] } };
      }
    };

    const provider = new OllamaProvider({ client, model: 'qwen3' });

    const result = await provider.generateStructured({
      messages: [{ role: 'user', content: 'List orders' }],
      schema: { type: 'object' }
    });

    expect(calls).toEqual([
      {
        model: 'qwen3',
        messages: [{ role: 'user', content: 'List orders' }],
        schema: { type: 'object' }
      }
    ]);
    expect(result.output).toEqual({ source: { name: 'orders' }, select: [] });
  });

  it('exposes the configured model', () => {
    const client: OllamaClientLike = {
      async generateStructured() {
        return { output: undefined };
      }
    };

    const provider = new OllamaProvider({ client, model: 'llama3' });
    expect(provider.model).toBe('llama3');
  });
});
