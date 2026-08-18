import { describe, expect, it } from 'vitest';
import { filePreviewKind, fileTypeLabel } from './secureFilePreview.js';

describe('secure file preview', () => {
  it('routes browser-native formats to the correct viewer', () => {
    expect(filePreviewKind('application/pdf')).toBe('pdf');
    expect(filePreviewKind('image/png')).toBe('image');
    expect(filePreviewKind('video/mp4')).toBe('video');
    expect(filePreviewKind('audio/mpeg')).toBe('audio');
    expect(filePreviewKind('text/plain')).toBe('document');
  });

  it('keeps specialist document formats explicit', () => {
    expect(filePreviewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('external');
    expect(fileTypeLabel('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('Word document');
  });
});
