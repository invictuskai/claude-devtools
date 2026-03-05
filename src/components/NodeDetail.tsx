import { useState } from 'react';
import type { TraceNodeData, ToolNodeData, TaskNodeData, MessageUsage } from '../types/trace';
import type { ContentBlock, TraceEvent } from '../types/trace';
import { toYaml } from '../utils/toYaml';
import { THEME } from '../constants/theme';

interface Props {
  data: TraceNodeData | ToolNodeData | TaskNodeData | null;
  onClose: () => void;
}

function renderThinking(content: string | ContentBlock[] | undefined): React.ReactNode {
  const blocks = Array.isArray(content) ? content.filter(b => b.type === 'thinking') : [];
  if (blocks.length === 0) return <em style={{ color: THEME.text.secondary }}>No thinking</em>;
  return blocks.map((block, i) => (
    <pre key={i} style={{ ...styles.pre, borderColor: '#5b21b6', color: '#e2e8f0', background: '#170f24', marginBottom: i < blocks.length - 1 ? 8 : 0 }}>
      {block.thinking || ''}
    </pre>
  ));
}

function renderContent(content: string | ContentBlock[] | undefined): React.ReactNode {
  if (!content) return <em style={{ color: THEME.text.secondary }}>No content</em>;
  if (typeof content === 'string') {
    return <pre style={styles.pre}>{content}</pre>;
  }

  const nonThinking = content.filter(b => b.type !== 'thinking');
  if (nonThinking.length === 0) return <em style={{ color: THEME.text.secondary }}>No content</em>;

  return nonThinking.map((block, i) => {
    if (block.type === 'text') {
      return (
        <div key={i} style={{ marginBottom: 8 }}>
          <pre style={styles.pre}>{block.text}</pre>
        </div>
      );
    }
    if (block.type === 'tool_use') {
      return (
        <div key={i} style={styles.toolBlock}>
          <div style={styles.toolHeader}>
            <span style={styles.toolLabel}>TOOL CALL</span>
            <span style={styles.toolName}>{block.name}</span>
            <span style={styles.toolId}>{block.id?.slice(-8)}</span>
          </div>
          <pre style={styles.pre}>{JSON.stringify(block.input, null, 2)}</pre>
        </div>
      );
    }
    if (block.type === 'tool_result') {
      const resultContent = block.content;
      const text = typeof resultContent === 'string'
        ? resultContent
        : Array.isArray(resultContent)
          ? resultContent.map(b => (b as ContentBlock).text || '').join('\n')
          : '';
      return (
        <div key={i} style={styles.resultBlock}>
          <div style={styles.toolHeader}>
            <span style={{ ...styles.toolLabel, color: '#f97316' }}>TOOL RESULT</span>
            <span style={styles.toolId}>{block.tool_use_id?.slice(-8)}</span>
          </div>
          <pre style={{ ...styles.pre, maxHeight: 200, overflowY: 'auto' }}>{text}</pre>
        </div>
      );
    }
    return null;
  });
}

/** Render expanded token usage with all available fields */
function TokenUsageDisplay({ usage, message }: { usage: MessageUsage; message?: { inference_geo?: string } }) {
  const parts: Array<{ label: string; value: string | number }> = [];

  if (usage.input_tokens != null) parts.push({ label: 'Input', value: usage.input_tokens });
  if (usage.output_tokens != null) parts.push({ label: 'Output', value: usage.output_tokens });
  if (usage.cache_read_input_tokens) parts.push({ label: 'Cache read', value: usage.cache_read_input_tokens });
  if (usage.cache_creation_input_tokens) parts.push({ label: 'Cache create', value: usage.cache_creation_input_tokens });
  if (usage.cache_creation_ephemeral_5m_input_tokens) parts.push({ label: 'Cache 5m', value: usage.cache_creation_ephemeral_5m_input_tokens });
  if (usage.ephemeral_1h_input_tokens) parts.push({ label: 'Ephemeral 1h', value: usage.ephemeral_1h_input_tokens });
  if (usage.service_tier) parts.push({ label: 'Tier', value: usage.service_tier });
  if (usage.server_tool_use) {
    const stu = usage.server_tool_use;
    if (stu.web_search_requests) parts.push({ label: 'Web search', value: stu.web_search_requests });
    if (stu.web_fetch_requests) parts.push({ label: 'Web fetch', value: stu.web_fetch_requests });
  }
  if (message?.inference_geo) parts.push({ label: 'Geo', value: message.inference_geo });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', fontSize: 13 }}>
      {parts.map(({ label, value }) => (
        <span key={label} style={{ color: THEME.text.primary }}>
          <span style={{ color: THEME.text.secondary }}>{label}:</span> {value}
        </span>
      ))}
    </div>
  );
}

