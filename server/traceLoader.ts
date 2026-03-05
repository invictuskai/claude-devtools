import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

export interface Message {
  role?: string;
  content?: string | ContentBlock[];
  model?: string;
  id?: string;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface ProgressInner {
  type: 'user' | 'assistant';
  timestamp?: string;
  message?: Message;
}

export interface TraceEvent {
  uuid?: string;
  parentUuid?: string | null;
  type: 'user' | 'assistant' | 'progress' | 'summary' | 'file-history-snapshot' | 'system' | 'queue-operation';
  isSidechain?: boolean;
  sessionId?: string;
  agentId?: string;
  slug?: string;
  timestamp?: string;
  message?: Message;
  data?: Record<string, unknown> & {
    message?: ProgressInner;
    type?: string;
    hookEvent?: string;
    hookName?: string;
    agentId?: string;
  };
  parentToolUseID?: string;
  toolUseID?: string;
  version?: string;
  gitBranch?: string;
  cwd?: string;
  [key: string]: unknown;
}

export interface SessionInfo {
  sessionId: string;
  slug?: string;
  firstTimestamp?: string;
  eventCount: number;
  hasSubagents: boolean;
  subagentCount: number;
}

export interface SessionData {
  sessionId: string;
  events: TraceEvent[];
  subagents: Record<string, TraceEvent[]>;
}

const DEFAULT_TRACES_DIR = path.join(os.homedir(), '.claude', 'projects');
export const TRACES_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.env.TRACES_DIR
    ? path.resolve(process.env.TRACES_DIR)
    : DEFAULT_TRACES_DIR;

async function readJsonlFile(filePath: string): Promise<TraceEvent[]> {
  const events: TraceEvent[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
  }
  return events;
}

export function listProjects(): string[] {
  if (!fs.existsSync(TRACES_DIR)) return [];
  return fs.readdirSync(TRACES_DIR).filter(f =>
    fs.statSync(path.join(TRACES_DIR, f)).isDirectory()
  );
}

export async function listSessions(project: string): Promise<SessionInfo[]> {
  const projectDir = path.join(TRACES_DIR, project);
  if (!fs.existsSync(projectDir)) return [];

  const sessions: SessionInfo[] = [];
  const entries = fs.readdirSync(projectDir);

  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue;
    const sessionId = entry.replace('.jsonl', '');
    const filePath = path.join(projectDir, entry);
    const subagentDir = path.join(projectDir, sessionId, 'subagents');

    const events = await readJsonlFile(filePath);
    const meaningful = events.filter(e =>
      e.type === 'user' || e.type === 'assistant' || e.type === 'progress'
    );

    const subagentFiles = fs.existsSync(subagentDir)
      ? fs.readdirSync(subagentDir).filter(f => f.endsWith('.jsonl'))
      : [];

    const firstEvent = meaningful.find(e => e.timestamp);
    const slug = meaningful.find(e => (e as TraceEvent & { slug?: string }).slug)?.slug as string | undefined;

    sessions.push({
      sessionId,
      slug: slug || undefined,
      firstTimestamp: firstEvent?.timestamp,
      eventCount: meaningful.length,
      hasSubagents: subagentFiles.length > 0,
      subagentCount: subagentFiles.length,
    });
  }

  return sessions.sort((a, b) => {
    if (!a.firstTimestamp) return 1;
    if (!b.firstTimestamp) return -1;
    return b.firstTimestamp.localeCompare(a.firstTimestamp);
  });
}

export function deleteSession(project: string, sessionId: string): boolean {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error('Invalid sessionId');
  }

  const jsonlPath = path.join(TRACES_DIR, project, `${sessionId}.jsonl`);
  const subagentDir = path.join(TRACES_DIR, project, sessionId);

  if (!fs.existsSync(jsonlPath)) {
    throw new Error('Session not found');
  }

  fs.unlinkSync(jsonlPath);

  if (fs.existsSync(subagentDir) && fs.statSync(subagentDir).isDirectory()) {
    fs.rmSync(subagentDir, { recursive: true, force: true });
  }

  return true;
}

export async function loadSession(project: string, sessionId: string): Promise<SessionData | null> {
  const filePath = path.join(TRACES_DIR, project, `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return null;

  const events = await readJsonlFile(filePath);

  const subagentDir = path.join(TRACES_DIR, project, sessionId, 'subagents');
  const subagents: Record<string, TraceEvent[]> = {};

  if (fs.existsSync(subagentDir)) {
    for (const file of fs.readdirSync(subagentDir)) {
      if (!file.endsWith('.jsonl')) continue;
      const agentId = file.replace(/\.jsonl$/, '').replace(/^agent-/, '');
      const agentPath = path.join(subagentDir, file);
      subagents[agentId] = await readJsonlFile(agentPath);
    }
  }

  return { sessionId, events, subagents };
}
