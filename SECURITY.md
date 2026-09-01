# Security Policy

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Use GitHub's private security advisory mechanism for this repository when available. Include reproduction steps, affected versions, impact, and relevant mitigation information.

## Security principles

Agentic Query treats model-generated output as untrusted input. The runtime is expected to enforce explicit entity and operation permissions, field-level access policies, tenant and row-level restrictions, query limits and execution timeouts, deterministic validation before execution, and read-only database roles for read-oriented agents.

Prompt instructions are not a security boundary.
