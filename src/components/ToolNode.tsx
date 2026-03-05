import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ToolNodeData } from '../types/trace';
import { THEME } from '../constants/theme';

export type ToolFlowNode = Node<ToolNodeData, 'toolNode'>;

function ToolNodeComponent({ data, selected }: NodeProps<ToolFlowNode>) {
  const toolCount = data.tools.length;

  return (
    <div
      style={{
        width: 260,
        minHeight: 90,
        background: '#1a1008',
        border: `2px solid ${selected ? THEME.accent.amber : '#fb923c'}`,
        borderRadius: 8,
        padding: '8px 10px',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 11,
        boxShadow: selected
          ? THEME.glow.selection
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
        style={{ background: '#fb923c', width: 8, height: 8 }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fb923c', flexShrink: 0 }} />
        <span style={{ color: '#fb923c', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em' }}>
          TOOL{toolCount > 1 ? ` ×${toolCount}` : ''}
        </span>
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

      {/* Tool name badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {data.tools.slice(0, 4).map((tool, i) => (
          <span
            key={i}
            style={{
              background: '#2d1a06',
              border: '1px solid #7c2d12',
              color: '#fb923c',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {tool.name}
          </span>
        ))}
        {data.tools.length > 4 && (
          <span style={{ color: THEME.text.secondary, fontSize: 10 }}>+{data.tools.length - 4}</span>
        )}
      </div>

      {/* Result preview */}
      {data.tools[0]?.result && (
        <div
          style={{
            color: THEME.text.primary,
            fontSize: 11,
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            maxHeight: '2.8em',
            borderTop: '1px solid #7c2d12',
            paddingTop: 5,
          }}
        >
          {data.tools[0].result.replace(/\n+/g, ' ').slice(0, 120)}
        </div>
      )}

      {/* Timestamp */}
      {data.timestamp && (
        <div style={{ color: THEME.text.secondary, fontSize: 10, marginTop: 5 }}>
          {new Date(data.timestamp).toLocaleTimeString()}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#fb923c', width: 8, height: 8 }}
      />
    </div>
  );
}

export const ToolNode = memo(ToolNodeComponent);
