/**
 * ModelProvider contract. Providers translate structured generation
 * requests into validated model output; they never execute SQL, never
 * touch database credentials, and never become an authorization boundary.
 */
import type { Query } from './ast.js';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TraceMetadata {
  /** Correlates a single agent request across events and providers. */
  requestId?: string | undefined;
  /** Optional distributed-tracing identifiers supplied by the host. */
  traceId?: string | undefined;
  spanId?: string | undefined;
  /** Provider identifier echoed for telemetry. */
  provider?: string | undefined;
  /** Model identifier echoed for telemetry. */
  model?: string | undefined;
}

export interface StructuredGenerationRequest {
  model: string;
  messages: readonly ModelMessage[];
  schema: Record<string, unknown>;
  /** Per-request timeout hint (milliseconds) for capable providers. */
  timeoutMs?: number | undefined;
  /** Trace metadata propagated into provider-level telemetry. */
  trace?: TraceMetadata | undefined;
}

export interface UsageAccounting {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface StructuredGenerationResult<T> {
  output: T;
  raw?: unknown;
  usage?: UsageAccounting | undefined;
  /** Provider latency when exposed (milliseconds). */
  latencyMs?: number | undefined;
  /** Echoed trace metadata for correlation. */
  trace?: TraceMetadata | undefined;
}

export interface ModelProvider {
  generateStructured<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>>;
}

/** Static description of what a provider implementation supports. */
export interface ModelProviderCapabilities {
  /** Stable provider identifier, e.g. `ollama`. */
  id: string;
  /** Whether structured/JSON-schema-constrained output is supported. */
  structuredOutput: boolean;
  /** Whether token usage is reported: `always`, `when-available`, `never`. */
  usageReporting: 'always' | 'when-available' | 'never';
  /** Whether per-request timeouts are honored. */
  requestTimeout: boolean;
}

export interface QueryGenerationRequest {
  question: string;
  schemaContext: string;
  model: string;
  trace?: TraceMetadata | undefined;
}

export interface QueryGenerator {
  generate(request: QueryGenerationRequest): Promise<Query>;
}

/** Deterministic request identifier generation for trace correlation. */
let requestCounter = 0;
export function nextRequestId(prefix = 'req'): string {
  requestCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}
