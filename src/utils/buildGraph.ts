import type { Edge } from '@xyflow/react';
import type { TraceFlowNode } from '../components/TraceNode';
import type { ToolFlowNode } from '../components/ToolNode';
import type { TaskFlowNode } from '../components/TaskNode';
import type { TraceEvent, ContentBlock, TraceNodeData, ToolNodeData, TaskNodeData, ToolCall, NodeEventType, SessionData } from '../types/trace';

export type GraphNode = TraceFlowNode | ToolFlowNode | TaskFlowNode;

const NODE_WIDTH = 260;
const NODE_HEIGHT = 140;

/**
 * Deduplicate streaming intermediate assistant events.
 *
 * A single Claude API response produces multiple assistant events chained via
 * parentUuid, sharing the same requestId. Only the last event in each chain
 * has the complete content (stop_reason != null, output_tokens > 1). The
 * intermediates have output_tokens === 1 and partial content.
 *
 * Strategy:
 * 1. Group assistant events by requestId (if available).
 * 2. For each group with >1 events, keep only the final event.
 * 3. Re-parent the final event to the chain root's parent.
 * 4. Remap any orphaned parentUuid references pointing to skipped events.
 *
 * Fallback: if requestId is unavailable, detect intermediates by
 * output_tokens <= 1 + stop_reason being null, chained to another assistant.
 */
function deduplicateStreamingEvents(events: TraceEvent[]): TraceEvent[] {
  const byUuid = new Map<string, TraceEvent>();
  for (const e of events) {
    if (e.uuid) byUuid.set(e.uuid, e);
  }

  // Group assistant events by requestId
  const byRequestId = new Map<string, TraceEvent[]>();
  const assistantsWithoutReqId: TraceEvent[] = [];

  for (const e of events) {
    if (e.type !== 'assistant') continue;
    const rid = e.requestId;
    if (rid) {
      if (!byRequestId.has(rid)) byRequestId.set(rid, []);
      byRequestId.get(rid)!.push(e);
    } else {
      assistantsWithoutReqId.push(e);
    }
  }

  const skipSet = new Set<string>();
  const reparentMap = new Map<string, string | null>(); // final uuid → new parentUuid

  // Process requestId groups
  for (const [, group] of byRequestId) {
    if (group.length <= 1) continue;
    deduplicateGroup(group, skipSet, reparentMap);
  }

  // Fallback: detect chains without requestId
  // An assistant is "intermediate" if output_tokens <= 1 and stop_reason is null
  const handledUuids = new Set<string>();
  for (const [, group] of byRequestId) {
    for (const e of group) {
      if (e.uuid) handledUuids.add(e.uuid);
    }
  }

  // Build parent→children map for fallback chain detection
  const childrenOf = new Map<string, TraceEvent[]>();
  for (const e of assistantsWithoutReqId) {
    if (!e.parentUuid) continue;
    if (!childrenOf.has(e.parentUuid)) childrenOf.set(e.parentUuid, []);
    childrenOf.get(e.parentUuid)!.push(e);
  }

  function isIntermediate(e: TraceEvent): boolean {
    if (e.type !== 'assistant') return false;
    const tokens = e.message?.usage?.output_tokens ?? e.message?.output_tokens ?? -1;
    const stopReason = e.message?.stop_reason;
    return tokens <= 1 && !stopReason;
  }

  // Walk chains: find roots of intermediate chains (whose parent is not an intermediate assistant)
  const fallbackVisited = new Set<string>();
  for (const e of assistantsWithoutReqId) {
    if (!e.uuid || handledUuids.has(e.uuid) || fallbackVisited.has(e.uuid)) continue;
    if (!isIntermediate(e)) continue;

    // Check if parent is also an intermediate → skip, we'll find the root
    if (e.parentUuid && byUuid.has(e.parentUuid)) {
      const parent = byUuid.get(e.parentUuid)!;
      if (parent.type === 'assistant' && isIntermediate(parent) && !handledUuids.has(parent.uuid!)) {
        continue; // Not a root, will be found from actual root
      }
    }

    // This is a chain root. Walk down to find the chain.
    const chain: TraceEvent[] = [e];
    fallbackVisited.add(e.uuid);
    let current = e;
    while (true) {
      const children = (childrenOf.get(current.uuid!) ?? [])
        .filter(c => c.type === 'assistant' && c.uuid && !fallbackVisited.has(c.uuid));
      if (children.length !== 1) break;
      const next = children[0];
      chain.push(next);
      fallbackVisited.add(next.uuid!);
      current = next;
    }

    // Also check if the last element has a non-intermediate child
    const lastChildren = (childrenOf.get(current.uuid!) ?? [])
      .filter(c => c.type === 'assistant' && c.uuid && !fallbackVisited.has(c.uuid) && !isIntermediate(c));
    if (lastChildren.length === 1) {
      chain.push(lastChildren[0]);
      fallbackVisited.add(lastChildren[0].uuid!);
    }

    if (chain.length > 1) {
      deduplicateGroup(chain, skipSet, reparentMap);
    }
  }

  // Build result: filter skipped events and remap parent pointers
  const result: TraceEvent[] = [];
  for (const event of events) {
    if (event.uuid && skipSet.has(event.uuid)) continue;

    let { parentUuid } = event;

    // Apply explicit reparent for final events in dedup groups
    if (event.uuid && reparentMap.has(event.uuid)) {
      parentUuid = reparentMap.get(event.uuid) ?? null;
    }

    // Walk up through skipped parents to find the nearest surviving ancestor
    while (parentUuid && skipSet.has(parentUuid)) {
      const skippedEvent = byUuid.get(parentUuid);
      parentUuid = skippedEvent?.parentUuid ?? null;
    }

    if (parentUuid !== event.parentUuid) {
      result.push({ ...event, parentUuid });
    } else {
      result.push(event);
    }
  }

  return result;
}

