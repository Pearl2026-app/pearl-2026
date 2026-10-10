const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
};
export const lookup = (name: string): string => TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
export const extensionFor = (mime: string): string | undefined => Object.entries(TYPES).find(([, m]) => m === mime)?.[0];
