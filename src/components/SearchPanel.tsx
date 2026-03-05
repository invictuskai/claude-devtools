import { useState, useMemo } from 'react';
import type { AnyFlowNode } from '../utils/collapseGraph';
import type { TraceNodeData, ToolNodeData, TaskNodeData, CollapsedNodeData, AnyNodeData, ContentBlock, NodeEventType } from '../types/trace';
import { getToolNames } from '../types/trace';
import { NODE_TYPE_CONFIG } from '../constants/nodeTypeConfig';
import { THEME } from '../constants/theme';
import { truncateAround } from '../utils/truncateText';
import { isCollapsedNodeData } from '../utils/typeGuards';

interface Props {
  nodes: AnyFlowNode[];
  onSelectNode: (nodeId: string, eventIndex?: number) => void;
}

interface SearchResult {
  nodeId: string;
  eventIndex?: number;
  eventType: NodeEventType;
  preview: string;
  toolNames: string[];
  matchSnippet: string;
  isInnerEvent?: boolean;
  chainLabel?: string;
}

function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <span style={{ background: '#ca8a04', color: '#fff', borderRadius: 2, padding: '0 1px' }}>{match}</span>
      {after}
    </>
  );
}

function contentBlocksToText(content: string | ContentBlock[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content.map(block => {
    if (block.type === 'text') return block.text || '';
    if (block.type === 'thinking') return block.thinking || '';
    if (block.type === 'tool_use') {
      return `${block.name || ''} ${JSON.stringify(block.input || {})}`;
    }
    if (block.type === 'tool_result') {
      const c = block.content;
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) return c.map(b => b.text || '').join(' ');
    }
    return '';
  }).join(' ');
}

function getFullContent(data: AnyNodeData): string {
  if (data.eventType === 'tool-call' || data.eventType === 'task-call') {
    const td = data as ToolNodeData | TaskNodeData;
    const parts: string[] = [];
    parts.push(contentBlocksToText(td.assistantEvent.message?.content));
    parts.push(contentBlocksToText(td.userEvent.message?.content));
    return parts.join(' ');
  }
  const td = data as TraceNodeData;
  const ev = td.event;
  if (ev.type === 'progress' && ev.data?.message) {
    return contentBlocksToText(ev.data.message.message?.content);
  }
  return contentBlocksToText(ev.message?.content);
}

function searchNodeData(data: AnyNodeData, query: string): string | null {
  if (matchesQuery(data.preview, query)) return data.preview;
  const toolNames = getToolNames(data);
  for (const name of toolNames) {
    if (matchesQuery(name, query)) return name;
  }
  if (matchesQuery(data.eventType, query)) return data.eventType;
  // Search tool call inputs and results for tool/task nodes
  if (data.eventType === 'tool-call' || data.eventType === 'task-call') {
    const tools = (data as ToolNodeData | TaskNodeData).tools;
    for (const tool of tools) {
      if (tool.result && matchesQuery(tool.result, query)) {
        return truncateAround(tool.result, query, 80);
      }
      const inputStr = JSON.stringify(tool.input);
      if (matchesQuery(inputStr, query)) {
        return truncateAround(inputStr, query, 80);
      }
    }
  }
  // Fallback: search full raw message content (catches long text, tool_use
  // inputs in non-merged nodes, tool_result bodies beyond preview truncation)
  const fullText = getFullContent(data);
  if (fullText && matchesQuery(fullText, query)) {
    return truncateAround(fullText, query, 80);
  }
  return null;
}


