import React, { useState, useEffect, useCallback, useRef } from 'react';
import { parseRawSSE, reconstructMessage } from '../services/sseParser';
import { SSEEvent, MessageState, ClaudeChatHistory } from '../types';
import MessagePreview from './MessagePreview';
import ChatHistory from './ChatHistory';
import RequestInspector from './RequestInspector';

type ViewMode = 'sse' | 'dialogue' | 'request';

const PasteParseView: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('sse');
  const [requestData, setRequestData] = useState<any>(null);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [messageState, setMessageState] = useState<MessageState>({ blocks: [] });
  const [chatHistory, setChatHistory] = useState<ClaudeChatHistory | null>(null);

  // Drag divider state
  const [leftWidth, setLeftWidth] = useState(33);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleParse = useCallback(() => {
    if (!inputText.trim()) {
      setEvents([]);
      setMessageState({ blocks: [] });
      setChatHistory(null);
      setRequestData(null);
      return;
    }

    try {
      const json = JSON.parse(inputText);
      if (json.messages && Array.isArray(json.messages)) {
        const normalized = {
          ...json,
          messages: json.messages.map((msg: any) => ({
            ...msg,
            content: typeof msg.content === 'string'
              ? [{ type: 'text', text: msg.content }]
              : msg.content
          }))
        };

        if (json.tools || json.system) {
          setViewMode('request');
          setRequestData(normalized);
        } else {
          setViewMode('dialogue');
          setChatHistory(normalized);
        }
        return;
      }
    } catch (e) {
      // Not a pure dialogue JSON, try SSE parsing
    }

    setViewMode('sse');
    const parsed = parseRawSSE(inputText);
    setEvents(parsed);
    const reconstructed = reconstructMessage(parsed);
    setMessageState(reconstructed);
  }, [inputText]);

  useEffect(() => {
    handleParse();
  }, [handleParse]);

  // Drag divider events
  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.max(15, Math.min(70, pct)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0e1a]">
      <header className="bg-[#111827] border-b border-[#1e293b] px-6 py-3 flex items-center justify-between shrink-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paste Parse Mode</div>
        <button
          onClick={() => { setInputText(''); setEvents([]); setChatHistory(null); setRequestData(null); }}
          className="px-4 py-1.5 text-xs font-semibold text-slate-400 hover:bg-[#1e293b] rounded-lg transition-colors border border-[#334155]"
        >
          Clear
        </button>
      </header>

      <main ref={containerRef} className="flex-1 flex flex-row overflow-hidden">
        {/* Input Pane */}
        <div style={{ width: `${leftWidth}%` }} className="flex flex-col shrink-0">
          <div className="flex-1 flex flex-col p-4 bg-[#0f172a] min-h-0">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              RAW DATA INPUT
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste Claude Code raw JSON / SSE data..."
              className="w-full flex-1 p-4 bg-[#0a0e1a] border border-[#334155] rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-[10px] mono resize-none min-h-0 text-slate-300 placeholder-slate-600"
            />
          </div>
        </div>

        {/* Drag divider */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 cursor-col-resize bg-[#1e293b] hover:bg-indigo-500 active:bg-indigo-400 transition-colors shrink-0 relative group"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-slate-600 group-hover:bg-white transition-colors" />
        </div>

        {/* View Pane */}
        <div className="flex-1 flex flex-col bg-[#0a0e1a] min-w-0">
          <div className="px-6 py-3 bg-[#111827] border-b border-[#1e293b] flex items-center justify-between z-[5]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visual Reconstruction</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth">
            {viewMode === 'sse' ? (
              <MessagePreview state={messageState} />
            ) : viewMode === 'dialogue' && chatHistory ? (
              <ChatHistory history={chatHistory} />
            ) : viewMode === 'request' && requestData ? (
              <RequestInspector data={requestData} />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PasteParseView;
