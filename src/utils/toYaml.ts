export function toYaml(val: unknown, depth = 0): string {
  const ind = '  '.repeat(depth);
  const ind1 = '  '.repeat(depth + 1);

  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'null';

  if (typeof val === 'string') {
    if (val === '') return '""';
    if (val.includes('\n')) {
      return `|\n${val.split('\n').map(l => ind1 + l).join('\n')}`;
    }
    const needsQuote = /^[\s:#\-\[\]{},&*!|>'"%@`?]/.test(val)
      || /^(true|false|null|yes|no|on|off|\d)/.test(val)
      || /\s$/.test(val);
    return needsQuote ? JSON.stringify(val) : val;
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    return val.map(item => {
      if (item !== null && typeof item === 'object') {
        const lines = toYaml(item, depth + 1).split('\n');
        const first = lines[0].slice(ind1.length);
        const rest = lines.slice(1).join('\n');
        return rest ? `${ind}- ${first}\n${rest}` : `${ind}- ${first}`;
      }
      return `${ind}- ${toYaml(item, 0)}`;
    }).join('\n');
  }

  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return entries.map(([k, v]) => {
      if (typeof v === 'string' && v.includes('\n')) {
        return `${ind}${k}: ${toYaml(v, depth + 1)}`;
      }
      if (v !== null && typeof v === 'object') {
        const s = toYaml(v, depth + 1);
        const isEmpty = Array.isArray(v) ? (v as unknown[]).length === 0 : Object.keys(v as object).length === 0;
        return isEmpty ? `${ind}${k}: ${s}` : `${ind}${k}:\n${s}`;
      }
      return `${ind}${k}: ${toYaml(v, 0)}`;
    }).join('\n');
  }

  return String(val);
}
