import type { Edge } from '@xyflow/react';
import type { CollapsedFlowNode } from '../components/CollapsedNode';
import type { CollapsedNodeData, AnyNodeData } from '../types/trace';
import type { GraphNode } from './buildGraph';

export type AnyFlowNode = GraphNode | CollapsedFlowNode;

export function collapseGraph(
  rawNodes: GraphNode[],
  rawEdges: Edge[]
): { nodes: AnyFlowNode[]; edges: Edge[] } {
  if (rawNodes.length === 0) return { nodes: rawNodes, edges: rawEdges };

  const nodeIds = new Set(rawNodes.map(n => n.id));

  // Build adjacency maps (only valid edges)
  const inEdges = new Map<string, string[]>();
  const outEdges = new Map<string, string[]>();
  for (const n of rawNodes) {
    inEdges.set(n.id, []);
    outEdges.set(n.id, []);
  }
  for (const e of rawEdges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    outEdges.get(e.source)!.push(e.target);
    inEdges.get(e.target)!.push(e.source);
  }

  const nodeMap = new Map(rawNodes.map(n => [n.id, n]));

  const isHookProgress = (id: string) =>
    (nodeMap.get(id)?.data as Record<string, unknown>)?.eventType === 'hook-progress';

  // Meaningful out-edges: follow through hook-progress children transitively
  // to find real continuation nodes. E.g. tool-B → hook-H → next-D returns [D].
  const meaningfulOuts = (id: string): string[] => {
    const result: string[] = [];
    const visited = new Set<string>();
    const stack = [...(outEdges.get(id) ?? [])];
    while (stack.length > 0) {
      const cid = stack.pop()!;
      if (visited.has(cid)) continue;
      visited.add(cid);
      if (isHookProgress(cid)) {
        // Follow through: add hook's children to the stack
        for (const grandchild of outEdges.get(cid) ?? []) stack.push(grandchild);
      } else {
        result.push(cid);
      }
    }
    return result;
  };

  // Follow through hook-progress parents to find the real (non-hook) parent.
  // E.g. if parentUuid chain is tool-B → hook-H → node-D, realParent(H) = tool-B.
  const realParent = (id: string): string => {
    let cur = id;
    while (isHookProgress(cur)) {
      const parents = inEdges.get(cur) ?? [];
      if (parents.length !== 1) break;
      cur = parents[0];
    }
    return cur;
  };

  const isLinear = (id: string) => {
    if (nodeMap.get(id)?.type === 'taskNode') return false;
    if (isHookProgress(id)) return false; // hook-progress nodes are absorbed, not chained
    const ins = inEdges.get(id) ?? [];
    const outs = meaningfulOuts(id);
    return ins.length === 1 && outs.length === 1;
  };

  // Walk chains starting from linear nodes whose single real parent is a junction
  const nodeToChain = new Map<string, number>();
  const chains: string[][] = [];

  for (const n of rawNodes) {
    if (!isLinear(n.id)) continue;
    const parentId = inEdges.get(n.id)![0];
    // Follow through hook-progress parents so chains aren't broken by hooks
    const effectiveParentId = isHookProgress(parentId) ? realParent(parentId) : parentId;
    if (isLinear(effectiveParentId)) continue; // real parent is linear, not a chain start
    if (nodeToChain.has(n.id)) continue;

    const members: string[] = [];
    let cur: string = n.id;
    const chainIdx = chains.length;
    chains.push(members);

    while (isLinear(cur) && !nodeToChain.has(cur)) {
      members.push(cur);
      nodeToChain.set(cur, chainIdx);
      const children = meaningfulOuts(cur);
      if (children.length !== 1) break;
      cur = children[0];
    }

    // Include the tail node (leaf with 1 in-edge, 0 out-edges) in the chain
    if (!nodeToChain.has(cur) && !isLinear(cur)) {
      const ins = inEdges.get(cur) ?? [];
      const outs = meaningfulOuts(cur);
      const node = nodeMap.get(cur);
      if (ins.length === 1 && outs.length === 0 && node?.type !== 'taskNode' && !isHookProgress(cur)) {
        members.push(cur);
        nodeToChain.set(cur, chainIdx);
      }
    }
  }

  // Absorb hook-progress nodes into their parent's chain (right after the parent member)
  for (const n of rawNodes) {
    if (!isHookProgress(n.id)) continue;
    if (nodeToChain.has(n.id)) continue;
    const parentIds = inEdges.get(n.id) ?? [];
    for (const parentId of parentIds) {
      const chainIdx = nodeToChain.get(parentId);
      if (chainIdx !== undefined) {
        const insertIdx = chains[chainIdx].lastIndexOf(parentId) + 1;
        chains[chainIdx].splice(insertIdx, 0, n.id);
        nodeToChain.set(n.id, chainIdx);
        break;
      }
    }
  }

  const remapId = (id: string): string => {
    const idx = nodeToChain.get(id);
    return idx !== undefined ? `chain-${idx}` : id;
  };

  // Junction nodes pass through unchanged
  const outputNodes: AnyFlowNode[] = rawNodes.filter(n => !nodeToChain.has(n.id));

  // Add one collapsed node per chain
  for (let i = 0; i < chains.length; i++) {
    const members = chains[i];
    const events: AnyNodeData[] = members
      .map(id => nodeMap.get(id)?.data as AnyNodeData)
      .filter(Boolean);

    const data: CollapsedNodeData = {
      chainId: `chain-${i}`,
      events,
      count: events.length,
      subagentId: events[0]?.subagentId,
    };

    outputNodes.push({
      id: `chain-${i}`,
      type: 'collapsedNode' as const,
      data,
      position: { x: 0, y: 0 },
    } as CollapsedFlowNode);
  }

  // Remap edges, deduplicate, drop self-loops
  const seenEdges = new Set<string>();
  const outputEdges: Edge[] = [];

  for (const e of rawEdges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    const src = remapId(e.source);
    const tgt = remapId(e.target);
    if (src === tgt) continue;
    const key = `${src}->${tgt}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    outputEdges.push({
      id: `ce-${src}-${tgt}`,
      source: src,
      target: tgt,
      type: 'smoothstep',
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      markerEnd: { type: 'arrowclosed' as const, color: '#94a3b8' },
    });
  }

  return { nodes: outputNodes, edges: outputEdges };
}
