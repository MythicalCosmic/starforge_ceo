import { describe, expect, it } from 'vitest';
import {
  readableFieldName,
  readableValidationDetails,
  readableValidationText,
} from './validationPresentation.js';

describe('validation presentation', () => {
  it('turns response field keys into short business labels', () => {
    expect(readableFieldName('student_id')).toBe('Student Id');
    expect(readableFieldName('exam-type')).toBe('Exam Type');
  });

  it('keeps concise validation guidance but suppresses technical internals', () => {
    expect(readableValidationText('  This value is required.  ')).toBe('This value is required.');
    expect(readableValidationText('Database SQL exception at /api/v1/results/')).toBe('Review this value.');
    expect(readableValidationText({ detail: 'nested response' })).toBe('Review this value.');
  });

  it('limits and sanitizes row-level import feedback', () => {
    const details = readableValidationDetails({ errors: { rows: [
      { row: 2, error: 'Score must be between 0 and 100.' },
      { row: 3, error: 'Postgres exception: select * from students' },
    ] } });
    expect(details).toEqual([
      'Row 2: Score must be between 0 and 100.',
      'Row 3: Review this result row.',
    ]);
  });
});
