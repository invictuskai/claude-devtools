
import React, { useState, useMemo } from 'react';
import { ClaudeChatHistory, ClaudeMessage, ClaudePart } from '../types';

interface ChatHistoryProps {
  history: ClaudeChatHistory;
}

// 将 content 统一为数组格式
const normalizeContent = (content: string | ClaudePart[]): ClaudePart[] => {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content;
};

// 截断长文本，返回 [显示文本, 是否被截断]
const truncateText = (text: string, maxLen: number): [string, boolean] => {
  if (text.length <= maxLen) return [text, false];
  return [text.substring(0, maxLen), true];
};

const PartRenderer: React.FC<{ part: ClaudePart; role: string }> = ({ part, role }) => {
  const [expanded, setExpanded] = useState(false);
  const isUser = role === 'user';

  switch (part.type) {
    case 'text': {
      const rawText = part.text || '';
      const isLong = rawText.length > 2000;
      const [displayText, wasTruncated] = isLong && !expanded
        ? truncateText(rawText, 2000)
        : [rawText, false];

      const isCaveat = rawText.includes('local-command-caveat');
      const isStdout = rawText.includes('local-command-stdout');
      const isSystemReminder = rawText.includes('<system-reminder>');

      let textColorClass = 'text-slate-200';
      if (isCaveat) textColorClass = 'opacity-50 italic text-[11px]';
      if (isStdout) textColorClass = 'bg-[#0a0e1a] text-slate-300 p-2 rounded mono text-xs';
      if (isSystemReminder) textColorClass = 'text-slate-400 text-xs';

      return (
        <div className={`text-sm leading-relaxed mb-3 ${textColorClass}`}>
          <div className="whitespace-pre-wrap break-all">{displayText}</div>
          {wasTruncated && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              ... 展开全部 ({rawText.length.toLocaleString()} 字符)
            </button>
          )}
          {expanded && isLong && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              收起
            </button>
          )}
          {part.cache_control && (
            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-violet-950/40 text-violet-400 text-[9px] font-bold uppercase">
              Cache: {part.cache_control.type} {part.cache_control.ttl && `(${part.cache_control.ttl})`}
            </div>
          )}
        </div>
      );
    }

    case 'thinking':
      return (
        <details className="mb-4 bg-amber-950/30 border border-amber-800/50 rounded-lg overflow-hidden group">
          <summary className="px-4 py-2 text-xs font-bold text-amber-400 uppercase tracking-widest cursor-pointer hover:bg-amber-950/50 transition-colors flex items-center justify-between">
            <span>Assistant Thinking Process</span>
            <svg className="w-3 h-3 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </summary>
          <div className="px-4 py-3 text-sm text-slate-200 italic whitespace-pre-wrap leading-relaxed border-t border-amber-800/50">
            {part.thinking}
            {part.signature && (
              <div className="mt-2 pt-2 border-t border-amber-800/30 text-xs mono text-slate-400 truncate">
                SIG: {part.signature}
              </div>
            )}
          </div>
        </details>
      );

    case 'tool_use':
      return (
        <div className="mb-4 bg-indigo-950/30 border border-indigo-800/50 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-indigo-950/50 border-b border-indigo-800/50 flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Tool Call: {part.name}</span>
            <span className="text-xs mono text-slate-400">{part.id}</span>
          </div>
          <div className="p-3 bg-[#0a0e1a]">
            <pre className="text-sm text-slate-200 mono overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          </div>
        </div>
      );

    case 'tool_result':
      return (
        <div className={`mb-4 border rounded-lg overflow-hidden ${part.is_error ? 'bg-red-950/30 border-red-800/50' : 'bg-emerald-950/30 border-emerald-800/50'}`}>
          <div className={`px-4 py-2 border-b flex items-center justify-between ${part.is_error ? 'bg-red-950/50 border-red-800/50 text-red-400' : 'bg-emerald-950/50 border-emerald-800/50 text-emerald-400'}`}>
            <span className="text-xs font-bold uppercase tracking-widest">Tool Result</span>
            <span className="text-xs mono text-slate-400">{part.tool_use_id}</span>
          </div>
          <div className="p-4 overflow-x-auto">
            <div className={`text-sm mono whitespace-pre-wrap leading-relaxed ${part.is_error ? 'text-red-300' : 'text-slate-200'}`}>
              {typeof part.content === 'string' ? part.content : JSON.stringify(part.content, null, 2)}
            </div>
          </div>
        </div>
      );

    default:
      return (
        <div className="text-xs text-slate-400 italic mb-2">Unknown part type: {part.type}</div>
      );
  }
};

