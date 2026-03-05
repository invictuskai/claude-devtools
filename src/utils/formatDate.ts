export function formatTimestamp(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatTime(ts?: string): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}
