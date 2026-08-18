export function filePreviewKind(contentType) {
  const value = String(contentType || '').toLowerCase();
  if (value === 'application/pdf') return 'pdf';
  if (value.startsWith('image/')) return 'image';
  if (value.startsWith('video/')) return 'video';
  if (value.startsWith('audio/')) return 'audio';
  if (value.startsWith('text/') || ['application/json', 'application/xml'].includes(value)) return 'document';
  return 'external';
}

export function fileTypeLabel(contentType) {
  const value = String(contentType || '').toLowerCase();
  const known = {
    'application/pdf': 'PDF document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint presentation',
  };
  if (known[value]) return known[value];
  if (value.startsWith('image/')) return `${value.slice(6).toUpperCase()} image`;
  if (value.startsWith('video/')) return `${value.slice(6).toUpperCase()} video`;
  if (value.startsWith('audio/')) return `${value.slice(6).toUpperCase()} audio`;
  if (value.startsWith('text/')) return `${value.slice(5).toUpperCase()} text`;
  return value || 'File';
}
