import { describe, expect, it } from 'vitest';
import { directoryPageCount, directoryRoute, readDirectoryPage } from './directoryPagination.js';

describe('directory pagination routes', () => {
  it('accepts only positive safe integer pages', () => {
    expect(readDirectoryPage(new URLSearchParams('page=3'))).toBe(3);
    expect(readDirectoryPage(new URLSearchParams('page=0'))).toBe(1);
    expect(readDirectoryPage(new URLSearchParams('page=-4'))).toBe(1);
    expect(readDirectoryPage(new URLSearchParams('page=3.5'))).toBe(1);
    expect(readDirectoryPage(new URLSearchParams('page=not-a-page'))).toBe(1);
  });

  it('keeps filters in the URL, omits empty values, and canonicalizes the first page', () => {
    expect(directoryRoute('students/directory', { branch: '2', q: '', page: '99' }, 4))
      .toBe('students/directory?branch=2&page=4');
    expect(directoryRoute('teachers/directory', { active: 'true' }, 1))
      .toBe('teachers/directory?active=true');
    expect(directoryRoute('students/directory', { status: 'active', page: '8' }))
      .toBe('students/directory?status=active');
  });

  it('prefers exact response metadata and otherwise derives pages from the exact total', () => {
    expect(directoryPageCount({ pagination: { pages: 7 }, total: 2 }, 24)).toBe(7);
    expect(directoryPageCount({ pagination: null, total: 49 }, 24)).toBe(3);
    expect(directoryPageCount({ pagination: null, total: 0 }, 24)).toBe(1);
  });

  it('does not coerce boolean, fractional, or object metadata into pagination', () => {
    expect(directoryPageCount({ pagination: { pages: true }, total: false }, 24)).toBe(1);
    expect(directoryPageCount({ pagination: { pages: 2.5 }, total: { value: 49 } }, 24)).toBe(1);
    expect(directoryPageCount({ pagination: null, total: '49' }, '24')).toBe(3);
  });
});
