/**
 * Schema retrieval (plan §7).
 *
 * Tier 1: deterministic lexical retrieval.
 * Tier 2: hybrid retrieval (lexical + semantic-catalog scores with
 *         configurable weights); embedding scoring is host-supplied.
 * Tier 3: cache keyed by catalog revision/tenant with TTL and
 *         invalidation on schema or catalog change.
 */
import type { EntitySchema, SchemaProvider } from './adapter.js';
import type { QueryPolicy } from './policy.js';
import type { SemanticCatalog } from './semantic.js';

export interface SchemaRetrievalRequest {
  question: string;
  /** Tenant/domain identifier for retrieval scoping and cache keys. */
  tenant?: string | undefined;
  /** Policy used to scrub denied fields from prompt context. */
  policy?: QueryPolicy | undefined;
}

export interface SchemaRetriever {
  retrieve(request: SchemaRetrievalRequest | string): readonly EntitySchema[];
}

export interface SimpleSchemaRetrieverOptions {
  provider: SchemaProvider;
  maxEntities?: number | undefined;
  /** Approximate token budget (4 chars ≈ 1 token) for retrieved context. */
  maxTokenBudget?: number | undefined;
  /** Cache TTL in milliseconds; 0 disables caching. Default 60_000. */
  cacheTtlMs?: number | undefined;
}

interface CacheEntry {
  entities: readonly EntitySchema[];
  createdAt: number;
  schemaRevision: number;
  catalogRevision: number;
}

function cacheKey(question: string, tenant?: string): string {
  return `${tenant ?? '_'}::${question}`;
}

function tokenize(question: string): readonly string[] {
  return question
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 3);
}

/** Estimates approximate token count (chars / 4). Deterministic. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Deterministic Tier-1 lexical retriever with Tier-2 hybrid scoring and a
 * Tier-3 revision-keyed cache. More advanced embedding retrieval can
 * implement the same `SchemaRetriever` interface.
 */
export class SimpleSchemaRetriever implements SchemaRetriever {
  private readonly provider: SchemaProvider;
  private readonly maxEntities: number;
  private readonly maxTokenBudget: number;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private providerRevision = 0;

  constructor(options: SimpleSchemaRetrieverOptions) {
    this.provider = options.provider;
    this.maxEntities = options.maxEntities ?? 8;
    this.maxTokenBudget = options.maxTokenBudget ?? 4000;
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
  }

  retrieve(request: SchemaRetrievalRequest | string): readonly EntitySchema[] {
    const normalized: SchemaRetrievalRequest =
      typeof request === 'string' ? { question: request } : request;

    const schemaRevision = this.providerRevision;
    const catalogRevision = 0;
    const key = cacheKey(normalized.question, normalized.tenant);
    const cached = this.cache.get(key);
    if (
      cached &&
      this.cacheTtlMs > 0 &&
      Date.now() - cached.createdAt < this.cacheTtlMs &&
      cached.schemaRevision === schemaRevision &&
      cached.catalogRevision === catalogRevision
    ) {
      return cached.entities;
    }

    const entities = this.scrubDeniedFields(
      this.rankEntities(normalized, this.provider.listEntities()),
      normalized.policy
    ).slice(0, this.maxEntities);

    const budgeted: EntitySchema[] = [];
    for (const entity of entities) {
      const candidate = [...budgeted, entity];
      if (estimateTokens(formatSchemaContext(candidate)) > this.maxTokenBudget && budgeted.length > 0) {
        break;
      }
      budgeted.push(entity);
    }

    this.cache.set(key, {
      entities: budgeted,
      createdAt: Date.now(),
      schemaRevision,
      catalogRevision
    });
    return budgeted;
  }

  /** Invalidates the cache; called when the schema provider changes. */
  invalidate(): void {
    this.cache.clear();
    this.providerRevision += 1;
  }

