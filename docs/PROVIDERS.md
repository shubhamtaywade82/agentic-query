# Model Provider Guide

Agentic Query uses a provider abstraction so model transport stays independent from query planning and execution.

## Provider contract

```ts
interface ModelProvider {
  generateStructured<T>(
    request: StructuredGenerationRequest
  ): Promise<StructuredGenerationResult<T>>;
}
```

The provider is responsible for communicating with the model and returning structured output. Agentic Query is responsible for validating and using that output.

## Ollama

`@agentic-query/ollama` is a thin integration package. It should delegate Ollama transport to an existing Ollama client such as `@nemesis-oss/ollama-sdk` rather than duplicating the Ollama protocol implementation.

The Ruby implementation should follow the same separation with the host application's Ollama client.

```text
Agentic Query
      |
ModelProvider
      |
Ollama adapter
      |
Ollama client SDK
      |
Ollama server
```

## Provider safety

Providers must return structured data that can be validated. The provider itself does not receive database authorization privileges.

Do not place database credentials in model-provider configuration.

## Adding another provider

Implement `ModelProvider`, add provider-specific tests, and verify malformed/hostile structured output is rejected by the core validator. Provider-specific capabilities should remain optional and should not leak into the core Query AST contract.
