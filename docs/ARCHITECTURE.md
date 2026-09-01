# Architecture

Agentic Query is an ORM-native AI query runtime. Its central design principle is that model output is untrusted input and database execution is controlled by trusted application code.

## Runtime

```text
User question
     |
     v
Schema Retriever ---- Semantic Catalog
     |                      |
     +----------+-----------+
                v
        Structured Query Generator
                |
                v
          Semantic Query AST
                |
                v
       Semantic Resolution
                |
                v
          Physical Query AST
                |
                v
          Policy Validation
                |
        +-------+-------+
        |               |
      valid           invalid
        |               |
        |         bounded repair
        |               |
        +-------+-------+
                v
            ORM Adapter
                |
                v
             Database
```

## Contracts

### Query AST

The language-neutral representation of database intent. It is designed to be consumed by adapters and validated independently from any model provider.

### Semantic Catalog

Maps business concepts such as `revenue` or `active_customer` to trusted definitions. The model can request a semantic name; only the catalog decides how that concept resolves to physical fields or expressions.

### Policy

Authorization and execution constraints live outside the model prompt. Policies can restrict entities, fields, rows, tenants, and execution resources.

### Model Provider

A provider supplies structured model generation. Ollama is one provider; other providers can implement the same interface without changing query or policy logic.

### Query Adapter

An adapter translates the validated physical Query AST into native ORM operations. Current targets are ActiveRecord, Prisma, and Drizzle.

## Trust boundaries

1. Model output is untrusted.
2. AST validation is deterministic.
3. Semantic resolution is application-owned.
4. Policy enforcement is application-owned.
5. ORM compilation is trusted code.
6. Database credentials and permissions remain controlled by the host application.

Prompt instructions are not treated as a security boundary.

## Package model

```text
@agentic-query/core
    |
    +-- @agentic-query/prisma
    +-- @agentic-query/drizzle
    +-- @agentic-query/ollama

agentic_query (Ruby)
    |
    +-- ActiveRecord adapter
    +-- Ruby model providers
```

Ruby and TypeScript share protocol semantics, not implementation dependencies.
