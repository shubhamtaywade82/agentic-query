/**
 * Ollama model-provider integration (plan Phase N4).
 *
 * The host application owns the HTTP/protocol client (`OllamaClientLike`).
 * This provider adds: model selection, per-request timeout, bounded retry
 * with backoff, usage/token accounting, trace metadata propagation,
 * capability metadata, malformed structured-output handling, and
 * normalized provider errors.
 */
import type {
  ModelProvider,
  ModelProviderCapabilities,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TraceMetadata
} from '@agentic-query/core';

export interface OllamaClientLike {
  generateStructured<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>>;
}

export interface OllamaProviderOptions {
  client: OllamaClientLike;
  model: string;
  /** Per-request timeout in milliseconds (default 30_000). */
  timeoutMs?: number | undefined;
  /** Bounded retries on transient client failure (default 1, max 3). */
  maxRetries?: number | undefined;
  /** Base backoff in milliseconds for retry (default 200). */
  retryBackoffMs?: number | undefined;
  /** Provider label reported in trace metadata (default `ollama`). */
  providerId?: string | undefined;
}

/** Normalized provider error: all client failures surface as this type. */
export class OllamaProviderError extends Error {
  readonly code = 'OLLAMA_PROVIDER_ERROR';
  readonly retriable: boolean;
  readonly attempt: number;

  constructor(message: string, options: { retriable?: boolean; attempt?: number; cause?: unknown } = {}) {
    super(message);
    this.name = 'OllamaProviderError';
    this.retriable = options.retriable ?? false;
    this.attempt = options.attempt ?? 0;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Result of a malformed structured output payload. */
export class OllamaStructuredOutputError extends OllamaProviderError {
  constructor(message: string, readonly payload: unknown) {
    super(message, { retriable: false });
    this.name = 'OllamaStructuredOutputError';
  }
}

export const OLLAMA_CAPABILITIES: ModelProviderCapabilities = {
  id: 'ollama',
  structuredOutput: true,
  usageReporting: 'when-available',
  requestTimeout: true
};

function isRetriable(error: unknown): boolean {
  if (error instanceof OllamaProviderError) return error.retriable;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /timeout|timed out|econnreset|econnrefused|socket hang up|fetch failed|429|503|502/.test(message);
}

function isStructuredPayload(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class OllamaProvider implements ModelProvider {
  readonly model: string;
  readonly capabilities: ModelProviderCapabilities = OLLAMA_CAPABILITIES;

  private readonly client: OllamaClientLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;
  private readonly providerId: string;

  constructor(options: OllamaProviderOptions) {
    if (!options?.client) throw new OllamaProviderError('OllamaProvider requires a configured client');
    if (!options?.model) throw new OllamaProviderError('OllamaProvider requires a model identifier');
    this.client = options.client;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = Math.max(0, Math.min(options.maxRetries ?? 1, 3));
    this.retryBackoffMs = options.retryBackoffMs ?? 200;
    this.providerId = options.providerId ?? 'ollama';
  }

  async generateStructured<T>(
    request: Omit<StructuredGenerationRequest, 'model'>
  ): Promise<StructuredGenerationResult<T>> {
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;
    const trace: TraceMetadata = { ...request.trace, provider: this.providerId, model: this.model };
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const result = await this.withTimeout(
          this.client.generateStructured<T>({ ...request, model: this.model, timeoutMs, trace }),
          timeoutMs
        );

        if (!isStructuredPayload(result?.output)) {
          throw new OllamaStructuredOutputError(
            `Ollama returned a malformed structured output for model ${this.model}`,
            result?.output
          );
        }

        return {
          output: result.output,
          ...(result.raw !== undefined ? { raw: result.raw } : {}),
          ...(result.usage !== undefined ? { usage: result.usage } : {}),
          trace
        };
      } catch (error) {
        lastError = error;
        const retriable = isRetriable(error);
        if (!retriable || attempt === this.maxRetries) break;
        await this.sleep(this.retryBackoffMs * 2 ** attempt);
      }
    }

    if (lastError instanceof OllamaProviderError) throw lastError;
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new OllamaProviderError(`Ollama request failed after ${this.maxRetries + 1} attempt(s): ${message}`, {
      retriable: isRetriable(lastError),
      cause: lastError
    });
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new OllamaProviderError(`Ollama request timed out after ${timeoutMs}ms`, { retriable: true })),
        timeoutMs
      );
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    }) as Promise<T>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
