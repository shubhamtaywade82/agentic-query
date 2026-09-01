# Release Guide

Agentic Query is released as native packages for each ecosystem while sharing one product version during the early lifecycle.

## Versioning

Use Semantic Versioning:

- `MAJOR` — breaking API or protocol changes;
- `MINOR` — backward-compatible features;
- `PATCH` — backward-compatible fixes.

During `0.x`, breaking changes may occur between minor releases. Stabilization happens at `1.0.0`.

## Release units

The initial product line is:

```text
@agentic-query/core
@agentic-query/prisma
@agentic-query/drizzle
@agentic-query/ollama
agentic_query
```

Keep versions aligned while the protocol is still evolving.

## Release flow

```text
main
  |
  v
version/tag
  |
GitHub Actions
  |
  +--> npm
  +--> RubyGems
  +--> GitHub Release
```

## Trusted publishing

Use GitHub Actions OIDC/Trusted Publishing for npm and RubyGems rather than long-lived registry tokens where supported. Configure a protected GitHub `release` environment for publication jobs.

## Pre-release checklist

- CI passes;
- package builds succeed;
- shared conformance tests pass;
- security tests pass;
- changelog updated;
- package versions match the Git tag;
- generated package contents are inspected;
- release notes identify breaking changes.

## Provenance

Public npm packages should publish with provenance enabled when the registry/workflow supports it. Release artifacts should be traceable to a Git commit/tag and workflow run.

## Publishing policy

Do not publish experimental packages merely because they compile. A package should have documentation, tests, a stable public API for its advertised scope, and explicit compatibility notes.
