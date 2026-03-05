import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { TaskNodeData } from '../types/trace';
import { THEME } from '../constants/theme';

export type TaskFlowNode = Node<TaskNodeData, 'taskNode'>;

function TaskNodeComponent({ data, selected }: NodeProps<TaskFlowNode>) {
  const taskCount = data.tools.length;

  return (
    <div
      style={{
        width: 260,
        minHeight: 90,
        background: '#0a1a18',
        border: `2px solid ${selected ? THEME.accent.amber : '#2dd4bf'}`,
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
        style={{ background: '#2dd4bf', width: 8, height: 8 }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2dd4bf', flexShrink: 0 }} />
        <span style={{ color: '#2dd4bf', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em' }}>
          TASK{taskCount > 1 ? ` ×${taskCount}` : ''}
        </span>
        {data.subagentType && (
          <span
            style={{
              background: '#0a2a25',
              border: '1px solid #115e59',
              color: '#2dd4bf',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {data.subagentType}
          </span>
        )}
        {data.spawnedSubagentId && (
          <span style={{ color: '#2dd4bf', fontSize: 10, marginLeft: 'auto' }}>
            ↳ {data.spawnedSubagentId.slice(0, 7)}
          </span>
        )}
      </div>

      {/* Task description */}
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
        {data.taskDescription
          ? data.taskDescription.replace(/\n+/g, ' ').slice(0, 160)
          : <span style={{ color: '#2dd4bf', fontStyle: 'italic' }}>(no description)</span>
        }
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
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            maxHeight: '1.4em',
            borderTop: '1px solid #115e59',
            paddingTop: 5,
            marginTop: 5,
          }}
        >
          {data.tools[0].result.replace(/\n+/g, ' ').slice(0, 100)}
        </div>
      )}

      {/* Timestamp */}
      {data.timestamp && (
        <div style={{ color: THEME.text.secondary, fontSize: 10, marginTop: 5 }}>
          {new Date(data.timestamp).toLocaleTimeString()}
        </div>
      )}

      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        style={{ background: '#2dd4bf', width: 8, height: 8 }}
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        style={{ background: '#2dd4bf', width: 8, height: 8 }}
      />
    </div>
  );
}

export const TaskNode = memo(TaskNodeComponent);
