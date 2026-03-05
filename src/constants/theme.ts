export const THEME = {
  bg: {
    app: '#0a0e1a',
    surface: '#111827',
    elevated: '#1a2237',
    input: '#0f172a',
    hover: '#1e293b',
    selected: '#1e3a5f',
    canvas: '#0d1117',
    topBar: '#080c16',
  },
  border: {
    subtle: '#1e293b',
    default: '#334155',
    strong: '#475569',
  },
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    muted: '#64748b',
  },
  accent: {
    indigo: '#818cf8',
    amber: '#fbbf24',
    red: '#f87171',
    blue: '#60a5fa',
    green: '#4ade80',
    orange: '#fb923c',
    teal: '#2dd4bf',
    purple: '#c084fc',
  },
  glow: {
    selection: '0 0 0 2px rgba(251,191,36,0.4), 0 0 12px rgba(251,191,36,0.15)',
    logo: '0 0 8px rgba(129,140,248,0.4)',
    error: '0 0 0 2px rgba(248,113,113,0.3), 0 0 8px rgba(248,113,113,0.15)',
  },
  shadow: {
    card: '0 2px 8px rgba(0,0,0,0.3)',
    cardSelected: '0 4px 12px rgba(0,0,0,0.4)',
  },
} as const;