const ChatHistory: React.FC<ChatHistoryProps> = ({ history }) => {
  const [toolSearch, setToolSearch] = useState('');

  // 过滤工具列表
  const filteredTools = useMemo(() => {
    if (!history.tools) return [];
    if (!toolSearch.trim()) return history.tools;
    const q = toolSearch.toLowerCase();
    return history.tools.filter((t: any) =>
      t.name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    );
  }, [history.tools, toolSearch]);

  return (
    <div className="space-y-12 pb-12">
      {/* Metadata Header */}
      <div className="flex flex-wrap gap-4 items-center justify-between p-4 bg-[#111827] border border-[#334155] rounded-2xl">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Active Model</div>
          <div className="text-sm font-bold text-indigo-400 mono">{history.model}</div>
        </div>
        <div className="flex gap-4 flex-wrap">
          <div className="text-center px-4 border-r border-[#1e293b] last:border-0">
            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Turns</div>
            <div className="text-sm font-bold text-slate-200">{history.messages.length}</div>
          </div>
          <div className="text-center px-4 border-r border-[#1e293b] last:border-0">
            <div className="text-xs font-bold text-slate-400 uppercase mb-1">Tools</div>
            <div className="text-sm font-bold text-slate-200">{history.tools?.length || 0}</div>
          </div>
          {history.max_tokens !== undefined && (
            <div className="text-center px-4 border-r border-[#1e293b] last:border-0">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Max Tokens</div>
              <div className="text-sm font-bold text-slate-200">{history.max_tokens.toLocaleString()}</div>
            </div>
          )}
          {history.stream !== undefined && (
            <div className="text-center px-4 border-r border-[#1e293b] last:border-0">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Stream</div>
              <div className={`text-sm font-bold ${history.stream ? 'text-emerald-400' : 'text-slate-500'}`}>
                {history.stream ? 'ON' : 'OFF'}
              </div>
            </div>
          )}
          {history.thinking && (
            <div className="text-center px-4 border-r border-[#1e293b] last:border-0">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Thinking</div>
              <div className="text-sm font-bold text-amber-400">{history.thinking.type}</div>
            </div>
          )}
        </div>
      </div>

      {/* Metadata (raw) */}
      {history.metadata && Object.keys(history.metadata).length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none text-xs font-bold text-slate-400 uppercase tracking-[0.2em] hover:text-slate-300">
            <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 5l7 7-7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Request Metadata
          </summary>
          <div className="mt-2 bg-[#0f172a] border border-[#334155] rounded-xl p-4">
            <pre className="text-xs mono text-slate-200 whitespace-pre-wrap">{JSON.stringify(history.metadata, null, 2)}</pre>
          </div>
        </details>
      )}

      {/* Messages */}
      <div className="space-y-8">
        {history.messages.map((msg, idx) => {
          const parts = normalizeContent(msg.content);
          return (
            <div key={idx} className={`flex flex-col ${msg.role === 'assistant' ? 'items-start' : 'items-end'}`}>
              <div className={`max-w-[90%] md:max-w-[80%] rounded-2xl p-6 border ${msg.role === 'assistant'
                  ? 'bg-[#111827] border-[#334155] rounded-tl-none'
                  : 'bg-[#0f172a] border-[#1e293b] text-slate-200 rounded-tr-none'
                }`}>
                <div className={`text-[10px] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2 ${msg.role === 'assistant' ? 'text-indigo-400' : 'text-slate-500'
                  }`}>
                  <span className="w-2 h-2 rounded-full bg-current"></span>
                  {msg.role}
                  <span className="text-slate-400 font-normal">Turn {idx + 1}</span>
                </div>

                <div>
                  {parts.map((part, pIdx) => (
                    <PartRenderer key={pIdx} part={part} role={msg.role} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* System Information Section */}
      <div className="space-y-6">
        <details className="group border-t border-[#1e293b] pt-8">
          <summary className="flex items-center justify-between cursor-pointer list-none">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">System Instructions ({history.system?.length || 0} Blocks)</h3>
            <svg className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </summary>
          <div className="space-y-3 mt-4">
            {history.system?.map((item: any, i: number) => (
              <SystemBlock key={i} item={item} index={i} />
            ))}
            {(!history.system || history.system.length === 0) && (
              <div className="text-sm text-slate-400 italic">No system instructions provided.</div>
            )}
          </div>
        </details>

        <details className="group border-t border-[#1e293b] pt-8">
          <summary className="flex items-center justify-between cursor-pointer list-none">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Available Tools ({history.tools?.length || 0})</h3>
            <svg className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </summary>

          {/* 工具搜索框 */}
          {history.tools && history.tools.length > 5 && (
            <div className="mt-4 mb-2">
              <input
                type="text"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                placeholder="搜索工具名称或描述..."
                className="w-full px-3 py-2 text-xs border border-[#334155] rounded-lg bg-[#0f172a] text-slate-300 placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {filteredTools.map((tool: any, i: number) => (
              <div key={i} className="bg-[#111827] border border-[#334155] rounded-xl p-4 hover:border-indigo-600 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  <div className="text-xs font-bold text-slate-200 mono">{tool.name}</div>
                </div>
                <div className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                  {tool.description}
                </div>
                {tool.input_schema && (
                  <details className="mt-3">
                    <summary className="text-[10px] font-bold text-slate-400 uppercase cursor-pointer hover:text-indigo-400">View Details & Schema</summary>
                    <div className="mt-2 text-xs text-slate-300 mb-2 whitespace-pre-wrap max-h-60 overflow-y-auto">{tool.description}</div>
                    <div className="mt-2 bg-[#0a0e1a] rounded p-2 overflow-x-auto max-h-60 overflow-y-auto">
                      <pre className="text-xs mono text-slate-200">{JSON.stringify(tool.input_schema, null, 2)}</pre>
                    </div>
                  </details>
                )}
              </div>
            ))}
            {filteredTools.length === 0 && (
              <div className="text-sm text-slate-400 italic col-span-2">
                {toolSearch ? '未找到匹配的工具' : 'No tools defined in this session.'}
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
};

// System Block 组件——处理超长文本的折叠/截断
const SystemBlock: React.FC<{ item: any; index: number }> = ({ item, index }) => {
  const [expanded, setExpanded] = useState(false);
  const text = item.text || JSON.stringify(item);
  const isLong = text.length > 500;
  const [displayText] = isLong && !expanded ? truncateText(text, 500) : [text, false];

  return (
    <div className="bg-[#0f172a] border border-[#334155] rounded-xl p-4 text-sm text-slate-200 leading-relaxed">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase">
          Block {index + 1} ({item.type})
          {text.length > 500 && <span className="ml-2 text-slate-500">{text.length.toLocaleString()} chars</span>}
        </div>
        {item.cache_control && (
          <span className="px-2 py-0.5 rounded bg-violet-950/40 text-violet-400 text-[9px] font-bold uppercase">
            Cache: {item.cache_control.type} {item.cache_control.ttl && `(${item.cache_control.ttl})`}
          </span>
        )}
      </div>
      <div className="whitespace-pre-wrap break-all text-xs">{displayText}</div>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
        >
          {expanded ? '收起' : `展开全部 (${text.length.toLocaleString()} 字符)`}
        </button>
      )}
    </div>
  );
};

export default ChatHistory;
