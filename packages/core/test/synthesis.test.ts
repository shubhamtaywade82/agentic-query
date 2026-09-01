import { describe, expect, it } from 'vitest';
import { AnswerSynthesizer, AnswerSynthesisError, normalizeAggregateResult, normalizeRowsResult } from '../src/index.js';
import type { ModelProvider, StructuredGenerationRequest } from '../src/index.js';

function providerReturning(output: unknown, capture: { request?: StructuredGenerationRequest }): ModelProvider {
  return {
    async generateStructured(request: StructuredGenerationRequest) {
      capture.request = request;
      return { output } as never;
    }
  };
}

describe('AnswerSynthesizer', () => {
  it('answers from the normalized result and cites columns', async () => {
    const capture: { request?: StructuredGenerationRequest } = {};
    const provider = providerReturning({ answer: 'Total revenue is 300 USD (sum_amount).' }, capture);
    const synthesizer = new AnswerSynthesizer({ provider, model: 'llama3.1' });

    const result = normalizeAggregateResult({ _sum: { amount: 300 } });
    const answer = await synthesizer.synthesize({ question: 'What was total revenue?', result });

    expect(answer.answer).toContain('300');
    expect(answer.model).toBe('llama3.1');

    const prompt = capture.request?.messages.at(-1)?.content ?? '';
    expect(prompt).toContain('What was total revenue?');
    expect(prompt).toContain('sum_amount');
    // Synthesis receives only the result, never the query AST or credentials.
    expect(prompt).not.toContain('password');
  });

  it('adds caveats for empty and truncated results', async () => {
    const provider = providerReturning({ answer: 'No data matched.' }, {});
    const synthesizer = new AnswerSynthesizer({ provider, model: 'm' });

    const empty = normalizeRowsResult([]);
    const answer = await synthesizer.synthesize({ question: 'q', result: empty });
    expect(answer.caveats.some((caveat) => caveat.includes('no rows'))).toBe(true);
    expect(answer.caveats.some((caveat) => caveat.includes('confidence'))).toBe(true);
  });

  it('rejects malformed synthesis output fail-closed', async () => {
    const provider = providerReturning({ answer: '' }, {});
    const synthesizer = new AnswerSynthesizer({ provider, model: 'm' });

    const result = normalizeRowsResult([{ id: 1 }]);
    await expect(synthesizer.synthesize({ question: 'q', result })).rejects.toBeInstanceOf(AnswerSynthesisError);
  });

  it('propagates provider failures as normalized synthesis errors', async () => {
    const provider: ModelProvider = {
      async generateStructured() {
        throw new Error('provider exploded');
      }
    };
    const synthesizer = new AnswerSynthesizer({ provider, model: 'm' });

    const result = normalizeRowsResult([{ id: 1 }]);
    await expect(synthesizer.synthesize({ question: 'q', result })).rejects.toThrow('Answer synthesis failed');
  });

  it('includes safe context metadata in the prompt', async () => {
    const capture: { request?: StructuredGenerationRequest } = {};
    const provider = providerReturning({ answer: 'ok' }, capture);
    const synthesizer = new AnswerSynthesizer({ provider, model: 'm' });

    const result = normalizeRowsResult([{ id: 1 }]);
    await synthesizer.synthesize({ question: 'q', result, context: { unit: 'USD', report: 'monthly' } });

    const prompt = capture.request?.messages.at(-1)?.content ?? '';
    expect(prompt).toContain('unit: USD');
    expect(prompt).toContain('report: monthly');
  });
});
