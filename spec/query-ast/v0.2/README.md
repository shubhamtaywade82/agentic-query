# Query AST v0.2

v0.2 adds semantic references alongside physical field references.

A semantic reference identifies a business metric or dimension by stable name. Resolution is performed by trusted application code before ORM compilation.

Example:

```json
{
  "source": { "name": "orders" },
  "select": [
    { "semantic": { "kind": "metric", "name": "revenue" }, "alias": "revenue" }
  ]
}
```

The LLM may propose semantic names, but the semantic catalog decides whether they exist and how they resolve.
