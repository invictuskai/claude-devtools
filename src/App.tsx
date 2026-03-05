import { lazy, Suspense, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DAGView } from './components/DAGView';
import type { SessionData } from './types/trace';
import { fetchProjects, fetchSession, deleteSession } from './utils/api';
import { THEME } from './constants/theme';

const ProxyMonitor = lazy(() => import('./features/parse/components/ProxyMonitor'));

type AppMode = 'traces' | 'live';

const MODE_LABELS: { key: AppMode; label: string }[] = [
  { key: 'traces', label: 'Session Traces' },
  { key: 'live', label: 'Live Monitor' },
];

export function App() {
  const [appMode, setAppMode] = useState<AppMode>('traces');
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(() => {});
  }, []);

  function handleSelectProject(project: string) {
    setSelectedProject(project);
    setSelectedSession(null);
    setSessionData(null);
  }

  function handleSelectSession(sessionId: string) {
    if (!selectedProject) return;
    setSelectedSession(sessionId);
    setLoading(true);
    fetchSession(selectedProject, sessionId)
      .then(setSessionData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function handleDeleteSession(sessionId: string) {
    if (!selectedProject) return;
    deleteSession(selectedProject, sessionId).catch(() => {});
    if (selectedSession === sessionId) {
      setSelectedSession(null);
      setSessionData(null);
    }
  }

  return (
    <div style={styles.app}>
      {/* Mode Switcher Bar */}
      <div style={styles.modeBar}>
        <div style={styles.modeBarLeft}>
          <span style={styles.logo}>CD</span>
          <span style={styles.title}>Claude Devtools</span>
        </div>
        <div style={styles.modeBarCenter}>
          {MODE_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setAppMode(key)}
              style={{
                ...styles.modeBtn,
                ...(appMode === key ? styles.modeBtnActive : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={styles.modeBarRight} />
      </div>

      {/* Mode Content */}
      <div style={styles.content}>
        {appMode === 'traces' && (
          <div style={styles.tracesLayout}>
            <Sidebar
              projects={projects}
              selectedProject={selectedProject}
              selectedSession={selectedSession}
              onSelectProject={handleSelectProject}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
            />
            <DAGView sessionData={sessionData} loading={loading} />
          </div>
        )}
        {appMode === 'live' && (
          <Suspense fallback={<LoadingFallback />}>
            <ProxyMonitor />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: THEME.text.secondary }}>
      Loading...
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    background: THEME.bg.app,
  },
  modeBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 42,
    padding: '0 16px',
    background: THEME.bg.topBar,
    borderBottom: `1px solid ${THEME.border.subtle}`,
    flexShrink: 0,
  },
  modeBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 180,
  },
  logo: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 6,
    background: THEME.accent.indigo,
    color: '#fff',
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
    boxShadow: THEME.glow.logo,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: THEME.text.primary,
    letterSpacing: 0.5,
  },
  modeBarCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: THEME.border.subtle,
    borderRadius: 8,
    padding: 3,
  },
  modeBtn: {
    padding: '5px 16px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: THEME.text.secondary,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  modeBtnActive: {
    background: THEME.bg.selected,
    color: THEME.text.primary,
  },
  modeBarRight: {
    minWidth: 180,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  tracesLayout: {
    display: 'flex',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
  },
};
