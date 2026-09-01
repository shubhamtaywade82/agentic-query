/**
 * Evaluation framework (plan §10).
 *
 * Golden and adversarial datasets are JSON fixtures evaluated with
 * deterministic metrics: AST exact match, semantic intent accuracy,
 * policy violation rate, repair success rate. Model-dependent cases run
 * against a scripted provider so evaluation is reproducible in CI.
 */
import { QueryValidationError, validateQuery, type Query } from './ast.js';
import type { ModelProvider } from './model.js';
import type { QueryPolicy } from './policy.js';
import { StructuredQueryGenerator } from './query-generator.js';
import { QueryRepairer } from './repair.js';

export interface GoldenCase {
  name: string;
  question: string;
  /** Optional schema context token fed to the scripted provider. */
  schemaContext?: string;
  /** Output the scripted provider returns for this question. */
  modelOutput: unknown;
  expectedQuery?: Query;
  expectedEntities?: readonly string[];
  expectedFilters?: readonly string[];
  expectedSort?: readonly { field: string; direction: 'asc' | 'desc' }[];
  expectedLimit?: number;
  policy?: QueryPolicy;
  /** Policy violation expected (adversarial cases). */
  expectPolicyViolation?: boolean;
  /** Repair scenario: first output is invalid, second is valid. */
  repairOutput?: unknown;
}

export interface GoldenDataset {
  version: string;
  cases: readonly GoldenCase[];
}

export interface EvaluationMetrics {
  total: number;
  astExactMatch: number;
  semanticIntentAccuracy: number;
  policyViolations: number;
  expectedViolations: number;
  repairAttempts: number;
  repairSuccesses: number;
  failures: readonly EvaluationFailure[];
}

export interface EvaluationFailure {
  case: string;
  reason: string;
}

export interface EvaluationOptions {
  /** Requires exact AST equality (default: true). */
  exactMatch?: boolean;
}

function scriptProvider(caseData: GoldenCase): ModelProvider {
  return {
    async generateStructured<T>(request: { messages: readonly { content: string }[] }): Promise<{ output: T; raw?: unknown }> {
      const isRepair = request.messages.some((message) => message.content.includes('Repair the supplied'));
      const output = isRepair && caseData.repairOutput !== undefined ? caseData.repairOutput : caseData.modelOutput;
      return { output: output as T, raw: output };
    }
  };
}

function collectEntities(query: Query): readonly string[] {
  return [query.source.name, ...(query.joins ?? []).map((join) => join.entity.name)];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sameQuery(actual: Query, expected: Query): boolean {
  return stableStringify(actual) === stableStringify(expected);
}

export async function evaluateGoldenDataset(
  dataset: GoldenDataset,
  options: EvaluationOptions = {}
): Promise<EvaluationMetrics> {
  const exactMatch = options.exactMatch ?? true;
  const failures: EvaluationFailure[] = [];
  let astExactMatch = 0;
  let semanticIntentAccuracy = 0;
  let policyViolations = 0;
  let expectedViolations = 0;
  let repairAttempts = 0;
  let repairSuccesses = 0;

  for (const caseData of dataset.cases) {
    const provider = scriptProvider(caseData);
    let query: Query | undefined;
    let violation = false;

    const generator = new StructuredQueryGenerator({ provider });
    try {
      query = await generator.generate({
        question: caseData.question,
        schemaContext: caseData.schemaContext ?? 'orders(id)',
        model: 'eval'
      });
    } catch (error) {
      if (caseData.repairOutput !== undefined) {
        repairAttempts += 1;
        const repairer = new QueryRepairer({ provider, model: 'eval', maxAttempts: 2 });
        try {
          query = await repairer.repair(
            caseData.question,
            caseData.schemaContext ?? 'orders(id)',
            caseData.modelOutput,
            caseData.policy ?? {}
          );
          repairSuccesses += 1;
        } catch {
          failures.push({ case: caseData.name, reason: 'repair failed to produce a valid query' });
          continue;
        }
      } else if (caseData.expectPolicyViolation && error instanceof QueryValidationError) {
        violation = true;
      } else {
        failures.push({ case: caseData.name, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
    }

    if (query !== undefined) {
      try {
        validateQuery(query, caseData.policy ?? {});
      } catch (error) {
        if (caseData.expectPolicyViolation) {
          violation = true;
          query = undefined;
        } else {
          failures.push({ case: caseData.name, reason: `post-generation validation failed: ${error instanceof Error ? error.message : String(error)}` });
          continue;
        }
      }
    }

    if (caseData.expectPolicyViolation) {
      expectedViolations += 1;
      if (violation) continue;
      failures.push({ case: caseData.name, reason: 'expected a policy violation but the query was accepted' });
      continue;
    }

    if (query === undefined) {
      failures.push({ case: caseData.name, reason: 'no query produced' });
      continue;
    }

    if (exactMatch && caseData.expectedQuery && !sameQuery(query, caseData.expectedQuery)) {
      failures.push({ case: caseData.name, reason: 'AST does not exactly match the expected query' });
      continue;
    }
    if (caseData.expectedQuery) astExactMatch += 1;

    let semantic = true;
    if (caseData.expectedEntities) {
      const entities = new Set(collectEntities(query));
      const expectedEntities = new Set(caseData.expectedEntities);
      if (entities.size !== expectedEntities.size || ![...expectedEntities].every((entity) => entities.has(entity))) {
        semantic = false;
      }
    }
    if (caseData.expectedFilters) {
      const filters = new Set((query.filters ?? []).map((filter) => filter.field.field));
      for (const expectedFilter of caseData.expectedFilters) {
        if (!filters.has(expectedFilter)) semantic = false;
      }
    }
    if (caseData.expectedLimit !== undefined && query.limit !== caseData.expectedLimit) {
      semantic = false;
    }
    if (caseData.expectedSort) {
      const actualSort = (query.orderBy ?? []).map((order) => ({ field: order.field.field, direction: order.direction }));
      const expected = [...caseData.expectedSort].sort((l, r) => l.field.localeCompare(r.field));
      const actual = [...actualSort].sort((l, r) => l.field.localeCompare(r.field));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) semantic = false;
    }
    if (semantic) semanticIntentAccuracy += 1;
    else failures.push({ case: caseData.name, reason: 'semantic intent mismatch' });

    if (violation) policyViolations += 1;
  }

  return {
    total: dataset.cases.length,
    astExactMatch,
    semanticIntentAccuracy,
    policyViolations,
    expectedViolations,
    repairAttempts,
    repairSuccesses,
    failures
  };
}

/**
 * Deterministic prompt-injection screening for adversarial evaluation.
 * Flags model outputs that attempt SQL, code, or instruction injection.
 */
export function screenForInjection(text: string): readonly string[] {
  const flags: string[] = [];
  const lowered = text.toLowerCase();
  const patterns: readonly (readonly [string, RegExp])[] = [
    ['sql', /\b(select\s.+\sfrom|insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+table|union\s+select)\b/],
    ['code', /\b(require\(|import\s+|eval\(|exec\(|function\s+\w+\s*\()/],
    ['instruction', /\b(ignore\s+(all\s+)?previous\s+instructions|disregard\s+the\s+(system|policy)|you\s+are\s+now)\b/]
  ];
  for (const [label, pattern] of patterns) {
    if (pattern.test(lowered)) flags.push(label);
  }
  return flags;
}
