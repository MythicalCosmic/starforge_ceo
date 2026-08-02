import { describe, expect, it } from 'vitest';
import { apiQueryKey } from './queryClient.js';

describe('API query identity', () => {
  it('normalizes parameter order and drops empty values', () => {
    expect(apiQueryKey('/api/v1/students/', { page: 2, search: '', page_size: 25 }, 'en-US'))
      .toEqual(apiQueryKey('/api/v1/students/', { page_size: 25, page: 2 }, 'en'));
  });

  it('keeps translated responses isolated by selected language', () => {
    expect(apiQueryKey('/api/v1/students/', {}, 'en'))
      .not.toEqual(apiQueryKey('/api/v1/students/', {}, 'uz'));
  });
});
