# @agentic-query/ollama

Ollama model-provider adapter for Agentic Query.

This package intentionally stays thin at the transport layer: Ollama
protocol/client functionality belongs in a host-supplied client such as
`@nemesis-oss/ollama-sdk`; Agentic Query owns planning, query contracts,
policy enforcement, and orchestration.

On top of the host client, the provider adds:

- model selection and capability metadata;
- per-request timeouts (default 30 s, overridable per request);
- bounded retry with exponential backoff on transient failures;
- usage/token accounting when the client reports it;
- trace metadata propagation (`requestId`, `provider`, `model`);
- fail-closed malformed structured-output handling;
- normalized provider errors (`OllamaProviderError`).

## Example

```ts
import { OllamaProvider } from '@agentic-query/ollama';

const provider = new OllamaProvider({
  client: yourOllamaClient, // implements generateStructured(request)
  model: 'llama3.1',
  timeoutMs: 30_000,
  maxRetries: 2
});
```

The client must implement:

```ts
interface OllamaClientLike {
  generateStructured<T>(
    request: StructuredGenerationRequest
  ): Promise<StructuredGenerationResult<T>>;
}
```
