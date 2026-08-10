import { describe, expect, it } from 'vitest';
import { normalizeHashRoute } from './useHashRoute.js';

describe('clean workspace route normalization', () => {
  it('migrates legacy hash routes into the same clean route value', () => {
    expect(normalizeHashRoute('#/star-ai?branch=2')).toBe('star-ai?branch=2');
    expect(normalizeHashRoute('/star-ai?branch=2')).toBe('star-ai?branch=2');
  });

  it('removes duplicate slashes and uses the authorized fallback at the root', () => {
    expect(normalizeHashRoute('///groups//7///overview')).toBe('groups/7/overview');
    expect(normalizeHashRoute('/', 'overview')).toBe('overview');
  });
});
