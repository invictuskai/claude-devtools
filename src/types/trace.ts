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

export interface MessageUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation_ephemeral_5m_input_tokens?: number;
  ephemeral_1h_input_tokens?: number;
  service_tier?: string;
  server_tool_use?: {
    web_search_requests?: number;
    web_fetch_requests?: number;
  };
}

export interface Message {
  role?: string;
  content?: string | ContentBlock[];
  model?: string;
  id?: string;
  stop_reason?: string | null;
  usage?: MessageUsage;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  inference_geo?: string;
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
    prompt?: string;
  };
  parentToolUseID?: string;
  toolUseID?: string;
  version?: string;
  gitBranch?: string;
  cwd?: string;
  // Streaming dedup fields
  requestId?: string;
  // API error indicator
  isApiErrorMessage?: boolean;
  // Compact summary indicator
  isCompactSummary?: boolean;
  isVisibleInTranscriptOnly?: boolean;
  // Summary event fields (no uuid, no message)
  summary?: string;
  leafUuid?: string;
  // System compact_boundary
  logicalParentUuid?: string;
  // Tool result structured data (on user events)
  toolUseResult?: Record<string, unknown>;
  // User type
  userType?: string;
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

// Derived types for graph nodes
export type NodeEventType =
  | 'user'
  | 'assistant'
  | 'tool-call'
  | 'task-call'
  | 'subagent-user'
  | 'subagent-assistant'
  | 'hook-progress'
  | 'summary';

// Must extend Record<string, unknown> for @xyflow/react v12 compatibility
export interface TraceNodeData extends Record<string, unknown> {
  eventType: NodeEventType;
  preview: string;
  tools: string[];
  agentId?: string;
  timestamp?: string;
  event: TraceEvent;
  subagentId?: string;
  isApiError?: boolean;
  isCompactSummary?: boolean;
  isSidechain?: boolean;
}

export interface ToolCall extends Record<string, unknown> {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
}

export interface ToolNodeData extends Record<string, unknown> {
  eventType: 'tool-call';
  tools: ToolCall[];
  preview: string;
  agentId?: string;
  timestamp?: string;
  assistantEvent: TraceEvent;
  userEvent: TraceEvent;
  subagentId?: string;
}

export interface TaskNodeData extends Record<string, unknown> {
  eventType: 'task-call';
  tools: ToolCall[];
  preview: string;
  taskDescription: string;
  subagentType?: string;
  spawnedSubagentId?: string;
  agentId?: string;
  timestamp?: string;
  assistantEvent: TraceEvent;
  userEvent: TraceEvent;
  subagentId?: string;
}

export type AnyNodeData = TraceNodeData | ToolNodeData | TaskNodeData;

export function getToolNames(ev: AnyNodeData): string[] {
  if (ev.eventType === 'tool-call' || ev.eventType === 'task-call') {
    return (ev as ToolNodeData | TaskNodeData).tools.map(t => t.name);
  }
  return (ev as TraceNodeData).tools;
}

export interface CollapsedNodeData extends Record<string, unknown> {
  chainId: string;
  events: AnyNodeData[];
  count: number;
  subagentId?: string;
}