function deduplicateGroup(
  group: TraceEvent[],
  skipSet: Set<string>,
  reparentMap: Map<string, string | null>
): void {
  // Score events: higher = more likely to be the final event
  const score = (e: TraceEvent): number => {
    if (e.message?.stop_reason) return Infinity;
    return e.message?.usage?.output_tokens ?? e.message?.output_tokens ?? 0;
  };

  const sorted = [...group].sort((a, b) => score(b) - score(a));
  const final = sorted[0];

  // Find the chain root: the event whose parent is NOT in this group
  const groupUuids = new Set(group.map(e => e.uuid).filter(Boolean) as string[]);
  const chainRoot = group.find(e => !e.parentUuid || !groupUuids.has(e.parentUuid));

  // Mark all non-final events as skipped
  for (const e of group) {
    if (e === final) continue;
    if (e.uuid) skipSet.add(e.uuid);
  }

  // Re-parent final to chain root's parent (skip over all intermediates)
  if (final.uuid && chainRoot && chainRoot !== final) {
    reparentMap.set(final.uuid, chainRoot.parentUuid ?? null);
  }
}

function extractPreview(content: string | ContentBlock[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content.slice(0, 200);

  const texts = content
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join(' ')
    .trim();

  if (texts) return texts.slice(0, 200);

  // Fallback: check for tool_result content
  const results = content.filter(b => b.type === 'tool_result');
  if (results.length > 0) {
    const first = results[0];
    const c = first.content;
    if (typeof c === 'string') return c.slice(0, 200);
  }

  // Fallback: thinking blocks
  const thinking = content.filter(b => b.type === 'thinking');
  if (thinking.length > 0) {
    return thinking.map(b => b.thinking || '').join(' ').trim().slice(0, 200);
  }

  // Fallback: tool_use names (assistant turns with only tool calls)
  const toolUses = content.filter(b => b.type === 'tool_use');
  if (toolUses.length > 0) {
    return toolUses.map(b => b.name || 'tool').join(', ');
  }

  return '';
}

function extractTools(content: string | ContentBlock[] | undefined): string[] {
  if (!content || typeof content === 'string') return [];
  return content.filter(b => b.type === 'tool_use').map(b => b.name || 'unknown');
}

function classifyEvent(event: TraceEvent): NodeEventType {
  if (event.type === 'user') return 'user';
  if (event.type === 'assistant') return 'assistant';
  if (event.type === 'summary') return 'summary';
  if (event.type === 'system' && event.data?.type === 'compact_boundary') return 'summary'; // render as summary-like

  if (event.type === 'progress') {
    const dataType = event.data?.type;
    if (dataType === 'hook_progress') return 'hook-progress';
    const inner = event.data?.message;
    if (inner?.type === 'user') return 'subagent-user';
    if (inner?.type === 'assistant') return 'subagent-assistant';
  }
  return 'user'; // fallback
}

export function buildGraph(sessionData: SessionData): { nodes: TraceFlowNode[]; edges: Edge[] } {
  // Pre-process: deduplicate streaming intermediate assistant events
  const dedupedEvents = deduplicateStreamingEvents(sessionData.events);

  const nodes: TraceFlowNode[] = [];
  const edges: Edge[] = [];
  const seenIds = new Set<string>();

  function addEvent(event: TraceEvent) {
    // Summary events have no uuid — generate a synthetic one
    if (!event.uuid && event.type === 'summary') {
      const syntheticUuid = `summary-${event.leafUuid ?? event.timestamp ?? Math.random().toString(36).slice(2)}`;
      event = { ...event, uuid: syntheticUuid, parentUuid: event.leafUuid ?? event.parentUuid };
    }

    if (!event.uuid) return;
    if (seenIds.has(event.uuid)) return;
    seenIds.add(event.uuid);

    const eventType = classifyEvent(event);

    // Skip non-meaningful events (but keep system:compact_boundary for graph continuity)
    if (event.type === 'file-history-snapshot' || event.type === 'queue-operation') return;
    if (event.type === 'system') {
      // Keep compact_boundary events — they bridge the gap across context compressions
      if (event.data?.type !== 'compact_boundary') return;
      // Use logicalParentUuid when parentUuid is null
      if (!event.parentUuid && event.logicalParentUuid) {
        event = { ...event, parentUuid: event.logicalParentUuid };
      }
    }

    // Skip progress events that aren't subagent turns or hooks (e.g. bash_progress,
    // mcp_progress, query_update, search_results_received). These are side-effect
    // indicators, not conversation turns — they create phantom nodes that break
    // chain collapsing by adding extra out-edges to their parent.
    if (event.type === 'progress' && eventType === 'user') return;

    // For agent_progress events, use the agentId as subagentId
    const subagentId = event.type === 'progress' && event.data?.agentId
      ? event.data.agentId
      : undefined;

    let preview = '';
    let tools: string[] = [];

    if (event.type === 'user' || event.type === 'assistant') {
      preview = extractPreview(event.message?.content);
      tools = extractTools(event.message?.content);
    } else if (event.type === 'progress' && event.data?.message) {
      const inner = event.data.message;
      preview = extractPreview(inner.message?.content);
      tools = extractTools(inner.message?.content);
    } else if (event.type === 'progress' && event.data?.type === 'hook_progress') {
      const hookName = event.data.hookName ?? '';
      const hookEvent = event.data.hookEvent ?? '';
      preview = [hookName, hookEvent].filter(Boolean).join(': ');
    } else if (event.type === 'summary') {
      // Summary events store text in event.summary (not event.message.content)
      preview = typeof event.summary === 'string' ? event.summary.slice(0, 200) : '';
      if (!preview && event.message) {
        preview = extractPreview(event.message.content);
      }
    } else if (event.type === 'system' && event.data?.type === 'compact_boundary') {
      preview = 'Context compression boundary';
    }

    // Detect special event flags
    const isApiError = event.type === 'assistant' && event.isApiErrorMessage === true;
    const isCompactSummary = event.type === 'user' && event.isCompactSummary === true;
    const isSidechain = event.isSidechain === true;

    const uuid = event.uuid!;
    nodes.push({
      id: uuid,
      type: 'traceNode' as const,
      data: {
        eventType,
        preview,
        tools,
        agentId: event.agentId,
        timestamp: event.timestamp,
        event,
        subagentId,
        isApiError: isApiError || undefined,
        isCompactSummary: isCompactSummary || undefined,
        isSidechain: isSidechain || undefined,
      },
      position: { x: 0, y: 0 },
    });

    if (event.parentUuid) {
      edges.push({
        id: `e-${event.parentUuid}-${uuid}`,
        source: event.parentUuid,
        target: uuid,
        type: 'smoothstep',
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as const, color: '#94a3b8' },
      });
    }
  }

  // Add main session events (including progress events that represent subagent turns)
  // Subagent JSONL files are not added separately — progress events already contain
  // the subagent conversation and are connected to the main graph via parentUuid.
  // Events are pre-processed to deduplicate streaming intermediates.
  for (const event of dedupedEvents) {
    addEvent(event);
  }

  return { nodes, edges };
}

