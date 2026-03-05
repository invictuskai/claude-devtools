import type { SessionInfo, SessionData } from '../types/trace';

export async function fetchProjects(): Promise<string[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.statusText}`);
  return res.json();
}

export async function fetchSessions(project: string): Promise<SessionInfo[]> {
  const res = await fetch(`/api/projects/${encodeURIComponent(project)}/sessions`);
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.statusText}`);
  return res.json();
}

export async function fetchSession(project: string, sessionId: string): Promise<SessionData> {
  const res = await fetch(`/api/projects/${encodeURIComponent(project)}/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.statusText}`);
  return res.json();
}

export async function deleteSession(project: string, sessionId: string): Promise<void> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(project)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to delete session: ${res.statusText}`);
}