export function SearchPanel({ nodes, onSelectNode }: Props) {
  const [query, setQuery] = useState('');

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim();
    if (!q) return [];

    const out: SearchResult[] = [];

    for (const node of nodes) {
      if (isCollapsedNodeData(node.data)) {
        const cData = node.data;
        // Emit one result per matching inner event
        for (let i = 0; i < cData.events.length; i++) {
          const ev = cData.events[i];
          const matchText = searchNodeData(ev, q);
          if (matchText) {
            out.push({
              nodeId: node.id,
              eventIndex: i,
              eventType: ev.eventType,
              preview: ev.preview.slice(0, 80),
              toolNames: getToolNames(ev).slice(0, 3),
              matchSnippet: matchText.slice(0, 80),
              isInnerEvent: true,
              chainLabel: `chain (${cData.count})`,
            });
          }
        }
      } else {
        const data = node.data as TraceNodeData | ToolNodeData | TaskNodeData;
        const matchText = searchNodeData(data, q);
        if (matchText) {
          out.push({
            nodeId: node.id,
            eventType: data.eventType,
            preview: data.preview.slice(0, 80),
            toolNames: getToolNames(data).slice(0, 3),
            matchSnippet: matchText.slice(0, 80),
          });
        }
      }
    }

    return out;
  }, [nodes, query]);

  return (
    <div style={styles.panel}>
      <div style={styles.header}>Search</div>
      <div style={styles.inputWrap}>
        <input
          type="text"
          placeholder="Filter nodes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={styles.input}
        />
        {query && (
          <button style={styles.clearBtn} onClick={() => setQuery('')}>×</button>
        )}
      </div>

      {query.trim() && (
        <div style={styles.countBar}>
          {results.length} result{results.length !== 1 ? 's' : ''}
        </div>
      )}

      <div style={styles.resultsList}>
        {results.map((r, idx) => (
          <button
            key={`${r.nodeId}-${r.eventIndex ?? idx}`}
            style={styles.resultRow}
            onClick={() => onSelectNode(r.nodeId, r.eventIndex)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = THEME.bg.hover;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <div style={styles.resultHeader}>
              <span
                style={{
                  ...styles.dot,
                  background: NODE_TYPE_CONFIG[r.eventType]?.color || '#64748b',
                }}
              />
              <span style={styles.typeLabel}>{r.eventType}</span>
              {r.chainLabel && (
                <span style={styles.chainBadge}>{r.chainLabel}</span>
              )}
            </div>
            <div style={styles.snippet}>
              {highlightMatch(r.matchSnippet, query.trim())}
            </div>
            {r.toolNames.length > 0 && (
              <div style={styles.toolRow}>
                {r.toolNames.map((t) => (
                  <span key={t} style={styles.toolBadge}>{t}</span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 260,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    background: THEME.bg.surface,
    borderRight: `1px solid ${THEME.border.subtle}`,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    overflow: 'hidden',
  },
  header: {
    padding: '10px 12px 6px',
    fontSize: 12,
    fontWeight: 700,
    color: THEME.text.primary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  inputWrap: {
    padding: '0 8px 8px',
    position: 'relative',
  },
  input: {
    width: '100%',
    padding: '6px 28px 6px 8px',
    fontSize: 12,
    background: THEME.bg.input,
    border: `1px solid ${THEME.border.default}`,
    borderRadius: 4,
    color: THEME.text.primary,
    outline: 'none',
    boxSizing: 'border-box',
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    top: 4,
    background: 'none',
    border: 'none',
    color: THEME.text.muted,
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: '20px',
    padding: '0 4px',
  },
  countBar: {
    padding: '0 12px 6px',
    fontSize: 11,
    color: THEME.text.secondary,
  },
  resultsList: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  resultRow: {
    display: 'block',
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    borderBottom: `1px solid ${THEME.border.subtle}`,
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
  },
  resultHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  dot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: THEME.text.secondary,
    textTransform: 'uppercase',
  },
  chainBadge: {
    fontSize: 10,
    padding: '0 4px',
    borderRadius: 3,
    background: THEME.border.subtle,
    color: THEME.text.primary,
    marginLeft: 'auto',
  },
  snippet: {
    fontSize: 12,
    color: THEME.text.primary,
    lineHeight: '18px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  toolRow: {
    display: 'flex',
    gap: 4,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  toolBadge: {
    fontSize: 10,
    padding: '1px 5px',
    borderRadius: 3,
    background: THEME.border.subtle,
    color: THEME.text.primary,
  },
};
