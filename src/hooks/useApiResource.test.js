import { describe, expect, it } from 'vitest';
import { normalizeApiCollection } from './useApiResource.js';

describe('normalizeApiCollection', () => {
  it('normalizes the canonical StarForge success envelope metadata', () => {
    const normalized = normalizeApiCollection(
      {
        data: [{ id: 1 }, { id: 2 }],
        pagination: {
          total: 7,
          page: 2,
          page_size: 2,
          pages: 4,
          has_next: true,
          has_prev: true,
        },
      },
      2,
      25,
    );

    expect(normalized.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(normalized.pagination).toMatchObject({
      total: 7,
      page: 2,
      pageSize: 2,
      pages: 4,
      hasNext: true,
      hasPrevious: true,
    });
  });

  it('normalizes DRF and cursor notification feeds without dropping cursors', () => {
    const normalized = normalizeApiCollection(
      {
        data: {
          count: 51,
          next: 'https://tenant.example/api/v1/notifications/?cursor=next-token',
          previous: 'https://tenant.example/api/v1/notifications/?cursor=prev-token',
          results: [{ id: 9 }],
        },
      },
      1,
      25,
    );

    expect(normalized.items).toEqual([{ id: 9 }]);
    expect(normalized.pagination).toMatchObject({
      total: 51,
      hasNext: true,
      hasPrevious: true,
      nextCursor: 'next-token',
      previousCursor: 'prev-token',
    });
  });

  it('normalizes the intelligence nested-results pagination contract', () => {
    const normalized = normalizeApiCollection(
      {
        data: {
          count: 29,
          results: [{ student: 42, level: 'high' }],
          page: 3,
          page_size: 10,
          total_pages: 3,
        },
      },
      3,
      25,
    );

    expect(normalized.items).toEqual([{ student: 42, level: 'high' }]);
    expect(normalized.pagination).toMatchObject({
      total: 29,
      page: 3,
      pageSize: 10,
      pages: 3,
      hasNext: false,
      hasPrevious: true,
    });
  });

  it('derives navigation from page counts when compatibility responses omit flags and links', () => {
    const normalized = normalizeApiCollection({
      data: { count: 60, results: [{ id: 26 }], page: 2, page_size: 25, total_pages: 3 },
    }, 2, 25);

    expect(normalized.pagination).toMatchObject({
      page: 2,
      pages: 3,
      hasNext: true,
      hasPrevious: true,
    });
  });

  it('keeps a non-collection object inspectable as one explicit record', () => {
    const normalized = normalizeApiCollection({ data: { id: 3, status: 'active' } });

    expect(normalized.items).toEqual([{ id: 3, status: 'active' }]);
    expect(normalized.pagination.total).toBe(1);
  });

  it('does not treat a singleton metric total as a collection count', () => {
    const normalized = normalizeApiCollection(
      { data: { total: 310, with_cohort: 296 } },
      1,
      25,
      { unpaginated: true },
    );

    expect(normalized.items).toEqual([{ total: 310, with_cohort: 296 }]);
    expect(normalized.pagination).toMatchObject({ total: 1, pages: 1 });
  });

  it('preserves non-fatal response warnings', () => {
    const normalized = normalizeApiCollection({
      data: [{ id: 1 }],
      warnings: ['Supporting information is delayed.'],
    });
    expect(normalized.warnings).toEqual(['Supporting information is delayed.']);
  });

  it.each([
    ['null', null],
    ['boolean', false],
    ['negative', -1],
    ['fractional', 1.5],
    ['less than the loaded page', 1],
    ['non-numeric text', 'many'],
  ])('does not turn a malformed %s total into a convincing zero', (_, total) => {
    const normalized = normalizeApiCollection({
      data: { results: [{ id: 1 }, { id: 2 }], count: total },
    });

    expect(normalized.pagination).toMatchObject({ total: null, totalKnown: false });
  });

  it('requires envelope and embedded totals to agree', () => {
    const normalized = normalizeApiCollection({
      data: { results: [{ id: 1 }], count: 2 },
      pagination: { total: 3 },
    });

    expect(normalized.pagination).toMatchObject({ total: null, totalKnown: false });
  });

  it('preserves a genuine empty total and rejects string boolean navigation flags', () => {
    const empty = normalizeApiCollection({
      data: { results: [], count: 0 },
      pagination: { total: 0, has_next: 'false', has_prev: 'false' },
    });

    expect(empty.pagination).toMatchObject({
      total: 0,
      totalKnown: true,
      hasNext: false,
      hasPrevious: false,
    });
  });
});
