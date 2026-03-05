
import React from 'react';
import { MessageState } from '../types';

interface MessagePreviewProps {
  state: MessageState;
}

const MessagePreview: React.FC<MessagePreviewProps> = ({ state }) => {
  if (!state.model && state.blocks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 italic">
        Paste stream content to see reconstruction...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-[#111827] border border-[#334155] rounded-lg">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Model</div>
          <div className="text-sm font-semibold text-slate-200">{state.model || 'Unknown'}</div>
        </div>
        <div className="p-3 bg-[#111827] border border-[#334155] rounded-lg">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Stop Reason</div>
          <div className="text-sm font-semibold text-slate-200 capitalize">{state.stop_reason || 'Streaming...'}</div>
        </div>
      </div>

      {/* Content Blocks */}
      <div className="space-y-4">
        {state.blocks.map((block, idx) => (
          <div key={idx} className="bg-[#111827] border border-[#334155] rounded-xl overflow-hidden">
            <div className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b flex justify-between items-center ${
              block.type === 'thinking' ? 'bg-amber-950/40 border-amber-800/50 text-amber-400' :
              block.type === 'tool_use' ? 'bg-indigo-950/40 border-indigo-800/50 text-indigo-400' :
              'bg-[#1a2237] border-[#1e293b] text-slate-400'
            }`}>
              <span>{block.type} Block #{idx}</span>
              {block.name && <span className="mono normal-case text-xs">{block.name}</span>}
            </div>

            <div className="p-4">
              {block.type === 'thinking' && (
                <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed italic">
                  {block.content}
                </div>
              )}

              {block.type === 'text' && (
                <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {block.content}
                </div>
              )}

              {block.type === 'tool_use' && (
                <div className="space-y-2">
                   <div className="text-xs text-slate-400 font-bold uppercase">Arguments</div>
                   <div className="bg-[#0a0e1a] rounded-lg p-3 overflow-x-auto">
                     <pre className="text-sm text-slate-200 mono whitespace-pre-wrap">
                       {block.input ? JSON.stringify(block.input, null, 2) : '{}'}
                     </pre>
                   </div>
                </div>
              )}

              {block.signature && (
                <div className="mt-4 pt-4 border-t border-[#1e293b]">
                  <div className="text-xs text-slate-400 font-bold uppercase mb-1">Signature</div>
                  <div className="text-xs mono text-slate-500 truncate">{block.signature}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Usage */}
      {state.usage && (
        <div className="bg-[#111827] rounded-xl p-4 border border-[#334155]">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Token Usage</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-400">Input</div>
              <div className="text-lg font-bold text-slate-200">{state.usage.input_tokens}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Output</div>
              <div className="text-lg font-bold text-slate-200">{state.usage.output_tokens}</div>
            </div>
            {state.usage.cache_read_input_tokens !== undefined && (
              <div>
                <div className="text-xs text-slate-400">Cache Read</div>
                <div className="text-lg font-bold text-slate-200">{state.usage.cache_read_input_tokens}</div>
              </div>
            )}
            {state.usage.cache_creation_input_tokens !== undefined && (
              <div>
                <div className="text-xs text-slate-400">Cache Write</div>
                <div className="text-lg font-bold text-slate-200">{state.usage.cache_creation_input_tokens}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagePreview;
