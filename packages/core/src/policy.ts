/**
 * Application-owned, immutable-during-execution query policy.
 *
 * The policy is the authorization boundary. It is supplied by trusted
 * application code, never derived from model output, and it is enforced
 * immediately before adapter compilation (see `validateQuery`).
 */
import {
  AGGREGATES,
  COMPARISON_OPERATORS,
  JOIN_TYPES,
  QueryValidationError,
  type Aggregate,
  type ComparisonOperator,
  type Filter,
  type JoinType
} from './ast.js';

export interface QueryPolicy {
  /** Entities allowed as query source or join target. */
  allowedEntities?: readonly string[] | undefined;
  /** Fields that must never be projected, filtered, sorted, or joined on. */
  deniedFields?: Readonly<Record<string, readonly string[]>> | undefined;
  /** Hard ceiling on returned rows. */
  maxRows?: number | undefined;
  /** Ceiling on the deterministic complexity score. */
  maxComplexity?: number | undefined;
  /** Filter operators the deployment is willing to compile. */
  allowedOperators?: readonly ComparisonOperator[] | undefined;
  /** Aggregates the deployment is willing to compile. */
  allowedAggregates?: readonly Aggregate[] | undefined;
  /** Join types the deployment is willing to compile. */
  allowedJoinTypes?: readonly JoinType[] | undefined;
  /** Per-query execution timeout handed to adapters/providers. */
  timeoutMs?: number | undefined;
  /**
   * Trusted filters (tenant scopes, row constraints) that adapters MUST
   * AND into the compiled predicate. The AST can never remove them because
   * they are injected during compilation, not modeled in the query.
   */
  forcedFilters?: Readonly<Record<string, readonly Filter[]>> | undefined;
  /** Database capability restrictions, e.g. `['read', 'aggregate']`. */
  allowedCapabilities?: readonly string[] | undefined;
}

const CAPABILITY_WHITELIST: readonly string[] = [
  'read',
  'filter',
  'order',
  'paginate',
  'aggregate',
  'groupBy',
  'having',
  'join',
  'relationRead'
];

/** Validates the policy object itself; a malformed policy fails closed. */
export function validatePolicy(policy: QueryPolicy): void {
  if (!policy || typeof policy !== 'object') {
    throw new QueryValidationError('Policy must be an object');
  }
  if (policy.maxRows !== undefined && (!Number.isSafeInteger(policy.maxRows) || policy.maxRows <= 0)) {
    throw new QueryValidationError('Policy maxRows must be a positive integer');
  }
  if (policy.maxComplexity !== undefined && (!Number.isSafeInteger(policy.maxComplexity) || policy.maxComplexity <= 0)) {
    throw new QueryValidationError('Policy maxComplexity must be a positive integer');
  }
  if (policy.timeoutMs !== undefined && (!Number.isSafeInteger(policy.timeoutMs) || policy.timeoutMs <= 0)) {
    throw new QueryValidationError('Policy timeoutMs must be a positive integer');
  }
  if (policy.allowedEntities !== undefined) {
    if (!Array.isArray(policy.allowedEntities) || policy.allowedEntities.some((entity) => typeof entity !== 'string' || entity.length === 0)) {
      throw new QueryValidationError('Policy allowedEntities must be a list of non-empty strings');
    }
  }
  if (policy.allowedOperators !== undefined) {
    for (const operator of policy.allowedOperators) {
      if (!COMPARISON_OPERATORS.includes(operator)) throw new QueryValidationError(`Policy allowedOperators contains an unknown operator: ${operator}`);
    }
  }
  if (policy.allowedAggregates !== undefined) {
    for (const aggregate of policy.allowedAggregates) {
      if (!AGGREGATES.includes(aggregate)) throw new QueryValidationError(`Policy allowedAggregates contains an unknown aggregate: ${aggregate}`);
    }
  }
  if (policy.allowedJoinTypes !== undefined) {
    for (const joinType of policy.allowedJoinTypes) {
      if (!JOIN_TYPES.includes(joinType)) throw new QueryValidationError(`Policy allowedJoinTypes contains an unknown join type: ${joinType}`);
    }
  }
  if (policy.allowedCapabilities !== undefined) {
    for (const capability of policy.allowedCapabilities) {
      if (!CAPABILITY_WHITELIST.includes(capability)) throw new QueryValidationError(`Policy allowedCapabilities contains an unknown capability: ${capability}`);
    }
  }
  if (policy.forcedFilters !== undefined) {
    for (const [entity, filters] of Object.entries(policy.forcedFilters)) {
      if (typeof entity !== 'string' || entity.length === 0) {
        throw new QueryValidationError('Policy forcedFilters entity keys must be non-empty strings');
      }
      if (!Array.isArray(filters)) {
        throw new QueryValidationError(`Policy forcedFilters for ${entity} must be a list`);
      }
      for (const filter of filters) {
        if (!filter || typeof filter !== 'object' || typeof filter.field !== 'object' || typeof filter.field?.field !== 'string') {
          throw new QueryValidationError(`Policy forcedFilters for ${entity} contains an invalid filter`);
        }
      }
    }
  }
}

