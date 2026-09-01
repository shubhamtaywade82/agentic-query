import type { EntitySchema, SchemaProvider } from './adapter.js';

export interface SchemaRetriever {
  retrieve(question: string): readonly EntitySchema[];
}

export interface SimpleSchemaRetrieverOptions {
  provider: SchemaProvider;
  maxEntities?: number;
}

/**
 * Deterministic baseline retriever. Scores entities using lexical tokens from
 * the user question and falls back to the first registered entities.
 * More advanced embedding/hybrid retrieval can implement the same interface.
 */
export class SimpleSchemaRetriever implements SchemaRetriever {
  private readonly provider: SchemaProvider;
  private readonly maxEntities: number;

  constructor(options: SimpleSchemaRetrieverOptions) {
    this.provider = options.provider;
    this.maxEntities = options.maxEntities ?? 8;
  }

  retrieve(question: string): readonly EntitySchema[] {
    const entities = this.provider.listEntities();
    if (entities.length <= this.maxEntities) return entities;

    const tokens = new Set(
      question
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((token) => token.length >= 3)
    );

    const scored = entities.map((entity, index) => {
      const haystack = [
        entity.name,
        entity.table ?? '',
        ...entity.fields.map((field) => field.name),
        ...entity.relations.map((relation) => relation.name),
        ...entity.relations.map((relation) => relation.target)
      ].join(' ').toLowerCase();

      let score = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) score += entity.name.toLowerCase() === token ? 3 : 1;
      }

      return { entity, score, index };
    });

    return scored
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, this.maxEntities)
      .map(({ entity }) => entity);
  }
}

export function formatSchemaContext(entities: readonly EntitySchema[]): string {
  return entities.map((entity) => {
    const fields = entity.fields
      .map((field) => `${field.name}: ${field.type}${field.nullable ? ' nullable' : ''}`)
      .join(', ');
    const relations = entity.relations
      .map((relation) => `${relation.name} -> ${relation.target}${relation.type ? ` (${relation.type})` : ''}`)
      .join(', ');

    return [
      `Entity: ${entity.name}`,
      entity.table ? `Table: ${entity.table}` : '',
      entity.primaryKey ? `Primary key: ${entity.primaryKey}` : '',
      `Fields: ${fields}`,
      relations ? `Relations: ${relations}` : ''
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}
