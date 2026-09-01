# @agentic-query/drizzle

Drizzle adapter boundary for Agentic Query.

The adapter intentionally accepts application-owned compile and execute functions. Agentic Query validates the Query AST before the adapter is invoked; the adapter does not evaluate model-generated code or raw SQL.

For a production integration, keep Drizzle table/schema objects inside the host application's compiler function and enforce any database-native authorization at the application/database boundary.
