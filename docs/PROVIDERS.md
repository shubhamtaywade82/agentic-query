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

`@agentic-query/ollama` is a hardened integration package. It delegates
Ollama transport to a host-supplied client (such as
`@nemesis-oss/ollama-sdk`) and adds model selection, per-request timeouts,
bounded retry with backoff, usage/token accounting, trace metadata
propagation, capability metadata, fail-closed malformed-output handling
(`OllamaStructuredOutputError`), and normalized provider errors
(`OllamaProviderError`).

```ts
import { OllamaProvider } from '@agentic-query/ollama';

const provider = new OllamaProvider({
  client: yourOllamaClient,   // host-owned transport
  model: 'llama3.1',
  timeoutMs: 30_000,
  maxRetries: 2
});
```

The Ruby implementation follows the same separation with the host
application's Ollama client.

```text
Agentic Query
      |
ModelProvider (timeout, retry, usage, tracing, error normalization)
      |
Ollama adapter
      |
Ollama client SDK (host-owned)
      |
Ollama server
```

## Provider safety

Providers must return structured data that can be validated. The provider itself does not receive database authorization privileges.

Do not place database credentials in model-provider configuration.

## Adding another provider

Implement `ModelProvider`, add provider-specific tests, and verify malformed/hostile structured output is rejected by the core validator. Provider-specific capabilities should remain optional and should not leak into the core Query AST contract.