function getNodeContentBlocks(node: TraceFlowNode): ContentBlock[] {
  const event = node.data.event;
  let content: string | ContentBlock[] | undefined;
  if (event.type === 'user' || event.type === 'assistant') {
    content = event.message?.content;
  } else if (event.type === 'progress' && event.data?.message) {
    content = event.data.message.message?.content;
  }
  if (!content || typeof content === 'string') return [];
  return content;
}

function nodeHasToolUse(node: TraceFlowNode): boolean {
  return getNodeContentBlocks(node).some(b => b.type === 'tool_use');
}

function nodeHasToolResult(node: TraceFlowNode): boolean {
  return getNodeContentBlocks(node).some(b => b.type === 'tool_result');
}

function collectToolCalls(assistantNode: TraceFlowNode, userNode: TraceFlowNode): ToolCall[] {
  const assistantBlocks = getNodeContentBlocks(assistantNode);
  const userBlocks = getNodeContentBlocks(userNode);
  const toolUses = assistantBlocks.filter(b => b.type === 'tool_use');
  const toolResults = userBlocks.filter(b => b.type === 'tool_result');

  return toolUses.map(use => {
    const result = toolResults.find(r => r.tool_use_id === use.id);
    let resultText: string | undefined;
    if (result) {
      const c = result.content;
      if (typeof c === 'string') resultText = c;
      else if (Array.isArray(c)) {
        resultText = c.filter(b => b.type === 'text').map(b => b.text || '').join('\n');
      }
    }
    return {
      id: use.id ?? '',
      name: use.name ?? 'unknown',
      input: use.input ?? {},
      result: resultText,
    };
  });
}