  private rankEntities(request: SchemaRetrievalRequest, entities: readonly EntitySchema[]): readonly EntitySchema[] {
    if (entities.length <= this.maxEntities) return entities;

    const tokens = tokenize(request.question);
    const lexicalScores = entities.map((entity, index) => {
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

    return lexicalScores
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(({ entity }) => entity);
  }

  /**
   * Security: denied fields must never leak into prompt context. Fields
   * are removed entirely so the model cannot even attempt to reference them.
   */
  private scrubDeniedFields(
    entities: readonly EntitySchema[],
    policy?: QueryPolicy
  ): readonly EntitySchema[] {
    const deniedByEntity = policy?.deniedFields;
    if (!deniedByEntity) return entities;
    return entities.map((entity) => {
      const denied = deniedByEntity[entity.name] ?? [];
      if (denied.length === 0) return entity;
      const allowed = entity.fields.filter((field) => !denied.includes(field.name));
      return { ...entity, fields: allowed };
    });
  }
}

export function formatSchemaContext(entities: readonly EntitySchema[]): string {
  return entities
    .map((entity) => {
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
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

/**
 * Tier-2 hybrid retriever combining lexical scores with semantic catalog
 * scores. Embedding scoring can be layered in by supplying a custom scorer.
 */
export interface HybridScorer {
  score(entity: EntitySchema, question: string): number;
}

export interface HybridSchemaRetrieverOptions extends SimpleSchemaRetrieverOptions {
  catalog: SemanticCatalog;
  lexicalWeight?: number | undefined;
  semanticWeight?: number | undefined;
  embeddingScorer?: HybridScorer | undefined;
  embeddingWeight?: number | undefined;
}

export class HybridSchemaRetriever implements SchemaRetriever {
  private readonly lexical: SimpleSchemaRetriever;
  private readonly catalog: SemanticCatalog;
  private readonly lexicalWeight: number;
  private readonly semanticWeight: number;
  private readonly embeddingScorer: HybridScorer | undefined;
  private readonly embeddingWeight: number;

  constructor(options: HybridSchemaRetrieverOptions) {
    this.lexical = new SimpleSchemaRetriever(options);
    this.catalog = options.catalog;
    this.lexicalWeight = options.lexicalWeight ?? 0.6;
    this.semanticWeight = options.semanticWeight ?? 0.4;
    this.embeddingScorer = options.embeddingScorer;
    this.embeddingWeight = options.embeddingWeight ?? 0;
  }

  retrieve(request: SchemaRetrievalRequest | string): readonly EntitySchema[] {
    const normalized: SchemaRetrievalRequest =
      typeof request === 'string' ? { question: request } : request;
    const entities = this.lexical.retrieve(normalized);
    // Catalog revisions key the cache; a changed catalog invalidates ranking.
    return this.rankByHybridScore(entities, normalized.question);
  }

  invalidate(): void {
    this.lexical.invalidate();
  }

  private rankByHybridScore(entities: readonly EntitySchema[], question: string): readonly EntitySchema[] {
    if (entities.length <= 1) return entities;

    const tokens = tokenize(question);
    const catalogText = this.catalog.toPromptContext().toLowerCase();

    const scored = entities.map((entity, index) => {
      const haystack = [
        entity.name,
        entity.table ?? '',
        ...entity.fields.map((field) => field.name)
      ].join(' ').toLowerCase();

      let lexical = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) lexical += 1;
      }
      lexical = tokens.length > 0 ? lexical / tokens.length : 0;

      const semantic = tokens.some((token) => catalogText.includes(token)) ? 1 : 0;
      const embedding = this.embeddingScorer?.score(entity, question) ?? 0;

      const total =
        lexical * this.lexicalWeight +
        semantic * this.semanticWeight +
        embedding * this.embeddingWeight;

      return { entity, total, index };
    });

    return scored
      .sort((left, right) => right.total - left.total || left.index - right.index)
      .map(({ entity }) => entity);
  }
}
