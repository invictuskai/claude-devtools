import express from 'express';
import { listProjects, listSessions, loadSession, deleteSession, TRACES_DIR } from './traceLoader.js';

const app = express();
const PORT = parseInt(process.env.API_PORT || '3001', 10);

app.use(express.json());

app.get('/api/projects', (_req, res) => {
  try {
    const projects = listProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/projects/:project/sessions', async (req, res) => {
  try {
    const sessions = await listSessions(req.params.project);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/projects/:project/sessions/:sessionId', async (req, res) => {
  try {
    const data = await loadSession(req.params.project, req.params.sessionId);
    if (!data) return res.status(404).json({ error: 'Session not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/projects/:project/sessions/:sessionId', (req, res) => {
  try {
    deleteSession(req.params.project, req.params.sessionId);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === 'Session not found' ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`API server running at http://127.0.0.1:${PORT}`);
  console.log(`Reading traces from: ${TRACES_DIR}`);
});
