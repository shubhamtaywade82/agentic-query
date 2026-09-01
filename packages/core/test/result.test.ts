import { describe, expect, it } from 'vitest';
import {
  capQueryResult,
  normalizeAggregateResult,
  normalizeRowsResult,
  normalizeTupleResult,
  serializeQueryResult
} from '../src/index.js';

describe('result normalization', () => {
  it('normalizes record arrays with deterministic first-seen column order', () => {
    const result = normalizeRowsResult([
      { status: 'completed', id: 2 },
      { id: 1, status: 'pending', extra: 'x' }
    ]);

    expect(result.columns.map((column) => column.name)).toEqual(['status', 'id', 'extra']);
    expect(result.rowCount).toBe(2);
    expect(result.rows[0]).toEqual(['completed', 2, null]);
    expect(result.rows[1]).toEqual(['pending', 1, 'x']);
  });

  it('infers column types and marks nullability', () => {
    const result = normalizeRowsResult([
      { id: 1, note: null, amount: '42.5' },
      { id: 2, note: 'hello', amount: '10' }
    ]);

    const idColumn = result.columns.find((column) => column.name === 'id')!;
    expect(idColumn.type).toBe('number');
    expect(idColumn.nullable).toBe(false);

    const noteColumn = result.columns.find((column) => column.name === 'note')!;
    expect(noteColumn.nullable).toBe(true);
  });

  it('normalizes dates to ISO strings by default and preserves when configured', () => {
    const date = new Date('2025-01-15T00:00:00.000Z');
    const iso = normalizeRowsResult([{ at: date }]);
    expect(iso.rows[0]).toEqual([date.toISOString()]);

    const preserved = normalizeRowsResult([{ at: date }], {}, { dates: 'preserve' });
    expect(preserved.rows[0]).toEqual([date]);

    const epoch = normalizeRowsResult([{ at: date }], {}, { dates: 'epoch' });
    expect(epoch.rows[0]).toEqual([date.getTime()]);
  });

  it('normalizes bigints and decimal-like strings per policy', () => {
    expect(normalizeRowsResult([{ amount: 42n }], {}, { decimals: 'number' }).rows[0]).toEqual([42]);
    expect(normalizeRowsResult([{ amount: 42n }], {}, { decimals: 'string' }).rows[0]).toEqual(['42']);
    expect(normalizeRowsResult([{ amount: '42.5' }], {}, { decimals: 'number' }).rows[0]).toEqual([42.5]);
    // Non-numeric strings are preserved untouched.
    expect(normalizeRowsResult([{ label: '42a' }], {}, { decimals: 'number' }).rows[0]).toEqual(['42a']);
  });

  it('caps rows and sets the truncated flag', () => {
    const result = normalizeRowsResult([{ id: 1 }, { id: 2 }, { id: 3 }], {}, { maxRows: 2 });
    expect(result.rowCount).toBe(2);
    expect(result.metadata.truncated).toBe(true);

    const uncapped = normalizeRowsResult([{ id: 1 }, { id: 2 }], {}, { maxRows: 5 });
    expect(uncapped.metadata.truncated).toBe(false);
  });

  it('capQueryResult bounds already-normalized results', () => {
    const result = normalizeRowsResult([{ id: 1 }, { id: 2 }]);
    const capped = capQueryResult(result, 1);
    expect(capped.rowCount).toBe(1);
    expect(capped.metadata.truncated).toBe(true);
    expect(() => capQueryResult(result, -1)).toThrow();
  });

  it('flattens prisma-style aggregate records', () => {
    const result = normalizeAggregateResult({ _sum: { amount: 300 }, _count: { id: 12 } });
    expect(result.columns.map((column) => column.name).sort()).toEqual(['count_id', 'sum_amount']);
    expect(result.rows[0]).toEqual([300, 12]);
    expect(result.rowCount).toBe(1);
  });

  it('normalizes tuple-shaped results with a known column list', () => {
    const result = normalizeTupleResult(['a', 'b'], [[1, null]]);
    expect(result.columns.map((column) => column.name)).toEqual(['a', 'b']);
    expect(result.rows[0]).toEqual([1, null]);
  });

  it('serializes results with bounded rows and characters', () => {
    const result = normalizeRowsResult(
      Array.from({ length: 120 }, (_, index) => ({ id: index })),
      {},
      {}
    );
    const text = serializeQueryResult(result, { maxRows: 50 });
    expect(text).toContain('70 more rows not shown');
    expect(text).toContain('id');

    const tiny = serializeQueryResult(result, { maxRows: 2, maxChars: 30 });
    expect(tiny).toContain('truncated');
  });
});
