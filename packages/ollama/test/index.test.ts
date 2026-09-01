import { describe, expect, it } from 'vitest';
import {
  OllamaProvider,
  OllamaProviderError,
  OllamaStructuredOutputError,
  OLLAMA_CAPABILITIES,
  type OllamaClientLike
} from '../src/index.js';
import type { StructuredGenerationResult } from '@agentic-query/core';

function clientReturning(
  impl: (request: unknown) => Promise<StructuredGenerationResult<unknown>>
): OllamaClientLike & { requests: unknown[] } {
  const requests: unknown[] = [];
  return {
    requests,
    async generateStructured<T>(request: unknown) {
      requests.push(request);
      return impl(request) as StructuredGenerationResult<T>;
    }
  };
}

describe('OllamaProvider', () => {
  it('delegates structured generation with model injection and trace metadata', async () => {
    const client = clientReturning(async () => ({ output: { source: { name: 'orders' } } }));
    const provider = new OllamaProvider({ client, model: 'llama3.1' });

    const result = await provider.generateStructured({
      messages: [{ role: 'user', content: 'q' }],
      schema: { type: 'object' },
      trace: { requestId: 'req-1' }
    });

    expect(result.output).toEqual({ source: { name: 'orders' } });
    expect(result.trace).toMatchObject({ requestId: 'req-1', provider: 'ollama', model: 'llama3.1' });
    expect(client.requests[0]).toMatchObject({ model: 'llama3.1', timeoutMs: 30_000 });
  });

  it('propagates usage accounting when the client reports it', async () => {
    const client = clientReturning(async () => ({
      output: { a: 1 },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
    }));
    const provider = new OllamaProvider({ client, model: 'llama3.1' });

    const result = await provider.generateStructured({
      messages: [{ role: 'user', content: 'q' }],
      schema: { type: 'object' }
    });

    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it('rejects malformed structured output fail-closed', async () => {
    const client = clientReturning(async () => ({ output: 'not-an-object' }));
    const provider = new OllamaProvider({ client, model: 'llama3.1', maxRetries: 0 });

    await expect(
      provider.generateStructured({ messages: [{ role: 'user', content: 'q' }], schema: { type: 'object' } })
    ).rejects.toBeInstanceOf(OllamaStructuredOutputError);
  });

  it('retries transient client failures with backoff, then succeeds', async () => {
    let calls = 0;
    const client = clientReturning(async () => {
      calls += 1;
      if (calls === 1) throw new Error('socket hang up');
      return { output: { ok: true } };
    });
    const provider = new OllamaProvider({ client, model: 'llama3.1', maxRetries: 2, retryBackoffMs: 1 });

    const result = await provider.generateStructured({ messages: [{ role: 'user', content: 'q' }], schema: {} });
    expect(result.output).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('normalizes non-retriable client failures into OllamaProviderError', async () => {
    const client = clientReturning(async () => {
      throw new Error('model not found');
    });
    const provider = new OllamaProvider({ client, model: 'missing-model', maxRetries: 2, retryBackoffMs: 1 });

    await expect(
      provider.generateStructured({ messages: [{ role: 'user', content: 'q' }], schema: {} })
    ).rejects.toThrow(OllamaProviderError);
  });

  it('enforces the request timeout', async () => {
    const client = clientReturning(
      () => new Promise((resolve) => setTimeout(() => resolve({ output: { ok: true } }), 500))
    );
    const provider = new OllamaProvider({ client, model: 'llama3.1', maxRetries: 0 });

    await expect(
      provider.generateStructured({
        messages: [{ role: 'user', content: 'q' }],
        schema: {},
        timeoutMs: 20
      })
    ).rejects.toThrow(/timed out/);
  });

  it('does not retry provider-level non-retriable structured errors', async () => {
    let calls = 0;
    const client = clientReturning(async () => {
      calls += 1;
      return { output: null };
    });
    const provider = new OllamaProvider({ client, model: 'llama3.1', maxRetries: 3, retryBackoffMs: 1 });

    await expect(
      provider.generateStructured({ messages: [{ role: 'user', content: 'q' }], schema: {} })
    ).rejects.toThrow(OllamaStructuredOutputError);
    expect(calls).toBe(1);
  });

  it('exposes capability metadata', () => {
    expect(OLLAMA_CAPABILITIES).toMatchObject({ id: 'ollama', structuredOutput: true, requestTimeout: true });
  });

  it('rejects construction without a client or model', () => {
    expect(() => new OllamaProvider({ client: undefined as never, model: 'x' })).toThrow(OllamaProviderError);
    expect(
      () => new OllamaProvider({ client: clientReturning(async () => ({ output: {} })), model: '' })
    ).toThrow(OllamaProviderError);
  });

  it('forwards per-request timeout to the client', async () => {
    const client = clientReturning(async () => ({ output: { ok: 1 } }));
    const provider = new OllamaProvider({ client, model: 'llama3.1', timeoutMs: 5000 });

    await provider.generateStructured({
      messages: [{ role: 'user', content: 'q' }],
      schema: {}
    });

    expect(client.requests[0]).toMatchObject({ timeoutMs: 5000 });
  });
});
