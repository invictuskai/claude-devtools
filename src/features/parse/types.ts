
export interface SSEEvent {
  event: string;
  data: string;
  parsedData?: unknown;
  id?: string;
  timestamp: number;
}

export interface ContentBlock {
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result';
  content: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  signature?: string;
  is_error?: boolean;
}

export interface MessageState {
  model?: string;
  role?: string;
  blocks: ContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  stop_reason?: string;
}

// New types for Dialogue History (Full HTTP JSON)
export interface ClaudePart {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ClaudePart[];
  is_error?: boolean;
  tool_use_id?: string;
  cache_control?: { type: string; ttl?: string };
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudePart[];
}

export interface ClaudeChatHistory {
  model: string;
  messages: ClaudeMessage[];
  system?: unknown[];
  tools?: unknown[];
  usage?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  max_tokens?: number;
  thinking?: { type: string; budget_tokens?: number };
  stream?: boolean;
}
