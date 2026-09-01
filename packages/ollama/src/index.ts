import type { ModelProvider, StructuredGenerationRequest, StructuredGenerationResult } from '@agentic-query/core';

export interface OllamaClientLike {
  generateStructured<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>>;
}

export interface OllamaProviderOptions {
  client: OllamaClientLike;
  model: string;
}

/**
 * Thin integration between Agentic Query and an Ollama client implementation.
 * The client owns HTTP/protocol concerns; Agentic Query owns orchestration.
 */
export class OllamaProvider implements ModelProvider {
  readonly model: string;

  constructor(private readonly options: OllamaProviderOptions) {
    this.model = options.model;
  }

  async generateStructured<T>(
    request: Omit<StructuredGenerationRequest, 'model'>
  ): Promise<StructuredGenerationResult<T>> {
    return this.options.client.generateStructured<T>({
      ...request,
      model: this.model
    });
  }
}
