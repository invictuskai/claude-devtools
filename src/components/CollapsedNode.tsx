import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { CollapsedNodeData, NodeEventType } from '../types/trace';
import { getToolNames } from '../types/trace';
import { NODE_TYPE_CONFIG } from '../constants/nodeTypeConfig';
import { THEME } from '../constants/theme';

export type CollapsedFlowNode = Node<CollapsedNodeData, 'collapsedNode'>;

function CollapsedNodeComponent({ data, selected }: NodeProps<CollapsedFlowNode>) {
  const nodeHeight = (data.nodeHeight as number | undefined) ?? 80;

  const typeCounts: Record<string, number> = {};
  for (const ev of data.events) {
    const t = ev.eventType;
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }

  const allToolNames = data.events.flatMap(ev => getToolNames(ev));
  const uniqueTools = Array.from(new Set(allToolNames));
  const maxTools = Math.max(3, Math.floor((nodeHeight - 60) / 16));
  const shownTools = uniqueTools.slice(0, maxTools);
  const extraTools = uniqueTools.length - shownTools.length;

  return (
    <div
      style={{
        width: 260,
        height: nodeHeight,
        background: THEME.bg.elevated,
        border: `2px dashed ${selected ? THEME.accent.amber : THEME.border.strong}`,
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
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: THEME.border.strong, width: 8, height: 8 }}
      />

      {/* Header: count badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexShrink: 0 }}>
        <span
          style={{
            background: THEME.border.subtle,
            border: `1px solid ${THEME.border.default}`,
            color: THEME.text.primary,
            borderRadius: 12,
            padding: '1px 8px',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {data.count} events
        </span>
        {data.subagentId && (
          <span style={{ color: THEME.text.secondary, fontSize: 10, marginLeft: 'auto' }}>
            sub:{data.subagentId.slice(0, 7)}
          </span>
        )}
      </div>

      {/* Event-type breakdown pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: shownTools.length > 0 ? 6 : 0, flexShrink: 0 }}>
        {Object.entries(typeCounts).map(([type, count]) => (
          <span
            key={type}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              background: THEME.border.subtle,
              border: `1px solid ${THEME.border.default}`,
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              color: THEME.text.primary,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: NODE_TYPE_CONFIG[type as NodeEventType]?.color ?? THEME.text.muted,
                flexShrink: 0,
              }}
            />
            {type.replace('subagent-', 'sa-')}: {count}
          </span>
        ))}
      </div>

      {/* Tool names — show more when the node is taller */}
      {shownTools.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, overflow: 'hidden' }}>
          {shownTools.map((tool, i) => (
            <span
              key={i}
              style={{
                background: THEME.border.subtle,
                border: `1px solid ${THEME.border.default}`,
                color: THEME.text.primary,
                borderRadius: 4,
                padding: '1px 5px',
                fontSize: 10,
              }}
            >
              {tool}
            </span>
          ))}
          {extraTools > 0 && (
            <span style={{ color: THEME.text.secondary, fontSize: 10 }}>+{extraTools}</span>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: THEME.border.strong, width: 8, height: 8 }}
      />
    </div>
  );
}

export const CollapsedNode = memo(CollapsedNodeComponent);
