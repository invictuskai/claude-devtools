
import type { SSEEvent, MessageState, ContentBlock } from '../types';

export const parseRawSSE = (rawText: string): SSEEvent[] => {
  const lines = rawText.split('\n');
  const events: SSEEvent[] = [];

  let currentEvent: Partial<SSEEvent> = {};

  // Skip potential HTTP headers by looking for the first "event:" or "data:"
  let started = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!started && (line.startsWith('event:') || line.startsWith('data:'))) {
      started = true;
    }

    if (!started) continue;

    if (line === '') {
      // Empty line indicates end of an event block in SSE
      if (currentEvent.event || currentEvent.data) {
        try {
          if (currentEvent.data) {
            currentEvent.parsedData = JSON.parse(currentEvent.data);
          }
        } catch {
          // Keep as string if not JSON
        }
        events.push({
          event: currentEvent.event || 'message',
          data: currentEvent.data || '',
          parsedData: currentEvent.parsedData,
          timestamp: Date.now(),
          id: Math.random().toString(36).substring(7)
        });
        currentEvent = {};
      }
      continue;
    }

    if (line.startsWith('event:')) {
      currentEvent.event = line.replace('event:', '').trim();
    } else if (line.startsWith('data:')) {
      const dataPart = line.replace('data:', '').trim();
      currentEvent.data = (currentEvent.data || '') + dataPart;
    } else if (line.startsWith('id:')) {
      currentEvent.id = line.replace('id:', '').trim();
    }
  }

  // Handle last block if it didn't end with a newline
  if (currentEvent.event || currentEvent.data) {
    try {
      if (currentEvent.data) {
        currentEvent.parsedData = JSON.parse(currentEvent.data);
      }
    } catch { /* not JSON */ }
    events.push({
      event: currentEvent.event || 'message',
      data: currentEvent.data || '',
      parsedData: currentEvent.parsedData,
      timestamp: Date.now(),
      id: Math.random().toString(36).substring(7)
    });
  }

  return events;
};

export const reconstructMessage = (events: SSEEvent[]): MessageState => {
  const state: MessageState = {
    blocks: [],
    usage: undefined,
    model: undefined,
    stop_reason: undefined,
  };

  for (const ev of events) {
    const data = ev.parsedData as Record<string, unknown> | undefined;
    if (!data) continue;

    const msg = data.message as Record<string, unknown> | undefined;
    const delta = data.delta as Record<string, unknown> | undefined;
    const contentBlock = data.content_block as Record<string, unknown> | undefined;
    const index = data.index as number | undefined;

    switch (data.type) {
      case 'message_start':
        state.model = msg?.model as string | undefined;
        state.role = msg?.role as string | undefined;
        state.usage = msg?.usage as MessageState['usage'];
        break;

      case 'content_block_start': {
        const newBlock: ContentBlock = {
          type: (contentBlock?.type as ContentBlock['type']) ?? 'text',
          content: '',
          id: contentBlock?.id as string | undefined,
          name: contentBlock?.name as string | undefined,
          input: undefined,
          signature: '',
        };
        if (index != null) state.blocks[index] = newBlock;
        break;
      }

      case 'content_block_delta': {
        const block = index != null ? state.blocks[index] : undefined;
        if (block) {
          if (delta?.type === 'thinking_delta') {
            block.content += (delta.thinking as string) || '';
          } else if (delta?.type === 'text_delta') {
            block.content += (delta.text as string) || '';
          } else if (delta?.type === 'input_json_delta') {
            block.content += (delta.partial_json as string) || '';
          } else if (delta?.type === 'signature_delta') {
            block.signature = delta.signature as string;
          }
        }
        break;
      }

      case 'message_delta':
        state.stop_reason = delta?.stop_reason as string | undefined;
        if (data.usage) {
          state.usage = { ...state.usage, ...data.usage as MessageState['usage'] };
        }
        break;
    }
  }

  return state;
};
