# Contributing

## Development principles

1. Keep the core query contract deterministic and language-neutral.
2. Treat model output as untrusted input.
3. Put authorization and execution limits outside the LLM.
4. Prefer small, testable adapters over framework-specific logic in core.
5. Add regression tests for every security-sensitive behavior.

## Pull requests

Every change should include appropriate tests and a clear explanation of compatibility impact. Breaking changes must be called out explicitly.
