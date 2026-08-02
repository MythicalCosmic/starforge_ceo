import { describe, expect, it, vi } from 'vitest';
import {
  refreshWorkspaceStates,
  resolveWorkspaceCoverage,
  spreadsheetCell,
} from './useWorkspaceData.js';

describe('workspace collection coverage', () => {
  const rows = [{ id: 1 }, { id: 2 }];

  it.each([
    ['null', null],
    ['empty text', ''],
    ['non-numeric text', 'unknown'],
    ['whitespace', '   '],
    ['false', false],
    ['true', true],
    ['an array', [2]],
    ['an object', { valueOf: () => 2 }],
    ['negative', -1],
    ['fractional', 2.5],
    ['infinite', Number.POSITIVE_INFINITY],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['less than returned rows', 1],
  ])('keeps coverage unknown when an envelope total is %s', (_, total) => {
    expect(resolveWorkspaceCoverage({ results: rows }, { total }, rows)).toEqual({
      total: null,
      totalKnown: false,
      completeByCount: false,
    });
  });

  it('accepts safe totals but certifies completeness only when every row is loaded', () => {
    expect(resolveWorkspaceCoverage({ results: rows }, { total: 2 }, rows)).toEqual({
      total: 2,
      totalKnown: true,
      completeByCount: true,
    });
    expect(resolveWorkspaceCoverage({ results: rows }, { total: '3' }, rows)).toEqual({
      total: 3,
      totalKnown: true,
      completeByCount: false,
    });
  });

  it('preserves a legitimate zero for a genuinely empty collection', () => {
    expect(resolveWorkspaceCoverage({ results: [], count: 0 }, { total: 0 }, [])).toEqual({
      total: 0,
      totalKnown: true,
      completeByCount: true,
    });
  });

  it('uses an embedded total when no pagination envelope is present', () => {
    expect(resolveWorkspaceCoverage({ results: rows, count: 3 }, null, rows)).toEqual({
      total: 3,
      totalKnown: true,
      completeByCount: false,
    });
  });

  it.each([null, -1, 1, false, 'invalid']) (
    'does not certify an invalid embedded total (%s)',
    (count) => {
      expect(resolveWorkspaceCoverage({ results: rows, count }, null, rows)).toEqual({
        total: null,
        totalKnown: false,
        completeByCount: false,
      });
    },
  );

  it('requires envelope and embedded totals to agree before certifying coverage', () => {
    expect(resolveWorkspaceCoverage({ results: rows, count: 2 }, { total: 3 }, rows)).toEqual({
      total: null,
      totalKnown: false,
      completeByCount: false,
    });
    expect(resolveWorkspaceCoverage({ results: rows, count: 2 }, { total: 2 }, rows)).toEqual({
      total: 2,
      totalKnown: true,
      completeByCount: true,
    });
  });

  it('treats malformed envelope metadata as unknown even if an embedded total looks valid', () => {
    expect(resolveWorkspaceCoverage({ results: rows, count: 2 }, { total: null }, rows)).toEqual({
      total: null,
      totalKnown: false,
      completeByCount: false,
    });
    expect(resolveWorkspaceCoverage({ results: rows, count: 2 }, {}, rows)).toEqual({
      total: null,
      totalKnown: false,
      completeByCount: false,
    });
  });

  it('falls back to returned row count only when no source declares pagination', () => {
    expect(resolveWorkspaceCoverage(rows, null, rows)).toEqual({
      total: 2,
      totalKnown: true,
      completeByCount: true,
    });
  });

  it('does not mistake an aggregate detail metric named total for collection pagination', () => {
    expect(resolveWorkspaceCoverage({ total: 310, with_cohort: 296 }, null, [])).toEqual({
      total: 0,
      totalKnown: true,
      completeByCount: true,
    });
  });
});

describe('spreadsheet export safety', () => {
  it('quotes values and prevents user text from becoming a spreadsheet formula', () => {
    expect(spreadsheetCell('=HYPERLINK("https://example.invalid")'))
      .toBe('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(spreadsheetCell(' +SUM(1,1)')).toBe('"\' +SUM(1,1)"');
    expect(spreadsheetCell('@danger')).toBe('"\'@danger"');
  });

  it('preserves numeric values as numeric cells', () => {
    expect(spreadsheetCell(-1250)).toBe('"-1250"');
    expect(spreadsheetCell(42)).toBe('"42"');
  });
});

describe('workspace refresh scoping', () => {
  it('does not wake disabled compatibility or permission-pruned queries', async () => {
    const active = vi.fn().mockResolvedValue(undefined);
    const dormant = vi.fn().mockResolvedValue(undefined);

    await refreshWorkspaceStates([
      { enabled: true, retry: active },
      { enabled: false, retry: dormant },
      { retry: dormant },
    ]);

    expect(active).toHaveBeenCalledOnce();
    expect(dormant).not.toHaveBeenCalled();
  });
});
