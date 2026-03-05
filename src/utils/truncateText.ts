export function truncateAround(text: string, query: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - Math.floor((maxLen - query.length) / 2));
  const slice = text.slice(start, start + maxLen);
  return (start > 0 ? '\u2026' : '') + slice + (start + maxLen < text.length ? '\u2026' : '');
}
