import type { Query } from './index.js';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StructuredGenerationRequest {
  model: string;
  messages: readonly ModelMessage[];
  schema: Record<string, unknown>;
}

export interface StructuredGenerationResult<T> {
  output: T;
  raw?: unknown;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface ModelProvider {
  generateStructured<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>>;
}

export interface QueryGenerationRequest {
  question: string;
  schemaContext: string;
  model: string;
}

export interface QueryGenerator {
  generate(request: QueryGenerationRequest): Promise<Query>;
}
