import { describe, expect, it } from 'vitest';
import {
  LOGIN_PROMPTS,
  choosePromptIndex,
  getLoginPrompt,
  normalizeLoginLanguage,
} from './loginExperience.js';

describe('login leadership prompts', () => {
  it('keeps every locale aligned by count and message id', () => {
    const englishIds = LOGIN_PROMPTS.en.map(({ id }) => id);

    for (const prompts of Object.values(LOGIN_PROMPTS)) {
      expect(prompts).toHaveLength(englishIds.length);
      expect(prompts.map(({ id }) => id)).toEqual(englishIds);
      for (const prompt of prompts) {
        expect(prompt).toEqual({
          id: expect.any(String),
          eyebrow: expect.any(String),
          lead: expect.any(String),
          accent: expect.any(String),
          body: expect.any(String),
          tip: expect.any(String),
        });
      }
    }
  });

  it('never immediately repeats the previous prompt when alternatives exist', () => {
    expect(choosePromptIndex(10, 8, 2)).toBe(3);
    expect(choosePromptIndex(11, 8, 2)).toBe(3);
  });

  it('normalizes regional languages and falls back to Uzbek', () => {
    expect(normalizeLoginLanguage('ru-RU')).toBe('ru');
    expect(normalizeLoginLanguage('en-US')).toBe('en');
    expect(normalizeLoginLanguage('fr')).toBe('uz');
  });

  it('returns the same message id for the same index in every locale', () => {
    expect(getLoginPrompt('en', 6).id).toBe('truth');
    expect(getLoginPrompt('uz', 6).id).toBe('truth');
    expect(getLoginPrompt('ru', 6).id).toBe('truth');
  });

  it('rejects an invalid prompt count', () => {
    expect(() => choosePromptIndex(1, 0)).toThrow(RangeError);
  });
});