/** Render structured toolUseResult data */
function ToolUseResultDisplay({ result }: { result: Record<string, unknown> }) {
  const type = result.type as string | undefined;

  // Read tool — file content
  if (result.file && typeof result.file === 'object') {
    const file = result.file as Record<string, unknown>;
    return (
      <div style={styles.structuredResult}>
        <div style={styles.structuredHeader}>
          <span style={{ ...styles.toolLabel, color: '#22c55e' }}>FILE READ</span>
          <span style={styles.structuredPath}>{String(file.filePath ?? '')}</span>
          {file.numLines != null && <span style={styles.structuredMeta}>{String(file.numLines)} lines</span>}
        </div>
        <pre style={{ ...styles.pre, maxHeight: 300, overflowY: 'auto' }}>
          {String(file.content ?? '')}
        </pre>
      </div>
    );
  }

  // Edit tool — structured diff
  if (result.structuredPatch || (result.oldString !== undefined && result.newString !== undefined)) {
    return (
      <div style={styles.structuredResult}>
        <div style={styles.structuredHeader}>
          <span style={{ ...styles.toolLabel, color: '#f59e0b' }}>EDIT</span>
          <span style={styles.structuredPath}>{String(result.filePath ?? '')}</span>
        </div>
        {result.oldString !== undefined && (
          <pre style={{ ...styles.pre, background: '#1a0808', borderColor: '#7f1d1d', color: '#f87171', maxHeight: 150, overflowY: 'auto' }}>
            {`- ${String(result.oldString)}`}
          </pre>
        )}
        {result.newString !== undefined && (
          <pre style={{ ...styles.pre, background: '#0a1f14', borderColor: '#14532d', color: '#4ade80', maxHeight: 150, overflowY: 'auto', marginTop: 4 }}>
            {`+ ${String(result.newString)}`}
          </pre>
        )}
        {result.structuredPatch != null && (
          <pre style={{ ...styles.pre, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
            {typeof result.structuredPatch === 'string' ? result.structuredPatch : JSON.stringify(result.structuredPatch, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  // Bash tool — stdout/stderr
  if (result.stdout !== undefined || result.stderr !== undefined) {
    return (
      <div style={styles.structuredResult}>
        <div style={styles.structuredHeader}>
          <span style={{ ...styles.toolLabel, color: '#c4b5fd' }}>BASH</span>
          {Boolean(result.interrupted) && <span style={{ ...styles.badge, background: '#1a1508', color: THEME.accent.amber }}>interrupted</span>}
        </div>
        {result.stdout != null && (
          <pre style={{ ...styles.pre, maxHeight: 200, overflowY: 'auto' }}>{String(result.stdout)}</pre>
        )}
        {result.stderr != null && (
          <pre style={{ ...styles.pre, maxHeight: 150, overflowY: 'auto', borderColor: '#7f1d1d', color: '#f87171', background: '#1a0808', marginTop: 4 }}>
            {String(result.stderr)}
          </pre>
        )}
      </div>
    );
  }

  // Glob tool — file list
  if (result.filenames || result.numFiles !== undefined) {
    const filenames = result.filenames as string[] | undefined;
    return (
      <div style={styles.structuredResult}>
        <div style={styles.structuredHeader}>
          <span style={{ ...styles.toolLabel, color: '#06b6d4' }}>GLOB</span>
          {result.numFiles != null && <span style={styles.structuredMeta}>{String(result.numFiles)} files</span>}
          {result.durationMs != null && <span style={styles.structuredMeta}>{String(result.durationMs)}ms</span>}
        </div>
        {filenames && (
          <pre style={{ ...styles.pre, maxHeight: 200, overflowY: 'auto' }}>
            {filenames.join('\n')}
          </pre>
        )}
      </div>
    );
  }

  // TodoWrite — task list changes
  if (result.oldTodos !== undefined || result.newTodos !== undefined) {
    return (
      <div style={styles.structuredResult}>
        <div style={styles.structuredHeader}>
          <span style={{ ...styles.toolLabel, color: '#5eead4' }}>TODO WRITE</span>
        </div>
        <pre style={{ ...styles.pre, maxHeight: 200, overflowY: 'auto' }}>
          {JSON.stringify({ oldTodos: result.oldTodos, newTodos: result.newTodos }, null, 2)}
        </pre>
      </div>
    );
  }

  // Agent/Task tool — subagent result
  if (result.agentId !== undefined || result.status !== undefined) {
    return (
      <div style={styles.structuredResult}>
        <div style={styles.structuredHeader}>
          <span style={{ ...styles.toolLabel, color: '#5eead4' }}>AGENT</span>
          {result.agentId != null && <span style={styles.structuredMeta}>ID: {String(result.agentId)}</span>}
          {result.status != null && <span style={styles.structuredMeta}>{String(result.status)}</span>}
        </div>
        {result.content != null && (
          <pre style={{ ...styles.pre, maxHeight: 200, overflowY: 'auto' }}>{String(result.content)}</pre>
        )}
      </div>
    );
  }

  // Generic fallback for other types
  return (
    <div style={styles.structuredResult}>
      <div style={styles.structuredHeader}>
        <span style={{ ...styles.toolLabel, color: THEME.text.secondary }}>
          {type ? `RESULT (${type})` : 'RESULT DATA'}
        </span>
      </div>
      <pre style={{ ...styles.pre, maxHeight: 200, overflowY: 'auto' }}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

/** Render metadata rows common to tool-call and task-call nodes */
function EventMetaRows({ event, extraRows }: { event: TraceEvent; extraRows?: React.ReactNode }) {
  const usage = event.message?.usage;
  const stopReason = event.message?.stop_reason;

  return (
    <div style={styles.metaGrid}>
      {extraRows}
      {event.uuid && <MetaRow label="UUID" value={event.uuid.slice(0, 16) + '\u2026'} mono />}
      {event.parentUuid && <MetaRow label="Parent" value={event.parentUuid.slice(0, 16) + '\u2026'} mono />}
      {event.agentId && <MetaRow label="Agent ID" value={event.agentId} mono />}
      {event.timestamp && <MetaRow label="Time" value={new Date(event.timestamp).toLocaleString()} />}
      {event.message?.model && <MetaRow label="Model" value={event.message.model} />}
      {stopReason && <MetaRow label="Stop" value={stopReason} />}
      {event.isSidechain && <MetaRow label="Sidechain" value="true" />}
      {usage && (
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>Tokens</span>
          <TokenUsageDisplay usage={usage} message={event.message} />
        </div>
      )}
    </div>
  );
}

export function NodeDetail({ data, onClose }: Props) {
  const [tab, setTab] = useState<'content' | 'raw'>('content');

  if (!data) return null;

  const { title, rawObject, bodyContent } = (() => {
    if (data.eventType === 'task-call') {
      const taskData = data as TaskNodeData;
      const aEvent = taskData.assistantEvent;
      const uEvent = taskData.userEvent;
      return {
        title: 'Task Detail',
        rawObject: { assistantEvent: taskData.assistantEvent, userEvent: taskData.userEvent },
        bodyContent: (
          <>
            {aEvent.isApiErrorMessage && <ErrorBanner />}
            <div style={styles.section}>
              <EventMetaRows
                event={aEvent}
                extraRows={
                  <>
                    <MetaRow label="Type" value="task-call" />
                    {taskData.subagentType && <MetaRow label="Subagent type" value={taskData.subagentType} />}
                    {taskData.spawnedSubagentId && <MetaRow label="Spawned" value={taskData.spawnedSubagentId} mono />}
                    {taskData.subagentId && <MetaRow label="Subagent" value={taskData.subagentId} mono />}
                  </>
                }
              />
            </div>
            {taskData.tools.map((tool, i) => (
              <div key={i} style={styles.section}>
                <div style={{ ...styles.sectionLabel, color: '#5eead4' }}>TASK PROMPT</div>
                <pre style={styles.pre}>{taskData.taskDescription}</pre>
                {tool.result !== undefined && (
                  <div style={styles.resultBlock}>
                    <div style={styles.toolHeader}>
                      <span style={{ ...styles.toolLabel, color: '#5eead4' }}>RESULT</span>
                    </div>
                    <pre style={{ ...styles.pre, maxHeight: 300, overflowY: 'auto' }}>{tool.result}</pre>
                  </div>
                )}
              </div>
            ))}
            {/* Show toolUseResult structured data from user event */}
            {uEvent.toolUseResult && (
              <div style={styles.section}>
                <div style={styles.sectionLabel}>Structured Result</div>
                <ToolUseResultDisplay result={uEvent.toolUseResult} />
              </div>
            )}
          </>
        ),
      };
    }

    if (data.eventType === 'tool-call') {
      const toolData = data as ToolNodeData;
      const aEvent = toolData.assistantEvent;
      const uEvent = toolData.userEvent;
      return {
        title: 'Tool Call Detail',
        rawObject: { assistantEvent: toolData.assistantEvent, userEvent: toolData.userEvent },
        bodyContent: (
          <>
            {aEvent.isApiErrorMessage && <ErrorBanner />}
            <div style={styles.section}>
              <EventMetaRows
                event={aEvent}
                extraRows={
                  <>
                    <MetaRow label="Type" value="tool-call" />
                    <MetaRow label="Tools" value={toolData.tools.length.toString()} />
                    {toolData.subagentId && <MetaRow label="Subagent" value={toolData.subagentId} mono />}
                  </>
                }
              />
            </div>
            {toolData.tools.map((tool, i) => (
              <div key={i} style={styles.section}>
                <div style={styles.toolBlock}>
                  <div style={styles.toolHeader}>
                    <span style={styles.toolLabel}>TOOL CALL</span>
                    <span style={styles.toolName}>{tool.name}</span>
                    <span style={styles.toolId}>{tool.id.slice(-8)}</span>
                  </div>
                  <pre style={styles.pre}>{JSON.stringify(tool.input, null, 2)}</pre>
                </div>
                {tool.result !== undefined && (
                  <div style={styles.resultBlock}>
                    <div style={styles.toolHeader}>
                      <span style={{ ...styles.toolLabel, color: '#f97316' }}>TOOL RESULT</span>
                    </div>
                    <pre style={{ ...styles.pre, maxHeight: 200, overflowY: 'auto' }}>{tool.result}</pre>
                  </div>
                )}
              </div>
            ))}
            {/* Show toolUseResult structured data from user event */}
            {uEvent.toolUseResult && (
              <div style={styles.section}>
                <div style={styles.sectionLabel}>Structured Result</div>
                <ToolUseResultDisplay result={uEvent.toolUseResult} />
              </div>
            )}
          </>
        ),
      };
    }

    const traceData = data as TraceNodeData;
    const event = traceData.event;
    const innerMsg = event.data?.message;
    return {
      title: 'Event Detail',
      rawObject: event,
      bodyContent: (
        <>
          {traceData.isApiError && <ErrorBanner />}
          {traceData.isCompactSummary && <CompactSummaryBanner />}
          <div style={styles.section}>
            <EventMetaRows
              event={event}
              extraRows={
                <>
                  <MetaRow label="Type" value={event.type} />
                  {traceData.eventType !== event.type && <MetaRow label="Inner type" value={traceData.eventType} />}
                  {traceData.subagentId && <MetaRow label="Subagent" value={traceData.subagentId} mono />}
                </>
              }
            />
          </div>
          {(traceData.eventType === 'assistant' || traceData.eventType === 'subagent-assistant') ? (
            <>
              <div style={styles.section}>
                <div style={{ ...styles.sectionLabel, color: '#c4b5fd' }}>Thinking</div>
                {renderThinking(event.message?.content)}
              </div>
              <div style={styles.section}>
                <div style={styles.sectionLabel}>Content</div>
                {renderContent(event.message?.content)}
              </div>
            </>
          ) : event.type === 'summary' ? (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Summary</div>
              <pre style={styles.pre}>{event.summary ?? extractPreviewText(event.message?.content)}</pre>
            </div>
          ) : event.message?.content && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Content</div>
              {renderContent(event.message.content)}
            </div>
          )}
          {/* Show toolUseResult for user events with tool results */}
          {event.type === 'user' && event.toolUseResult && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Structured Result</div>
              <ToolUseResultDisplay result={event.toolUseResult} />
            </div>
          )}
          {innerMsg && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>
                Subagent message ({innerMsg.type})
                {innerMsg.message?.model && (
                  <span style={{ color: THEME.text.secondary, marginLeft: 8, fontSize: 12 }}>{innerMsg.message.model}</span>
                )}
              </div>
              {innerMsg.type === 'assistant' ? (
                <>
                  <div style={{ ...styles.sectionLabel, color: '#c4b5fd', marginTop: 6 }}>Thinking</div>
                  {renderThinking(innerMsg.message?.content)}
                  <div style={{ ...styles.sectionLabel, marginTop: 8 }}>Content</div>
                  {renderContent(innerMsg.message?.content)}
                </>
              ) : renderContent(innerMsg.message?.content)}
            </div>
          )}
          {event.data?.type === 'hook_progress' && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Hook event</div>
              <div style={styles.metaGrid}>
                <MetaRow label="Event" value={String(event.data.hookEvent ?? '')} />
                <MetaRow label="Hook" value={String(event.data.hookName ?? '')} />
              </div>
            </div>
          )}
          {(traceData.eventType === 'assistant' || traceData.eventType === 'subagent-assistant' ||
            traceData.eventType === 'user' || traceData.eventType === 'subagent-user') && (
              <div style={styles.section}>
                <div style={styles.sectionLabel}>JSON</div>
                <pre style={{ ...styles.pre, maxHeight: 400, overflowY: 'auto' }}>
                  {JSON.stringify(event, null, 2)}
                </pre>
              </div>
            )}
        </>
      ),
    };
  })();

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setTab('content')}
            style={{ ...styles.tabBtn, ...(tab === 'content' ? styles.tabBtnActive : {}) }}
          >
            Content
          </button>
          <button
            onClick={() => setTab('raw')}
            style={{ ...styles.tabBtn, ...(tab === 'raw' ? styles.tabBtnActive : {}) }}
          >
            Raw
          </button>
          <button onClick={onClose} style={styles.closeBtn}>{'\u2715'}</button>
        </div>
      </div>
      <div style={styles.body}>
        {tab === 'raw'
          ? (
            <div style={{ padding: '8px 14px' }}>
              <pre style={{ ...styles.pre, maxHeight: 'none' }}>{toYaml(rawObject)}</pre>
            </div>
          )
          : bodyContent
        }
      </div>
    </div>
  );
}

function extractPreviewText(content: string | ContentBlock[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join(' ')
    .trim();
}

function ErrorBanner() {
  return (
    <div style={styles.errorBanner}>
      API ERROR — This response indicates an API error (rate limit, auth failure, etc.)
    </div>
  );
}

function CompactSummaryBanner() {
  return (
    <div style={styles.compactBanner}>
      CONTEXT COMPRESSION — This is a compact summary injected after context window compression
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={styles.metaRow}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={{ ...styles.metaValue, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 380,
    height: '100%',
    background: THEME.bg.surface,
    borderLeft: `1px solid ${THEME.border.subtle}`,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 14,
    color: THEME.text.primary,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: `1px solid ${THEME.border.subtle}`,
    background: THEME.bg.surface,
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 14,
    color: THEME.text.primary,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: THEME.text.secondary,
    cursor: 'pointer',
    fontSize: 14,
    padding: '2px 6px',
    borderRadius: 4,
    lineHeight: 1,
    marginLeft: 4,
  },
  tabBtn: {
    background: 'none',
    border: `1px solid ${THEME.border.default}`,
    color: THEME.text.secondary,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    letterSpacing: '0.04em',
  },
  tabBtnActive: {
    background: THEME.bg.selected,
    color: THEME.text.primary,
    borderColor: THEME.border.strong,
  },
  body: {
    overflowY: 'auto',
    flex: 1,
    padding: '8px 0',
  },
  section: {
    padding: '8px 14px',
    borderBottom: `1px solid ${THEME.border.subtle}`,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: THEME.text.primary,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  metaGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  metaRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
  },
  metaLabel: {
    color: THEME.text.secondary,
    width: 72,
    flexShrink: 0,
    fontSize: 13,
  },
  metaValue: {
    color: THEME.text.primary,
    fontSize: 13,
    wordBreak: 'break-all',
  },
  pre: {
    margin: 0,
    padding: '6px 8px',
    background: THEME.bg.app,
    border: `1px solid ${THEME.border.subtle}`,
    borderRadius: 4,
    fontSize: 13,
    lineHeight: 1.5,
    color: THEME.text.primary,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  },
  toolBlock: {
    marginBottom: 8,
    border: '1px solid #1e3a5f',
    borderRadius: 6,
    overflow: 'hidden',
    background: THEME.bg.elevated,
  },
  resultBlock: {
    marginBottom: 8,
    border: '1px solid #7c2d12',
    borderRadius: 6,
    overflow: 'hidden',
    background: THEME.bg.elevated,
  },
  toolHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 8px',
    background: THEME.bg.hover,
    borderBottom: `1px solid ${THEME.border.subtle}`,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: THEME.accent.blue,
  },
  toolName: {
    fontSize: 13,
    fontWeight: 600,
    color: THEME.accent.blue,
    fontFamily: 'monospace',
  },
  toolId: {
    fontSize: 12,
    color: THEME.text.secondary,
    marginLeft: 'auto',
    fontFamily: 'monospace',
  },
  errorBanner: {
    padding: '6px 14px',
    background: '#1a0808',
    borderBottom: '1px solid #7f1d1d',
    color: THEME.accent.red,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
  },
  compactBanner: {
    padding: '6px 14px',
    background: '#1a1508',
    borderBottom: '1px solid #78350f',
    color: THEME.accent.amber,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
  },
  structuredResult: {
    marginBottom: 8,
    border: '1px solid #5b21b6',
    borderRadius: 6,
    overflow: 'hidden',
    background: THEME.bg.elevated,
  },
  structuredHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 8px',
    background: '#170f24',
    borderBottom: `1px solid ${THEME.border.subtle}`,
  },
  structuredPath: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: THEME.text.primary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  structuredMeta: {
    fontSize: 12,
    color: THEME.text.secondary,
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 4,
  },
};
