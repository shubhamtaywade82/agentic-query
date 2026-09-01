/**
 * Optional answer synthesis (plan §9).
 *
 * Synthesis is a strictly separate concern from query execution: the
 * synthesis model receives only the normalized QueryResult and safe
 * contextual metadata — never the query AST, never credentials, and it
 * can never rewrite the executed query. The raw structured result is
 * always returned alongside the natural-language answer.
 */
import type { ModelProvider, ModelMessage } from './model.js';
import { serializeQueryResult, type QueryResult } from './result.js';

export interface AnswerSynthesisContext {
  /** Safe, non-sensitive contextual metadata (e.g. report title, unit). */
  [key: string]: string;
}

export interface AnswerSynthesisRequest {
  question: string;
  result: QueryResult;
  context?: Readonly<AnswerSynthesisContext> | undefined;
  trace?: { requestId?: string | undefined } | undefined;
}

export interface AnswerSynthesisResult {
  answer: string;
  /** Model-stated confidence when available; heuristic caveats otherwise. */
  confidence?: number | undefined;
  /** Caveats such as truncated results or empty result sets. */
  caveats: readonly string[];
  model: string;
  usage?: { inputTokens?: number | undefined; outputTokens?: number | undefined; totalTokens?: number | undefined } | undefined;
}

export class AnswerSynthesisError extends Error {
  readonly code = 'ANSWER_SYNTHESIS_ERROR';
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AnswerSynthesisError';
  }
}

const DEFAULT_SYSTEM_PROMPT = [
  'You answer data questions using ONLY the supplied query result table.',
  'Never invent or estimate values that are not present in the table.',
  'When citing a value, mention the column it came from.',
  'If the table cannot answer the question, say so explicitly.',
  'You cannot rewrite, re-run, or extend the query; do not request more data.'
].join(' ');

export interface AnswerSynthesizerOptions {
  provider: ModelProvider;
  model: string;
  systemPrompt?: string | undefined;
  maxRowsInPrompt?: number | undefined;
  maxPromptChars?: number | undefined;
}

export class AnswerSynthesizer {
  private readonly provider: ModelProvider;
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly maxRowsInPrompt: number;
  private readonly maxPromptChars: number;

  constructor(options: AnswerSynthesizerOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.maxRowsInPrompt = options.maxRowsInPrompt ?? 50;
    this.maxPromptChars = options.maxPromptChars ?? 8000;
  }

  async synthesize(request: AnswerSynthesisRequest): Promise<AnswerSynthesisResult> {
    const caveats: string[] = [];
    if (request.result.rowCount === 0) {
      caveats.push('The query returned no rows; the answer can only state that no data matched.');
    }
    if (request.result.metadata.truncated) {
      caveats.push('The result was truncated by policy; the answer covers only the returned rows.');
    }

    const table = serializeQueryResult(request.result, {
      maxRows: this.maxRowsInPrompt,
      maxChars: this.maxPromptChars
    });
    if (table.length >= this.maxPromptChars) {
      caveats.push('The result table was truncated to fit the prompt budget.');
    }

    const contextLines = Object.entries(request.context ?? {}).map(([key, value]) => `${key}: ${value}`);
    const messages: ModelMessage[] = [
      { role: 'system', content: this.systemPrompt },
      {
        role: 'user',
        content: [
          `Question: ${request.question}`,
          '',
          'Query result (columns then rows):',
          table,
          ...(contextLines.length > 0 ? ['', 'Context:', ...contextLines] : []),
          '',
          'Answer the question using only the result above. Cite columns where useful. State clearly if the data cannot answer the question.'
        ].join('\n')
      }
    ];

    try {
      const completion = await this.provider.generateStructured<{ answer: string; confidence?: number }>({
        model: this.model,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['answer'],
          properties: {
            answer: { type: 'string', minLength: 1 },
            confidence: { type: 'number', minimum: 0, maximum: 1 }
          }
        },
        messages,
        ...(request.trace !== undefined ? { trace: request.trace } : {})
      });

      const output = completion.output;
      if (!output || typeof output !== 'object' || typeof output.answer !== 'string' || output.answer.length === 0) {
        throw new AnswerSynthesisError('Synthesis model produced a malformed answer');
      }

      const confidence =
        typeof output.confidence === 'number' && output.confidence >= 0 && output.confidence <= 1
          ? output.confidence
          : undefined;
      if (confidence === undefined) caveats.push('The model did not report a confidence value.');

      return {
        answer: output.answer,
        ...(confidence !== undefined ? { confidence } : {}),
        caveats,
        model: this.model,
        ...(completion.usage !== undefined ? { usage: completion.usage } : {})
      };
    } catch (error) {
      if (error instanceof AnswerSynthesisError) throw error;
      throw new AnswerSynthesisError('Answer synthesis failed', error);
    }
  }
}
