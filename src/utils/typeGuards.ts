import type { TraceNodeData, ToolNodeData, TaskNodeData, CollapsedNodeData } from '../types/trace';

export function isTraceNodeData(data: Record<string, unknown>): data is TraceNodeData {
  return 'event' in data && 'eventType' in data && !('assistantEvent' in data);
}

export function isToolNodeData(data: Record<string, unknown>): data is ToolNodeData {
  return 'eventType' in data && data.eventType === 'tool-call' && 'assistantEvent' in data;
}

export function isTaskNodeData(data: Record<string, unknown>): data is TaskNodeData {
  return 'eventType' in data && data.eventType === 'task-call' && 'assistantEvent' in data;
}

export function isCollapsedNodeData(data: Record<string, unknown>): data is CollapsedNodeData {
  return 'chainId' in data && 'events' in data;
}
