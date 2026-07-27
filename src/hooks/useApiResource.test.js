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
    });
  });

  it('keeps a non-collection object inspectable as one explicit record', () => {
    const normalized = normalizeApiCollection({ data: { id: 3, status: 'active' } });

    expect(normalized.items).toEqual([{ id: 3, status: 'active' }]);
    expect(normalized.pagination.total).toBe(1);
  });
});
