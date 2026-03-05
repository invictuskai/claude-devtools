import { useEffect, useRef } from 'react';
import type { AnyNodeData } from '../types/trace';
import { getToolNames } from '../types/trace';
import { NODE_TYPE_CONFIG } from '../constants/nodeTypeConfig';
import { THEME } from '../constants/theme';
import { formatTime } from '../utils/formatDate';

interface Props {
  events: AnyNodeData[];
  selectedIndex: number | null;
  onSelectEvent: (i: number) => void;
  onClose: () => void;
}

export function LinearTracePanel({ events, selectedIndex, onSelectEvent, onClose }: Props) {
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (selectedIndex === null) return;
    const el = rowRefs.current.get(selectedIndex);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Chain ({events.length} events)</span>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>

      <div style={styles.list}>
        {events.map((ev, i) => {
          const cfg = NODE_TYPE_CONFIG[ev.eventType] ?? NODE_TYPE_CONFIG.user;
          const isSelected = i === selectedIndex;
          const preview = ev.preview
            ? ev.preview.replace(/\n+/g, ' ').slice(0, 120)
            : '(empty)';

          return (
            <div
              key={i}
              ref={(el) => { if (el) rowRefs.current.set(i, el); else rowRefs.current.delete(i); }}
              onClick={() => onSelectEvent(i)}
              style={{
                ...styles.row,
                background: isSelected ? THEME.bg.selected : 'transparent',
                borderLeft: isSelected ? `3px solid ${cfg.color}` : '3px solid transparent',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: cfg.color,
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ ...styles.typeLabel, color: cfg.color }}>{cfg.shortLabel}</span>
                  {getToolNames(ev).length > 0 && (
                    <span style={styles.toolsHint}>{getToolNames(ev).slice(0, 2).join(', ')}{getToolNames(ev).length > 2 ? `+${getToolNames(ev).length - 2}` : ''}</span>
                  )}
                  {ev.timestamp && (
                    <span style={styles.timestamp}>{formatTime(ev.timestamp)}</span>
                  )}
                </div>
                <div style={styles.preview}>{preview || <em style={{ color: THEME.text.secondary }}>(no content)</em>}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 280,
    height: '100%',
    background: THEME.bg.surface,
    borderLeft: `1px solid ${THEME.border.subtle}`,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 13,
    color: THEME.text.primary,
    overflow: 'hidden',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: `1px solid ${THEME.border.subtle}`,
    background: THEME.bg.surface,
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 13,
    color: THEME.text.primary,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: THEME.text.secondary,
    cursor: 'pointer',
    fontSize: 13,
    padding: '2px 5px',
    borderRadius: 4,
    lineHeight: 1,
  },
  list: {
    overflowY: 'auto',
    flex: 1,
  },
  row: {
    display: 'flex',
    gap: 8,
    padding: '7px 10px 7px 9px',
    borderBottom: `1px solid ${THEME.border.subtle}`,
    cursor: 'pointer',
    transition: 'background 0.1s',
    alignItems: 'flex-start',
  },
  typeLabel: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  toolsHint: {
    fontSize: 11,
    color: THEME.text.secondary,
    fontFamily: 'ui-monospace, monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  timestamp: {
    fontSize: 11,
    color: THEME.text.secondary,
    marginLeft: 'auto',
    flexShrink: 0,
    fontFamily: 'ui-monospace, monospace',
  },
  preview: {
    color: THEME.text.primary,
    fontSize: 13,
    lineHeight: 1.4,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
};
