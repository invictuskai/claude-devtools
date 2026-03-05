import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type ReactFlowInstance,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { SessionData, TraceNodeData, ToolNodeData, TaskNodeData, CollapsedNodeData } from '../types/trace';
import { buildGraph, layoutGraph, mergeToolCallNodes } from '../utils/buildGraph';
import { collapseGraph, type AnyFlowNode } from '../utils/collapseGraph';
import { NODE_TYPE_CONFIG } from '../constants/nodeTypeConfig';
import { isCollapsedNodeData } from '../utils/typeGuards';
import { TraceNode, type TraceFlowNode } from './TraceNode';
import { CollapsedNode } from './CollapsedNode';
import { ToolNode } from './ToolNode';
import { TaskNode } from './TaskNode';
import { NodeDetail } from './NodeDetail';
import { LinearTracePanel } from './LinearTracePanel';
import { SearchPanel } from './SearchPanel';
import { THEME } from '../constants/theme';

const nodeTypes = {
  traceNode: TraceNode,
  collapsedNode: CollapsedNode,
  toolNode: ToolNode,
  taskNode: TaskNode,
};

interface Props {
  sessionData: SessionData | null;
  loading: boolean;
}


export function DAGView({ sessionData, loading }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<AnyFlowNode> | null>(null);
  const [selectedChain, setSelectedChain] = useState<CollapsedNodeData | null>(null);
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);
  const [directSelectedData, setDirectSelectedData] = useState<TraceNodeData | ToolNodeData | TaskNodeData | null>(null);

  const [stats, setStats] = useState<{
    total: number;
    chains: number;
    junctions: number;
    byType: Record<string, number>;
  }>({ total: 0, chains: 0, junctions: 0, byType: {} });

  useEffect(() => {
    if (!sessionData) {
      setNodes([]);
      setEdges([]);
      setSelectedChain(null);
      setSelectedEventIndex(null);
      setDirectSelectedData(null);
      setStats({ total: 0, chains: 0, junctions: 0, byType: {} });
      return;
    }

    const { nodes: rawNodes, edges: rawEdges } = buildGraph(sessionData);
    const { nodes: mergedNodes, edges: mergedEdges } = mergeToolCallNodes(rawNodes, rawEdges);
    const { nodes: collapsedNodes, edges: collapsedEdges } = collapseGraph(mergedNodes, mergedEdges);
    const { nodes: layouted, edges: layoutedEdges } = layoutGraph(collapsedNodes, collapsedEdges);

    // Stats from merged nodes (after tool/task merge, before collapse)
    // This gives an accurate picture of what the user sees in the DAG.
    const byType: Record<string, number> = {};
    mergedNodes.forEach(n => {
      const t = (n.data as TraceNodeData | ToolNodeData | TaskNodeData).eventType;
      byType[t] = (byType[t] || 0) + 1;
    });

    const chainCount = collapsedNodes.filter(n => n.type === 'collapsedNode').length;
    const junctionCount = collapsedNodes.filter(n => n.type === 'traceNode').length;

    setNodes(layouted);
    setEdges(layoutedEdges);
    setSelectedChain(null);
    setSelectedEventIndex(null);
    setDirectSelectedData(null);
    setStats({ total: mergedNodes.length, chains: chainCount, junctions: junctionCount, byType });
  }, [sessionData, setNodes, setEdges]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type === 'collapsedNode') {
      setSelectedChain(node.data as CollapsedNodeData);
      setSelectedEventIndex(null);
      setDirectSelectedData(null);
    } else if (node.type === 'toolNode') {
      setDirectSelectedData(node.data as ToolNodeData);
      setSelectedChain(null);
      setSelectedEventIndex(null);
    } else if (node.type === 'taskNode') {
      setDirectSelectedData(node.data as TaskNodeData);
      setSelectedChain(null);
      setSelectedEventIndex(null);
    } else {
      setDirectSelectedData(node.data as TraceNodeData);
      setSelectedChain(null);
      setSelectedEventIndex(null);
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedChain(null);
    setSelectedEventIndex(null);
    setDirectSelectedData(null);
  }, []);

  const handleSelectEvent = useCallback((i: number) => {
    setSelectedEventIndex(i);
  }, []);

  const handleCloseLinearPanel = useCallback(() => {
    setSelectedChain(null);
    setSelectedEventIndex(null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedEventIndex(null);
    setDirectSelectedData(null);
  }, []);

  const handleSearchSelect = useCallback((nodeId: string, eventIndex?: number) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Set selection state
    if (node.type === 'collapsedNode') {
      const chainData = node.data as CollapsedNodeData;
      setSelectedChain(chainData);
      setSelectedEventIndex(eventIndex ?? null);
      setDirectSelectedData(null);
    } else if (node.type === 'toolNode') {
      setDirectSelectedData(node.data as ToolNodeData);
      setSelectedChain(null);
      setSelectedEventIndex(null);
    } else if (node.type === 'taskNode') {
      setDirectSelectedData(node.data as TaskNodeData);
      setSelectedChain(null);
      setSelectedEventIndex(null);
    } else {
      setDirectSelectedData(node.data as TraceNodeData);
      setSelectedChain(null);
      setSelectedEventIndex(null);
    }

    // Mark node as selected in ReactFlow
    setNodes(nds => nds.map(n => ({ ...n, selected: n.id === nodeId })));

    // Zoom to node
    rfInstance?.fitView({ nodes: [{ id: nodeId }], duration: 300, padding: 0.5 });
  }, [nodes, rfInstance, setNodes]);

  // Derived: what to show in NodeDetail
  const detailData: TraceNodeData | ToolNodeData | TaskNodeData | null =
    selectedChain && selectedEventIndex !== null
      ? (selectedChain.events[selectedEventIndex] ?? null)
      : directSelectedData;

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.loadingSpinner} />
        <span style={{ color: THEME.text.secondary, marginTop: 12, fontSize: 13 }}>Loading trace…</span>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div style={styles.center}>
        <div style={styles.emptyIcon}>◈</div>
        <span style={styles.emptyText}>Select a session to visualize its trace DAG</span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Stats bar */}
      <div style={styles.statsBar}>
        <span style={styles.statsTotal}>{stats.total} events</span>
        <span style={{ fontSize: 11, color: THEME.text.secondary }}>
          {stats.chains} chains · {stats.junctions} junctions
        </span>
        {Object.entries(stats.byType).map(([type, count]) => (
          <span key={type} style={styles.statsBadge}>
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: NODE_TYPE_CONFIG[type as import('../types/trace').NodeEventType]?.color || THEME.text.muted,
                marginRight: 4,
              }}
            />
            {type}: {count}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: THEME.text.secondary, fontSize: 11, fontFamily: 'monospace' }}>
          {sessionData.sessionId.slice(0, 16)}…
        </span>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SearchPanel nodes={nodes} onSelectNode={handleSearchSelect} />
        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={setRfInstance}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
            minZoom={0.05}
            maxZoom={3}
            style={{ background: THEME.bg.canvas }}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ style: { stroke: THEME.border.strong } }}
          >
            <Background color={THEME.border.subtle} gap={24} size={1} />
            <Controls
              style={{ background: THEME.bg.elevated, border: `1px solid ${THEME.border.default}` }}
            />
            <MiniMap
              style={{ background: THEME.bg.elevated, border: `1px solid ${THEME.border.default}` }}
              nodeColor={(n) => {
                if (n.type === 'collapsedNode') return THEME.border.strong;
                const data = n.data as TraceNodeData | ToolNodeData | TaskNodeData;
                return NODE_TYPE_CONFIG[data?.eventType]?.color || THEME.text.muted;
              }}
              maskColor="rgba(10,14,26,0.7)"
            />
          </ReactFlow>
        </div>

        {selectedChain && (
          <LinearTracePanel
            events={selectedChain.events}
            selectedIndex={selectedEventIndex}
            onSelectEvent={handleSelectEvent}
            onClose={handleCloseLinearPanel}
          />
        )}

        {detailData && (
          <NodeDetail data={detailData} onClose={handleCloseDetail} />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: THEME.bg.app,
  },
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 16px',
    background: THEME.bg.elevated,
    borderBottom: `1px solid ${THEME.border.subtle}`,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    flexShrink: 0,
  },
  statsTotal: {
    fontSize: 12,
    fontWeight: 700,
    color: THEME.text.primary,
  },
  statsBadge: {
    fontSize: 11,
    color: THEME.text.primary,
    display: 'flex',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: THEME.bg.app,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.3,
  },
  emptyText: {
    color: THEME.text.secondary,
    fontSize: 14,
  },
  loadingSpinner: {
    width: 32,
    height: 32,
    border: `3px solid ${THEME.border.subtle}`,
    borderTop: `3px solid ${THEME.accent.blue}`,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
