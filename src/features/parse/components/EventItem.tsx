import React, { useState } from 'react';
import { SSEEvent } from '../types';

interface EventItemProps {
  event: SSEEvent;
}

const EventItem: React.FC<EventItemProps> = ({ event }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getEventColor = (name: string) => {
    switch (name) {
      case 'message_start': return 'bg-blue-950/40 text-blue-400 border-blue-800/50';
      case 'content_block_start': return 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50';
      case 'content_block_delta': return 'bg-amber-950/40 text-amber-400 border-amber-800/50';
      case 'content_block_stop': return 'bg-purple-950/40 text-purple-400 border-purple-800/50';
      case 'message_stop': return 'bg-red-950/40 text-red-400 border-red-800/50';
      case 'ping': return 'bg-slate-800 text-slate-400 border-slate-700';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="border-b border-[#1e293b] last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1e293b] transition-colors text-left"
      >
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getEventColor(event.event)}`}>
          {event.event}
        </span>
        <span className="flex-1 text-xs text-slate-300 truncate mono">
          {event.data.substring(0, 100)}{event.data.length > 100 ? '...' : ''}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 bg-[#0f172a] border-t border-[#1e293b]">
          <div className="mt-3 p-3 bg-[#0a0e1a] rounded-lg overflow-x-auto">
            <pre className="text-xs text-emerald-400 mono">
              {JSON.stringify(event.parsedData || event.data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventItem;