/** Returns the trusted filters that must apply to a given entity. */
export function forcedFiltersFor(policy: QueryPolicy, entity: string): readonly Filter[] {
  return policy.forcedFilters?.[entity] ?? [];
}

/** Whether a capability is permitted (undefined capability list = allowed). */
export function capabilityAllowed(policy: QueryPolicy, capability: string): boolean {
  return policy.allowedCapabilities === undefined || policy.allowedCapabilities.includes(capability);
}

/**
 * Merge a base policy (application defaults) with a per-request overlay.
 * The overlay may only narrow permissions; widening values are ignored so
 * a caller can never escalate privileges above the base policy.
 */
export function mergePolicies(base: QueryPolicy, overlay: QueryPolicy): QueryPolicy {
  const intersect = <T>(a?: readonly T[], b?: readonly T[]): readonly T[] | undefined =>
    a === undefined ? b : b === undefined ? a : a.filter((item) => b.includes(item));

  const minOf = (a?: number, b?: number): number | undefined => {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return Math.min(a, b);
  };

  const merged: QueryPolicy = {};
  const assignDefined = <K extends keyof QueryPolicy>(key: K, value: QueryPolicy[K]): void => {
    if (value !== undefined) merged[key] = value;
  };

  assignDefined('allowedEntities', intersect(base.allowedEntities, overlay.allowedEntities));
  assignDefined('allowedOperators', intersect(base.allowedOperators, overlay.allowedOperators));
  assignDefined('allowedAggregates', intersect(base.allowedAggregates, overlay.allowedAggregates));
  assignDefined('allowedJoinTypes', intersect(base.allowedJoinTypes, overlay.allowedJoinTypes));
  assignDefined('allowedCapabilities', intersect(base.allowedCapabilities, overlay.allowedCapabilities));
  assignDefined('maxRows', minOf(base.maxRows, overlay.maxRows));
  assignDefined('maxComplexity', minOf(base.maxComplexity, overlay.maxComplexity));
  assignDefined('timeoutMs', minOf(base.timeoutMs, overlay.timeoutMs));

  const denied: Record<string, readonly string[]> = {};
  for (const source of [base, overlay] as const) {
    for (const [entity, fields] of Object.entries(source.deniedFields ?? {})) {
      denied[entity] = [...(denied[entity] ?? []), ...fields];
    }
  }
  if (Object.keys(denied).length > 0) {
    merged.deniedFields = Object.fromEntries(
      Object.entries(denied).map(([entity, fields]) => [entity, [...new Set(fields)]])
    );
  }

  const forced: Record<string, readonly Filter[]> = { ...(base.forcedFilters ?? {}) };
  for (const [entity, filters] of Object.entries(overlay.forcedFilters ?? {})) {
    forced[entity] = [...(forced[entity] ?? []), ...filters];
  }
  if (Object.keys(forced).length > 0) merged.forcedFilters = forced;

  return merged;
}