export function mergeToolCallNodes(
  rawNodes: TraceFlowNode[],
  rawEdges: Edge[]
): { nodes: GraphNode[]; edges: Edge[] } {
  const nodeMap = new Map(rawNodes.map(n => [n.id, n]));
  const nodeIds = new Set(rawNodes.map(n => n.id));

  const outEdges = new Map<string, string[]>();
  for (const n of rawNodes) outEdges.set(n.id, []);
  for (const e of rawEdges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      outEdges.get(e.source)!.push(e.target);
    }
  }

  const toRemove = new Set<string>();
  const nodeRemap = new Map<string, string>();
  const mergedNodes: (ToolFlowNode | TaskFlowNode)[] = [];

  for (const node of rawNodes) {
    if (toRemove.has(node.id)) continue;
    const et = node.data.eventType;
    if (et !== 'assistant' && et !== 'subagent-assistant') continue;
    if (!nodeHasToolUse(node)) continue;

    // Find the tool-result child among all children (there may also be progress event children)
    const allChildren = outEdges.get(node.id) ?? [];
    const childId = allChildren.find(cid => {
      if (toRemove.has(cid)) return false;
      const child = nodeMap.get(cid);
      if (!child) return false;
      const cet = child.data.eventType;
      return (cet === 'user' || cet === 'subagent-user') && nodeHasToolResult(child);
    });
    if (!childId) continue;
    const childNode = nodeMap.get(childId)!;

    let toolCalls = collectToolCalls(node, childNode);
    const nodesToAbsorb: string[] = [];

    // Detect parallel/rapid-fire tool calls: when Claude fires multiple tool_use
    // in rapid succession, each is a separate assistant event whose parentUuid
    // points to the previous assistant. We absorb them all into one merged node.
    const parallelStack = allChildren.filter(cid => {
      if (cid === childId || toRemove.has(cid)) return false;
      const child = nodeMap.get(cid);
      if (!child) return false;
      const cet = child.data.eventType;
      return (cet === 'assistant' || cet === 'subagent-assistant') && nodeHasToolUse(child);
    });

    while (parallelStack.length > 0) {
      const parId = parallelStack.pop()!;
      if (toRemove.has(parId) || nodesToAbsorb.includes(parId)) continue;
      const parNode = nodeMap.get(parId);
      if (!parNode) continue;

      const parChildren = outEdges.get(parId) ?? [];
      const parResultId = parChildren.find(cid => {
        if (toRemove.has(cid)) return false;
        const child = nodeMap.get(cid);
        if (!child) return false;
        const cet = child.data.eventType;
        return (cet === 'user' || cet === 'subagent-user') && nodeHasToolResult(child);
      });

      if (parResultId) {
        const parResultNode = nodeMap.get(parResultId)!;
        toolCalls = [...toolCalls, ...collectToolCalls(parNode, parResultNode)];
        nodesToAbsorb.push(parId, parResultId);

        // Follow nested parallel chains (A1→A2→A3 rapid-fire)
        for (const cid of parChildren) {
          if (cid === parResultId || toRemove.has(cid)) continue;
          const child = nodeMap.get(cid);
          if (!child) continue;
          const cet = child.data.eventType;
          if ((cet === 'assistant' || cet === 'subagent-assistant') && nodeHasToolUse(child)) {
            parallelStack.push(cid);
          }
        }
      }
    }

    const isTaskCall = toolCalls.some(t => t.name === 'Task');

    if (isTaskCall) {
      // Find spawned subagent ID from progress children with data.agentId
      const spawnedSubagentId = allChildren
        .map(cid => nodeMap.get(cid))
        .filter(n => n?.data.event.type === 'progress' && n.data.event.data?.agentId)
        .map(n => n!.data.event.data!.agentId)[0];

      const taskTool = toolCalls.find(t => t.name === 'Task')!;
      const taskDescription = String(
        taskTool.input.description ?? taskTool.input.prompt ?? taskTool.input.task ?? ''
      );
      const subagentType = taskTool.input.subagent_type
        ? String(taskTool.input.subagent_type)
        : undefined;

      const taskNodeId = `task-${node.id}`;
      const taskNodeData: TaskNodeData = {
        eventType: 'task-call',
        tools: toolCalls,
        preview: taskDescription.slice(0, 120),
        taskDescription,
        subagentType,
        spawnedSubagentId,
        agentId: node.data.agentId,
        timestamp: node.data.timestamp,
        assistantEvent: node.data.event,
        userEvent: childNode.data.event,
        subagentId: node.data.subagentId,
      };

      mergedNodes.push({
        id: taskNodeId,
        type: 'taskNode' as const,
        data: taskNodeData,
        position: { x: 0, y: 0 },
      } as TaskFlowNode);

      toRemove.add(node.id);
      toRemove.add(childId);
      nodeRemap.set(node.id, taskNodeId);
      nodeRemap.set(childId, taskNodeId);
      for (const absId of nodesToAbsorb) {
        toRemove.add(absId);
        nodeRemap.set(absId, taskNodeId);
      }
    } else {
      const toolNodeId = `tool-${node.id}`;
      const toolNodeData: ToolNodeData = {
        eventType: 'tool-call',
        tools: toolCalls,
        preview: toolCalls.map(t => t.name).join(', '),
        agentId: node.data.agentId,
        timestamp: node.data.timestamp,
        assistantEvent: node.data.event,
        userEvent: childNode.data.event,
        subagentId: node.data.subagentId,
      };

      mergedNodes.push({
        id: toolNodeId,
        type: 'toolNode' as const,
        data: toolNodeData,
        position: { x: 0, y: 0 },
      } as ToolFlowNode);

      toRemove.add(node.id);
      toRemove.add(childId);
      nodeRemap.set(node.id, toolNodeId);
      nodeRemap.set(childId, toolNodeId);
      for (const absId of nodesToAbsorb) {
        toRemove.add(absId);
        nodeRemap.set(absId, toolNodeId);
      }
    }
  }

  const outputNodes: GraphNode[] = [
    ...rawNodes.filter(n => !toRemove.has(n.id)),
    ...mergedNodes,
  ];

  const seenEdges = new Set<string>();
  const outputEdges: Edge[] = [];

  for (const e of rawEdges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    const src = nodeRemap.get(e.source) ?? e.source;
    const tgt = nodeRemap.get(e.target) ?? e.target;
    if (src === tgt) continue;
    const key = `${src}->${tgt}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    outputEdges.push({ ...e, id: `te-${src}-${tgt}`, source: src, target: tgt });
  }

  return { nodes: outputNodes, edges: outputEdges };
}

const LANE_STRIDE = NODE_WIDTH + 40;
const NODE_STEP = 180;
const MARGIN_X = 40;
const MARGIN_Y = 40;
const NODE_GAP = 40;       // vertical gap between nodes in the same lane

function getNodeTimestamp(data: Record<string, unknown>): number {
  const ts = data.timestamp;
  if (typeof ts === 'string') {
    const t = new Date(ts).getTime();
    if (!isNaN(t)) return t;
  }
  const events = data.events as Array<{ timestamp?: string }> | undefined;
  if (events) {
    for (const ev of events) {
      if (ev.timestamp) {
        const t = new Date(ev.timestamp).getTime();
        if (!isNaN(t)) return t;
      }
    }
  }
  return 0;
}

function isSubagentType(data: Record<string, unknown>): boolean {
  const events = data.events as Array<{ eventType?: string }> | undefined;
  if (events && events.length > 0) {
    const et = events[0].eventType ?? '';
    return et === 'subagent-user' || et === 'subagent-assistant';
  }
  const et = data.eventType as string | undefined;
  return et === 'subagent-user' || et === 'subagent-assistant';
}

/** Estimate the rendered height of a node based on its type and content */
function estimateNodeHeight(node: { type?: string; data: Record<string, unknown> }): number {
  if (node.type === 'collapsedNode') {
    const events = node.data.events as Array<Record<string, unknown>> | undefined;
    const count = events?.length ?? 0;
    // Count distinct event types for type pills
    const typeSet = new Set<string>();
    const toolSet = new Set<string>();
    if (events) {
      for (const ev of events) {
        if (ev.eventType) typeSet.add(ev.eventType as string);
        const tools = ev.tools as string[] | undefined;
        if (tools) for (const t of tools) toolSet.add(t);
      }
    }
    // Header (count badge): 28px, type pills: ~22px per row of 3, tool names: ~22px per row of 3
    const typePillRows = Math.ceil(typeSet.size / 3);
    const maxToolsShown = Math.min(toolSet.size, 6);
    const toolRows = Math.ceil(maxToolsShown / 3);
    const estimated = 36 + typePillRows * 22 + toolRows * 22 + 16;
    return Math.max(80, Math.min(estimated, 200));
  }

  if (node.type === 'taskNode') {
    // Task nodes: header + description (3 lines) + result preview + timestamp
    return NODE_HEIGHT;
  }

  if (node.type === 'toolNode') {
    const tools = node.data.tools as unknown[] | undefined;
    const toolCount = tools?.length ?? 1;
    // Header + tool badges (wrapping) + result + timestamp
    const badgeRows = Math.ceil(Math.min(toolCount, 4) / 3);
    return Math.max(NODE_HEIGHT, 80 + badgeRows * 22);
  }

  // TraceNode: header + preview (3 lines) + tools + timestamp
  const tools = node.data.tools as string[] | undefined;
  if (tools && tools.length > 0) {
    const badgeRows = Math.ceil(Math.min(tools.length, 4) / 3);
    return Math.max(NODE_HEIGHT, 90 + badgeRows * 22);
  }
  return NODE_HEIGHT;
}

export function layoutGraph<T extends {
  id: string;
  type?: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
}>(
  nodes: T[],
  edges: Edge[]
): { nodes: T[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const nodeIds = new Set(nodes.map(n => n.id));

  // Build directed adjacency
  const inEdges = new Map<string, string[]>();
  const outEdges = new Map<string, string[]>();
  for (const n of nodes) {
    inEdges.set(n.id, []);
    outEdges.set(n.id, []);
  }
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      outEdges.get(e.source)!.push(e.target);
      inEdges.get(e.target)!.push(e.source);
    }
  }

  // ── Connected component detection (undirected) ──────────────────────────
  const componentOf = new Map<string, number>();
  let numComponents = 0;
  for (const startNode of nodes) {
    if (componentOf.has(startNode.id)) continue;
    const comp = numComponents++;
    const stack = [startNode.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (componentOf.has(id)) continue;
      componentOf.set(id, comp);
      for (const nb of [...(outEdges.get(id) ?? []), ...(inEdges.get(id) ?? [])]) {
        if (!componentOf.has(nb)) stack.push(nb);
      }
    }
  }

  // Primary component = the one whose earliest-timestamp node is smallest
  const compMinTime = new Map<number, number>();
  for (const node of nodes) {
    const comp = componentOf.get(node.id)!;
    const t = getNodeTimestamp(node.data);
    if (!compMinTime.has(comp) || t < compMinTime.get(comp)!) compMinTime.set(comp, t);
  }
  const primaryComp = [...compMinTime.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? 0;

  const primaryNodes = nodes.filter(n => componentOf.get(n.id) === primaryComp);

  // Group secondary components: Map<compId, T[]>
  const secondaryComps = new Map<number, T[]>();
  for (const node of nodes) {
    const comp = componentOf.get(node.id)!;
    if (comp === primaryComp) continue;
    if (!secondaryComps.has(comp)) secondaryComps.set(comp, []);
    secondaryComps.get(comp)!.push(node);
  }

  // ── Primary component: BFS lane assignment ───────────────────────────────
  const nodeLane = new Map<string, number>();
  const queued = new Set<string>();
  const subagentEdgeKeys = new Set<string>();

  const primaryRoots = primaryNodes.filter(n => (inEdges.get(n.id) ?? []).length === 0);
  const queue: Array<{ id: string; lane: number }> = [];
  for (const r of primaryRoots) {
    queue.push({ id: r.id, lane: 0 });
    queued.add(r.id);
  }
  while (queue.length > 0) {
    const { id, lane } = queue.shift()!;
    if (nodeLane.has(id)) continue;
    nodeLane.set(id, lane);
    const node = nodeMap.get(id);
    const isTask = node?.type === 'taskNode';
    for (const childId of outEdges.get(id) ?? []) {
      if (queued.has(childId)) continue;
      queued.add(childId);
      const childNode = nodeMap.get(childId);
      if (isTask && childNode && isSubagentType(childNode.data)) {
        queue.push({ id: childId, lane: lane + 1 });
        subagentEdgeKeys.add(`${id}->${childId}`);
      } else {
        queue.push({ id: childId, lane });
      }
    }
  }
  for (const n of primaryNodes) {
    if (!nodeLane.has(n.id)) nodeLane.set(n.id, 0);
  }

  const primaryIdSet = new Set(primaryNodes.map(n => n.id));

  // ── DFS order — subagent children before continuation children ─────────────
  // This ensures the subagent subtree is fully placed before the main-lane
  // continuation, so lane 0 can safely advance past all branch lanes.
  const topoOrder: string[] = [];
  const topoVisited = new Set<string>();
  const dfsStack = primaryNodes
    .filter(n => (inEdges.get(n.id) ?? []).length === 0)
    .map(n => n.id);
  while (dfsStack.length > 0) {
    const id = dfsStack.pop()!;
    if (topoVisited.has(id)) continue;
    topoVisited.add(id);
    topoOrder.push(id);
    const children = (outEdges.get(id) ?? []).filter(c => primaryIdSet.has(c) && !topoVisited.has(c));
    const continuationChildren = children.filter(c => !subagentEdgeKeys.has(`${id}->${c}`));
    const subagentChildren = children.filter(c => subagentEdgeKeys.has(`${id}->${c}`));
    // Push continuation first (LIFO → processed last = after subagent subtree)
    for (const c of [...continuationChildren].reverse()) dfsStack.push(c);
    // Push subagent last (LIFO → processed first = before continuation)
    for (const c of [...subagentChildren].reverse()) dfsStack.push(c);
  }
  for (const n of primaryNodes) {
    if (!topoVisited.has(n.id)) topoOrder.push(n.id);
  }

  // ── Primary component: Y positions (subtree layout) ───────────────────────
  // Each lane advances independently. Cross-lane parents cause a lane to skip
  // ahead past its parent's bottom edge. Lane 0 additionally advances past all
  // branch lanes before placing continuation nodes (safe because DFS guarantees
  // the subagent subtree is fully placed before lane-0 continuation).

  const laneCurrentY = new Map<number, number>();
  for (const n of primaryNodes) {
    const lane = nodeLane.get(n.id) ?? 0;
    if (!laneCurrentY.has(lane)) laneCurrentY.set(lane, MARGIN_Y);
  }

  const nodeY = new Map<string, number>();
  const nodeHeightMap = new Map<string, number>();

  for (const id of topoOrder) {
    const lane = nodeLane.get(id) ?? 0;

    // Advance lane Y past any cross-lane parent's bottom edge
    for (const parentId of inEdges.get(id) ?? []) {
      if (!nodeY.has(parentId)) continue;
      if ((nodeLane.get(parentId) ?? 0) === lane) continue;
      const parentBottom = nodeY.get(parentId)! + (nodeHeightMap.get(parentId) ?? NODE_HEIGHT) + NODE_GAP;
      if (parentBottom > (laneCurrentY.get(lane) ?? MARGIN_Y)) laneCurrentY.set(lane, parentBottom);
    }

    // Lane 0: advance past all branch lanes (safe: DFS ensures subagent subtree is fully placed)
    if (lane === 0) {
      for (const [l, y] of laneCurrentY) {
        if (l !== 0 && y > (laneCurrentY.get(0) ?? MARGIN_Y)) laneCurrentY.set(0, y);
      }
    }

    const yTop = laneCurrentY.get(lane) ?? MARGIN_Y;
    nodeY.set(id, yTop);
    const node = nodeMap.get(id);
    const h = node ? estimateNodeHeight(node) : NODE_HEIGHT;
    nodeHeightMap.set(id, h);
    laneCurrentY.set(lane, yTop + h + NODE_GAP);
  }

  // ── Secondary components: horizontal columns, BFS order, fixed height ────
  const maxPrimaryLane = nodeLane.size > 0 ? Math.max(...nodeLane.values()) : 0;
  let nextSecondaryLane = maxPrimaryLane + 1;

  const sortedSecondary = [...secondaryComps.entries()].sort((a, b) => {
    const minA = Math.min(...a[1].map(n => getNodeTimestamp(n.data)));
    const minB = Math.min(...b[1].map(n => getNodeTimestamp(n.data)));
    return minA - minB;
  });

  for (const [, compNodes] of sortedSecondary) {
    const compLane = nextSecondaryLane++;
    const compRoots = compNodes.filter(n => (inEdges.get(n.id) ?? []).length === 0);
    const visited = new Set<string>();
    const order: string[] = [];
    const bfsQ = compRoots.map(n => n.id);
    while (bfsQ.length > 0) {
      const id = bfsQ.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      order.push(id);
      for (const childId of outEdges.get(id) ?? []) {
        if (!visited.has(childId)) bfsQ.push(childId);
      }
    }
    for (const n of compNodes) {
      if (!visited.has(n.id)) order.push(n.id);
    }
    order.forEach((id, rank) => {
      nodeLane.set(id, compLane);
      nodeY.set(id, MARGIN_Y + rank * NODE_STEP);
      nodeHeightMap.set(id, NODE_HEIGHT);
    });
  }

  // ── Position all nodes, carrying nodeHeight in data ──────────────────────
  const positionedNodes = nodes.map(n => ({
    ...n,
    data: { ...n.data, nodeHeight: nodeHeightMap.get(n.id) ?? NODE_HEIGHT },
    position: {
      x: MARGIN_X + (nodeLane.get(n.id) ?? 0) * LANE_STRIDE,
      y: nodeY.get(n.id) ?? MARGIN_Y,
    },
  }));

  // Tag task→subagent edges with sourceHandle so they leave from the right side
  const updatedEdges = edges.map(e => {
    if (subagentEdgeKeys.has(`${e.source}->${e.target}`)) {
      return { ...e, sourceHandle: 'source-right' };
    }
    if (nodeMap.get(e.source)?.type === 'taskNode') {
      return { ...e, sourceHandle: 'source-bottom' };
    }
    return e;
  });

  return { nodes: positionedNodes, edges: updatedEdges };
}
