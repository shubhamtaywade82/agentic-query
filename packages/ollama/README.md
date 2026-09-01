# @agentic-query/ollama

Ollama model-provider adapter for Agentic Query.

This package intentionally stays thin: Ollama protocol/client functionality belongs in `@nemesis-oss/ollama-sdk`; Agentic Query owns planning, query contracts, policy enforcement, and orchestration.

## Example

```ts
import { OllamaProvider } from '@agentic-query/ollama';

const provider = new OllamaProvider({
  model: 'gemma4:31b'
});
```
