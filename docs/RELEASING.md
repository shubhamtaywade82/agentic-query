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

Release publishing uses GitHub Actions OIDC/Trusted Publishing for npm and
RubyGems rather than long-lived registry tokens where supported. Publication
jobs run inside protected GitHub environments (`npm-publish`,
`rubygems-publish`) configured with required reviewers.

## Release pipeline

The automated pipeline (`.github/workflows/release.yml`) is:

```text
tag v*.*.*
  -> verify: pnpm check + Ruby RSpec + version/tag equality
  -> dry-run: pack tarballs, verify contents, build gem, verify contents
  -> publish npm (OIDC, --provenance) + verify packages resolve
  -> publish RubyGems
  -> verify CHANGELOG entry
  -> GitHub release with generated notes
```

`workflow_dispatch` runs default to dry-run mode: artifacts are built and
verified but nothing is published, which satisfies the publication-rehearsal
requirement without registry side effects.

## Pre-release checklist

- CI passes;
- package builds succeed;
- shared conformance tests pass;
- security tests pass;
- changelog updated;
- package versions match the Git tag (enforced by `scripts/check-release.mjs`
  across npm packages, the gemspec, the Ruby `VERSION` constant, and the
  CHANGELOG);
- generated package contents are inspected (the dry-run job verifies every
  npm tarball contains `dist/index.js` and the gem ships `agentic_query.rb`
  and `version.rb`);
- release notes identify breaking changes.

## Provenance

npm packages publish with `--provenance` so artifacts are traceable to the
Git commit, tag, and workflow run. Release artifacts should be traceable to
a Git commit/tag and workflow run.

## Publishing policy

Do not publish experimental packages merely because they compile. A package should have documentation, tests, a stable public API for its advertised scope, and explicit compatibility notes.
