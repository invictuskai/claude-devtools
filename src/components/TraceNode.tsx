import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { TraceNodeData } from '../types/trace';
import { NODE_TYPE_CONFIG } from '../constants/nodeTypeConfig';
import { THEME } from '../constants/theme';
import { formatTime } from '../utils/formatDate';

export type TraceFlowNode = Node<TraceNodeData, 'traceNode'>;

function TraceNodeComponent({ data, selected }: NodeProps<TraceFlowNode>) {
  const config = NODE_TYPE_CONFIG[data.eventType] ?? NODE_TYPE_CONFIG['user'];
  const preview = data.preview
    ? data.preview.replace(/\n+/g, ' ').slice(0, 120)
    : '';

  const borderColor = selected ? THEME.accent.amber
    : data.isApiError ? THEME.accent.red
    : config.border;
  const bgColor = data.isApiError ? '#1a0808' : config.bg;

  return (
    <div
      style={{
        width: 260,
        minHeight: 90,
        background: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: '8px 10px',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 11,
        boxShadow: selected
          ? THEME.glow.selection
          : data.isApiError
            ? THEME.glow.error
            : THEME.shadow.card,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: config.border, width: 8, height: 8 }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: config.color,
            flexShrink: 0,
          }}
        />
        <span style={{ color: config.text, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em' }}>
          {config.label}
        </span>
        {data.isApiError && (
          <span style={{ fontSize: 10, fontWeight: 700, color: THEME.accent.red, background: '#3b1111', padding: '0 4px', borderRadius: 3, border: '1px solid #7f1d1d' }}>
            ERROR
          </span>
        )}
        {data.isCompactSummary && (
          <span style={{ fontSize: 10, fontWeight: 700, color: THEME.accent.amber, background: '#1a1508', padding: '0 4px', borderRadius: 3, border: '1px solid #78350f' }}>
            COMPACT
          </span>
        )}
        {data.isSidechain && (
          <span style={{ fontSize: 10, fontWeight: 700, color: THEME.text.secondary, background: THEME.border.subtle, padding: '0 4px', borderRadius: 3, border: `1px solid ${THEME.border.default}` }}>
            SIDE
          </span>
        )}
        {data.agentId && (
          <span style={{ color: THEME.text.secondary, fontSize: 10, marginLeft: 'auto' }}>
            agent:{data.agentId.slice(0, 7)}
          </span>
        )}
        {data.subagentId && !data.agentId && (
          <span style={{ color: THEME.text.secondary, fontSize: 10, marginLeft: 'auto' }}>
            sub:{data.subagentId.slice(0, 7)}
          </span>
        )}
      </div>

      {/* Preview text */}
      <div
        style={{
          color: THEME.text.primary,
          fontSize: 12,
          lineHeight: 1.4,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          maxHeight: '4.2em',
        }}
      >
        {preview || <span style={{ color: THEME.text.secondary, fontStyle: 'italic' }}>(no content)</span>}
      </div>

      {/* Tools badge */}
      {data.tools.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {data.tools.slice(0, 4).map((tool, i) => (
            <span
              key={i}
              style={{
                background: THEME.border.subtle,
                border: `1px solid ${THEME.border.default}`,
                color: THEME.text.primary,
                borderRadius: 4,
                padding: '1px 5px',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {tool}
            </span>
          ))}
          {data.tools.length > 4 && (
            <span style={{ color: THEME.text.secondary, fontSize: 10 }}>+{data.tools.length - 4}</span>
          )}
        </div>
      )}

      {/* Timestamp */}
      {data.timestamp && (
        <div style={{ color: THEME.text.secondary, fontSize: 10, marginTop: 5 }}>
          {formatTime(data.timestamp)}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: config.border, width: 8, height: 8 }}
      />
    </div>
  );
}

export const TraceNode = memo(TraceNodeComponent);
