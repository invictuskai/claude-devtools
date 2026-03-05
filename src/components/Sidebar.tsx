import { useEffect, useState } from 'react';
import type { SessionInfo } from '../types/trace';
import { fetchSessions } from '../utils/api';
import { formatTimestamp } from '../utils/formatDate';
import { THEME } from '../constants/theme';

interface Props {
  projects: string[];
  selectedProject: string | null;
  selectedSession: string | null;
  onSelectProject: (project: string) => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
}

function formatProjectName(name: string): string {
  return name.replace(/--/, ':\\').replace(/-/g, '\\');
}

export function Sidebar({ projects, selectedProject, selectedSession, onSelectProject, onSelectSession, onDeleteSession }: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    fetchSessions(selectedProject)
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedProject]);

  function refreshSessions() {
    if (!selectedProject) return;
    fetchSessions(selectedProject)
      .then(setSessions)
      .catch(() => {});
  }

  function handleDelete(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    if (!window.confirm('删除之后无法用 /resume 恢复旧会话，是否删除')) return;
    if (onDeleteSession) {
      onDeleteSession(sessionId);
    }
    setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    refreshSessions();
  }

  return (
    <div style={styles.sidebar}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>◈</span>
        <span style={styles.title}>Claude Traces</span>
      </div>

      {/* Projects */}
      <div style={styles.section}>
        <div style={styles.sectionLabel}>Projects</div>
        {projects.map(p => (
          <button
            key={p}
            onClick={() => onSelectProject(p)}
            style={{
              ...styles.projectBtn,
              background: selectedProject === p ? THEME.bg.selected : 'transparent',
              color: selectedProject === p ? THEME.text.primary : THEME.text.secondary,
              borderLeft: selectedProject === p ? `2px solid ${THEME.accent.blue}` : '2px solid transparent',
            }}
            title={p}
          >
            <span style={styles.projectIcon}>📁</span>
            <span style={styles.projectName}>{formatProjectName(p)}</span>
          </button>
        ))}
      </div>

      {/* Sessions */}
      {selectedProject && (
        <div style={{ ...styles.section, flex: 1, overflowY: 'auto' }}>
          <div style={styles.sectionLabel}>
            Sessions
            {sessions.length > 0 && <span style={styles.count}>{sessions.length}</span>}
          </div>
          {loading ? (
            <div style={styles.loading}>Loading…</div>
          ) : (
            sessions.map(s => (
              <div
                key={s.sessionId}
                style={{ position: 'relative' }}
                onMouseEnter={() => setHoveredSession(s.sessionId)}
                onMouseLeave={() => setHoveredSession(null)}
              >
                <button
                  onClick={() => onSelectSession(s.sessionId)}
                  style={{
                    ...styles.sessionBtn,
                    background: selectedSession === s.sessionId ? THEME.bg.selected : 'transparent',
                    borderLeft: selectedSession === s.sessionId ? `2px solid ${THEME.accent.green}` : '2px solid transparent',
                  }}
                >
                  <div style={styles.sessionTop}>
                    <span style={styles.sessionSlug}>{s.slug || s.sessionId.slice(0, 12)}</span>
                    {s.hasSubagents && (
                      <span style={styles.agentBadge}>{s.subagentCount}</span>
                    )}
                  </div>
                  <div style={styles.sessionMeta}>
                    <span>{s.eventCount} events</span>
                    {s.firstTimestamp && (
                      <span style={{ marginLeft: 6 }}>{formatTimestamp(s.firstTimestamp)}</span>
                    )}
                  </div>
                </button>
                {hoveredSession === s.sessionId && (
                  <button
                    onClick={(e) => handleDelete(e, s.sessionId)}
                    style={styles.deleteBtn}
                    title="Delete session"
                  >
                    ×
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 300,
    height: '100%',
    background: THEME.bg.surface,
    borderRight: `1px solid ${THEME.border.subtle}`,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '14px 16px 12px',
    borderBottom: `1px solid ${THEME.border.subtle}`,
  },
  logo: {
    fontSize: 18,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: THEME.text.primary,
    letterSpacing: '-0.01em',
  },
  section: {
    padding: '12px 0 6px',
    display: 'flex',
    flexDirection: 'column',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: THEME.text.secondary,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '0 16px',
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  count: {
    background: THEME.border.subtle,
    color: THEME.text.secondary,
    borderRadius: 10,
    padding: '1px 6px',
    fontSize: 10,
  },
  projectBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 16px',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 0,
    fontFamily: 'inherit',
    fontSize: 13,
    transition: 'background 0.1s',
  },
  projectIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
  projectName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  sessionBtn: {
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 16px',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 0,
    fontFamily: 'inherit',
    color: THEME.text.secondary,
    transition: 'background 0.1s',
    gap: 3,
  },
  sessionTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sessionSlug: {
    fontSize: 13,
    fontWeight: 600,
    color: THEME.text.primary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    fontFamily: 'ui-monospace, monospace',
  },
  agentBadge: {
    background: '#2d1b69',
    color: '#c084fc',
    border: '1px solid #5b21b6',
    borderRadius: 10,
    padding: '0px 5px',
    fontSize: 10,
    fontWeight: 700,
    flexShrink: 0,
  },
  sessionMeta: {
    fontSize: 11,
    color: THEME.text.secondary,
    fontFamily: 'ui-monospace, monospace',
  },
  loading: {
    color: THEME.text.secondary,
    fontSize: 11,
    padding: '8px 16px',
    fontStyle: 'italic',
  },
  deleteBtn: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 4,
    background: '#3b1111',
    color: '#f87171',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
  },
};
