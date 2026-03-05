import type { NodeEventType } from '../types/trace';

export interface NodeTypeStyle {
  label: string;
  shortLabel: string;
  color: string;
  bg: string;
  border: string;
  text: string;
}

export const NODE_TYPE_CONFIG: Record<NodeEventType, NodeTypeStyle> = {
  user: {
    label: 'USER',
    shortLabel: 'USER',
    color: '#60a5fa',
    bg: '#0f1d33',
    border: '#60a5fa',
    text: '#60a5fa',
  },
  assistant: {
    label: 'ASSISTANT',
    shortLabel: 'ASST',
    color: '#4ade80',
    bg: '#0a1f14',
    border: '#4ade80',
    text: '#4ade80',
  },
  'tool-call': {
    label: 'TOOL',
    shortLabel: 'TOOL',
    color: '#fb923c',
    bg: '#1a1008',
    border: '#fb923c',
    text: '#fb923c',
  },
  'task-call': {
    label: 'TASK',
    shortLabel: 'TASK',
    color: '#2dd4bf',
    bg: '#0a1a18',
    border: '#2dd4bf',
    text: '#2dd4bf',
  },
  'subagent-user': {
    label: 'SUBAGENT USER',
    shortLabel: 'SA-U',
    color: '#c084fc',
    bg: '#170f24',
    border: '#c084fc',
    text: '#c084fc',
  },
  'subagent-assistant': {
    label: 'SUBAGENT',
    shortLabel: 'SA-A',
    color: '#a5b4fc',
    bg: '#0f1226',
    border: '#a5b4fc',
    text: '#a5b4fc',
  },
  'hook-progress': {
    label: 'HOOK',
    shortLabel: 'HOOK',
    color: '#78716c',
    bg: '#1a1a18',
    border: '#78716c',
    text: '#a8a29e',
  },
  summary: {
    label: 'SUMMARY',
    shortLabel: 'SUM',
    color: '#a8a29e',
    bg: '#1a1a18',
    border: '#a8a29e',
    text: '#a8a29e',
  },
};
