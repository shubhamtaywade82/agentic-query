/**
 * Deterministic result normalization (plan §9).
 *
 * Adapter-specific results are converted into a language-neutral
 * `QueryResult` before synthesis or evaluation. Normalization is
 * deterministic: column order, null handling, decimal/date policy and
 * row capping are all explicit.
 */

export type ResultColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'decimal'
  | 'json'
  | 'null'
  | 'unknown';

export interface ResultColumn {
  name: string;
  type?: ResultColumnType | undefined;
  nullable?: boolean | undefined;
}

export interface ResultMetadata {
  rowCount: number;
  durationMs?: number | undefined;
  source?: string | undefined;
  queryId?: string | undefined;
  repairAttempts?: number | undefined;
  truncated?: boolean | undefined;
}

export interface QueryResult {
  columns: readonly ResultColumn[];
  rows: readonly unknown[][];
  rowCount: number;
  metadata: ResultMetadata;
}

export interface NormalizationOptions {
  /**
   * Decimal normalization policy: `number` converts BigInt/decimal-like
   * strings to Number, `string` keeps the textual form, `preserve` keeps
   * the raw value. Default: `preserve`.
   */
  decimals?: 'number' | 'string' | 'preserve';
  /**
   * Date normalization policy: `iso` renders Date values as ISO-8601
   * strings, `epoch` as milliseconds since epoch, `preserve` keeps the
   * Date object. Default: `iso`.
   */
  dates?: 'iso' | 'epoch' | 'preserve';
  /** Maximum rows materialized; extra rows are dropped and `truncated` set. */
  maxRows?: number;
}

function inferType(value: unknown): ResultColumnType {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value instanceof Date) return 'date';
  if (typeof value === 'bigint') return 'decimal';
  if (typeof value === 'object') return 'json';
  return 'unknown';
}

function normalizeValue(value: unknown, options: NormalizationOptions): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (options.dates === 'preserve') return value;
    if (options.dates === 'epoch') return value.getTime();
    return value.toISOString();
  }
  if (typeof value === 'bigint') {
    if (options.decimals === 'string') return value.toString();
    if (options.decimals === 'number') return Number(value);
    return value;
  }
  if (options.decimals === 'number' && typeof value === 'string' && value !== '' && !Number.isNaN(Number(value)) && /^-?\d+(\.\d+)?$/.test(value)) {
    // Only convert strings that look like bare decimal literals.
    return Number(value);
  }
  return value;
}

/**
 * Normalizes array-of-records results (Prisma `findMany`, Drizzle `.select()`,
 * ActiveRecord `to_a` style rows). Column order is the first-seen order of
 * keys across records — deterministic and independent of row ordering.
 */
export function normalizeRowsResult(
  records: readonly Record<string, unknown>[],
  metadata: Omit<ResultMetadata, 'rowCount' | 'truncated'> = {},
  options: NormalizationOptions = {}
): QueryResult {
  const columnOrder: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record ?? {})) {
      if (!seen.has(key)) {
        seen.add(key);
        columnOrder.push(key);
      }
    }
  }

  const boundedRows = options.maxRows !== undefined ? records.slice(0, Math.max(0, options.maxRows)) : records;

  // Column inference: type from the first non-null value; nullable when any
  // observed value was null (or when no rows exist).
  const columns: ResultColumn[] = columnOrder.map((name) => {
    let sawNull = false;
    let type: ResultColumnType | undefined;
    for (const record of boundedRows) {
      const value = (record ?? {})[name];
      if (value === null || value === undefined) {
        sawNull = true;
        continue;
      }
      if (type === undefined) type = inferType(value);
    }
    const resolvedType: ResultColumnType = type ?? (boundedRows.length > 0 ? 'null' : 'unknown');
    return { name, type: resolvedType, nullable: sawNull || boundedRows.length === 0 };
  });

  const rows = boundedRows.map((record) => columnOrder.map((name) => normalizeValue((record ?? {})[name], options)));
  return {
    columns,
    rows,
    rowCount: rows.length,
    metadata: {
      ...metadata,
      rowCount: rows.length,
      truncated: options.maxRows !== undefined && records.length > boundedRows.length
    }
  };
}

/**
 * Normalizes a single aggregate record (Prisma `aggregate` result such as
 * `{ _sum: { amount: 100 } }`). Nested aggregate groups are flattened into
 * `<aggregate>_<field>` column names.
 */
export function normalizeAggregateResult(
  aggregate: Record<string, unknown>,
  metadata: Omit<ResultMetadata, 'rowCount' | 'truncated'> = {},
  options: NormalizationOptions = {}
): QueryResult {
  const columns: ResultColumn[] = [];
  const row: unknown[] = [];

  for (const [key, value] of Object.entries(aggregate ?? {})) {
    if (value !== null && typeof value === 'object') {
      for (const [field, fieldValue] of Object.entries(value as Record<string, unknown>)) {
        columns.push({ name: `${key.replace(/^_/, '')}_${field}`, type: inferType(fieldValue), nullable: true });
        row.push(normalizeValue(fieldValue, options));
      }
    } else {
      columns.push({ name: key, type: inferType(value), nullable: true });
      row.push(normalizeValue(value, options));
    }
  }

  return {
    columns,
    rows: row.length > 0 ? [row] : [],
    rowCount: row.length > 0 ? 1 : 0,
    metadata: { ...metadata, rowCount: row.length > 0 ? 1 : 0 }
  };
}

/** Normalizes already-tuple-shaped results with a known column list. */
export function normalizeTupleResult(
  columns: readonly string[],
  rows: readonly unknown[][],
  metadata: Omit<ResultMetadata, 'rowCount' | 'truncated'> = {},
  options: NormalizationOptions = {}
): QueryResult {
  const normalizedRows = rows.map((row) => columns.map((_, index) => normalizeValue(row?.[index], options)));
  const boundedRows = options.maxRows !== undefined ? normalizedRows.slice(0, Math.max(0, options.maxRows)) : normalizedRows;
  return {
    columns: columns.map((name) => ({ name, nullable: true })),
    rows: boundedRows,
    rowCount: boundedRows.length,
    metadata: {
      ...metadata,
      rowCount: boundedRows.length,
      truncated: options.maxRows !== undefined && normalizedRows.length > boundedRows.length
    }
  };
}

/** Bounded materialization guard applied post-execution. */
export function capQueryResult(result: QueryResult, maxRows: number): QueryResult {
  if (!Number.isSafeInteger(maxRows) || maxRows < 0) {
    throw new Error('maxRows must be a non-negative integer');
  }
  if (result.rows.length <= maxRows) return result;
  return {
    ...result,
    rows: result.rows.slice(0, maxRows),
    rowCount: maxRows,
    metadata: { ...result.metadata, rowCount: maxRows, truncated: true }
  };
}

/** Stable, bounded text serialization used for synthesis prompts. */
export function serializeQueryResult(result: QueryResult, options: { maxRows?: number; maxChars?: number } = {}): string {
  const maxRows = options.maxRows ?? 50;
  const maxChars = options.maxChars ?? 8000;
  const header = result.columns.map((column) => column.name).join(' | ');
  const shown = result.rows.slice(0, maxRows);
  const lines = shown.map((row) => row.map((value) => (value === null ? 'null' : String(value))).join(' | '));
  const truncatedNote =
    result.rows.length > maxRows ? `\n(${result.rows.length - maxRows} more rows not shown; total ${result.rowCount})` : '';
  const body = [header, ...lines, truncatedNote.trim()].filter(Boolean).join('\n');
  return body.length > maxChars ? `${body.slice(0, maxChars)}\n(output truncated)` : body;
}
