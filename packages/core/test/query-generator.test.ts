import { describe, expect, it } from 'vitest';
import { StructuredQueryGenerator } from '../src/query-generator.js';
import type { ModelProvider } from '../src/model.js';

function providerReturning(output: unknown, capture: { request?: unknown }): ModelProvider {
  return {
    async generateStructured(request) {
      capture.request = request;
      return { output } as never;
    }
  };
}

describe('StructuredQueryGenerator', () => {
  it('requests structured Query AST output', async () => {
    const capture: { request?: unknown } = {};
    const provider = providerReturning({
      source: { name: 'orders' },
      select: [{ field: { field: 'id' } }]
    }, capture);

    const generator = new StructuredQueryGenerator({ provider });
    await expect(generator.generate({
      question: 'List order ids',
      schemaContext: 'orders(id)',
      model: 'qwen3'
    })).resolves.toEqual({
      source: { name: 'orders' },
      select: [{ field: { field: 'id' } }]
    });

    expect(capture.request).toMatchObject({ model: 'qwen3' });
    expect(capture.request).toHaveProperty('schema');
  });

  it('rejects invalid model output before execution', async () => {
    const provider = providerReturning({
      source: { name: 'orders' },
      select: []
    }, {});

    const generator = new StructuredQueryGenerator({ provider });

    await expect(generator.generate({
      question: 'List orders',
      schemaContext: 'orders(id)',
      model: 'qwen3'
    })).rejects.toThrow('Query must select at least one expression');
  });
});
