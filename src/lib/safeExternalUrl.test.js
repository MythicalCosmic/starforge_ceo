import { describe, expect, it } from 'vitest';
import { safeDocumentUrl } from './safeExternalUrl.js';

describe('external document URL boundary', () => {
  it('accepts HTTPS documents and same-origin relative paths', () => {
    expect(safeDocumentUrl('https://files.example.com/report.pdf', 'https://console.example.com'))
      .toBe('https://files.example.com/report.pdf');
    expect(safeDocumentUrl('/protected/report.pdf', 'https://console.example.com'))
      .toBe('https://console.example.com/protected/report.pdf');
  });

  it('rejects script schemes, credentials, malformed URLs, and non-local HTTP', () => {
    expect(safeDocumentUrl('javascript:alert(1)', 'https://console.example.com')).toBeNull();
    expect(safeDocumentUrl('https://user:secret@files.example.com/report.pdf')).toBeNull();
    expect(safeDocumentUrl('http://files.example.com/report.pdf')).toBeNull();
    expect(safeDocumentUrl('https://[invalid')).toBeNull();
  });

  it('permits plain HTTP only for explicit loopback development', () => {
    expect(safeDocumentUrl('http://127.0.0.1:8000/media/report.pdf'))
      .toBe('http://127.0.0.1:8000/media/report.pdf');
  });
});
