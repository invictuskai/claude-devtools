import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import RequestInspector from './RequestInspector';
import {
    createProxyClient,
    ConnectionState,
    ProxyRequestRecord,
    ProxyMessage,
    TemplateInfo,
} from '../services/proxyClient';

const WS_URL = `ws://${window.location.hostname}:5555/ws`;

// 格式化时间戳
function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
}

// 格式化文件大小
function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + 'B';
    return (bytes / 1024).toFixed(1) + 'KB';
}

// 状态标签样式
function statusBadge(status: string) {
    const map: Record<string, string> = {
        pending: 'bg-yellow-900/40 text-yellow-400',
        streaming: 'bg-blue-900/40 text-blue-400 animate-pulse',
        complete: 'bg-green-900/40 text-green-400',
        error: 'bg-red-900/40 text-red-400',
    };
    return map[status] || 'bg-slate-800 text-slate-400';
}

// 连接状态颜色
function connectionDot(state: ConnectionState) {
    const map: Record<ConnectionState, string> = {
        connecting: 'bg-yellow-400 animate-pulse',
        connected: 'bg-green-500',
        disconnected: 'bg-slate-500',
        error: 'bg-red-500',
    };
    return map[state];
}

const connectionLabel: Record<ConnectionState, string> = {
    connecting: '连接中...',
    connected: '已连接',
    disconnected: '未连接',
    error: '连接错误',
};

// 来源标签
function sourceBadge(req: ProxyRequestRecord) {
    if (req.fromMitmproxy) {
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-400">MITM</span>;
    }
    if (req.fromCli) {
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-400">CLI</span>;
    }
    if (req.injected) {
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">API+注入</span>;
    }
    return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">API</span>;
}

// 可折叠面板
const CollapsibleSection: React.FC<{
    title: string;
    subtitle?: string;
    icon?: string;
    headerColor?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}> = ({ title, subtitle, icon, headerColor = 'bg-[#1a2237] hover:bg-[#1e293b]', defaultOpen = false, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border border-[#334155] rounded-lg overflow-hidden bg-[#111827]">
            <button
                onClick={() => setOpen(!open)}
                className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${headerColor}`}
            >
                <div className="flex items-center gap-2">
                    <svg className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {icon && <span className="text-sm">{icon}</span>}
                    <span className="text-xs font-bold text-slate-200">{title}</span>
                    {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
                </div>
            </button>
            {open && <div className="p-3">{children}</div>}
        </div>
    );
};

// SSE 响应内容展示
interface SSEResponseUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    service_tier?: string;
    server_tool_use?: { web_search_requests?: number };
}

interface SSEResponseData {
    _sse_parsed?: boolean;
    thinking?: string;
    text?: string;
    model?: string;
    stop_reason?: string;
    usage?: SSEResponseUsage;
}

const SSEResponseView: React.FC<{ data: SSEResponseData }> = ({ data }) => {
    const usage = data.usage || {};
    return (
        <CollapsibleSection title="响应内容" icon="📋" headerColor="bg-orange-950/40 hover:bg-orange-950/60" subtitle={`${data.thinking ? 'thinking + ' : ''}${data.text ? 'text + ' : ''}metadata`} defaultOpen={false}>
            <div className="space-y-3">
                {data.thinking && (
                    <div className="border border-amber-800/50 rounded-lg overflow-hidden bg-[#111827]">
                        <div className="px-4 py-2 bg-amber-950/40 flex items-center gap-2">
                            <span className="text-xs">🧠</span>
                            <span className="text-xs font-bold text-amber-400">thinking_delta</span>
                            <span className="text-xs text-amber-500">{data.thinking.length} 字符</span>
                        </div>
                        <div className="p-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                            {data.thinking}
                        </div>
                    </div>
                )}

                {data.text && (
                    <div className="border border-green-800/50 rounded-lg overflow-hidden bg-[#111827]">
                        <div className="px-4 py-2 bg-green-950/40 flex items-center gap-2">
                            <span className="text-xs">💬</span>
                            <span className="text-xs font-bold text-green-400">text_delta</span>
                            <span className="text-xs text-green-500">{data.text.length} 字符</span>
                        </div>
                        <div className="p-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                            {data.text}
                        </div>
                    </div>
                )}

                <div className="border border-[#334155] rounded-lg overflow-hidden bg-[#111827]">
                    <div className="px-4 py-2 bg-[#1a2237] flex items-center gap-2">
                        <span className="text-xs">📊</span>
                        <span className="text-xs font-bold text-slate-200">元数据</span>
                    </div>
                    <div className="p-4 space-y-2">
                        <div className="space-y-2">
                            {usage.output_tokens != null && (
                                <div className="flex items-center justify-between p-2 bg-blue-950/30 rounded-md">
                                    <span className="text-xs text-blue-400 font-medium">输出 Token (output_tokens)</span>
                                    <span className="text-sm font-bold text-blue-300">{usage.output_tokens}</span>
                                </div>
                            )}
                            {usage.input_tokens != null && (
                                <div className="flex items-center justify-between p-2 bg-indigo-950/30 rounded-md">
                                    <span className="text-xs text-indigo-400 font-medium">输入 Token (input_tokens)</span>
                                    <span className="text-sm font-bold text-indigo-300">{usage.input_tokens}</span>
                                </div>
                            )}
                            {usage.cache_read_input_tokens != null && (
                                <div className="flex items-center justify-between p-2 bg-emerald-950/30 rounded-md">
                                    <span className="text-xs text-emerald-400 font-medium">缓存命中 (cache_read_input_tokens)</span>
                                    <span className="text-sm font-bold text-emerald-300">{usage.cache_read_input_tokens.toLocaleString()}</span>
                                </div>
                            )}
                            {usage.cache_creation_input_tokens != null && (
                                <div className="flex items-center justify-between p-2 bg-orange-950/30 rounded-md">
                                    <span className="text-xs text-orange-400 font-medium">缓存创建 (cache_creation_input_tokens)</span>
                                    <span className="text-sm font-bold text-orange-300">{usage.cache_creation_input_tokens.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {data.model && (
                                <span className="text-xs px-2 py-1 bg-slate-800 text-slate-300 rounded-md">模型 (model): {data.model}</span>
                            )}
                            {data.stop_reason && (
                                <span className="text-xs px-2 py-1 bg-slate-800 text-slate-300 rounded-md">停止原因 (stop_reason): {data.stop_reason}</span>
                            )}
                            {usage.service_tier && (
                                <span className="text-xs px-2 py-1 bg-slate-800 text-slate-300 rounded-md">服务层级 (service_tier): {usage.service_tier}</span>
                            )}
                            {usage.server_tool_use && (
                                <span className="text-xs px-2 py-1 bg-slate-800 text-slate-300 rounded-md">
                                    搜索请求 (web_search_requests): {usage.server_tool_use.web_search_requests || 0}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </CollapsibleSection>
    );
};

const ProxyMonitor: React.FC = () => {
    const [connState, setConnState] = useState<ConnectionState>('disconnected');
    const [requests, setRequests] = useState<ProxyRequestRecord[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);
    const [activeSession, setActiveSession] = useState<string>('all');
    const clientRef = useRef<ReturnType<typeof createProxyClient> | null>(null);

    // 从请求中提取所有 session
    const sessions = useMemo(() => {
        const map = new Map<string, { count: number; firstTime: number; projectPath?: string }>();
        for (const req of requests) {
            const sid = req.sessionId || 'unknown';
            const existing = map.get(sid);
            if (existing) {
                existing.count++;
                if (!existing.projectPath && req.projectPath) {
                    existing.projectPath = req.projectPath;
                }
            } else {
                map.set(sid, { count: 1, firstTime: req.timestamp, projectPath: req.projectPath });
            }
        }
        return map;
    }, [requests]);

    // 按 session 过滤请求
    const filteredRequests = useMemo(() => {
        if (activeSession === 'all') return requests;
        return requests.filter(r => (r.sessionId || 'unknown') === activeSession);
    }, [requests, activeSession]);

    const tokenStats = useMemo(() => {
        const stats = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
        for (const req of filteredRequests) {
            const raw = req.responseBody?.usage || req.responseBody?._sse_parsed && req.responseBody?.usage;
            if (!raw || typeof raw !== 'object') continue;
            const usage = raw as Record<string, number>;
            stats.input_tokens += usage.input_tokens || 0;
            stats.output_tokens += usage.output_tokens || 0;
            stats.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
            stats.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
        }
        const total = stats.input_tokens + stats.output_tokens + stats.cache_read_input_tokens + stats.cache_creation_input_tokens;
        return { ...stats, total };
    }, [filteredRequests]);

    const handleMessage = useCallback((msg: ProxyMessage) => {
        switch (msg.type) {
            case 'history':
                setRequests(msg.data);
                break;
            case 'new_request':
                setRequests(prev => [...prev, msg.data]);
                break;
            case 'update_request':
                setRequests(prev =>
                    prev.map(r =>
                        r.id === msg.data.id
                            ? { ...r, statusCode: msg.data.statusCode, status: msg.data.status as ProxyRequestRecord['status'], responseHeaders: msg.data.responseHeaders }
                            : r
                    )
                );
                break;
            case 'response_chunk':
                setRequests(prev =>
                    prev.map(r =>
                        r.id === msg.data.id
                            ? { ...r, responseChunks: [...r.responseChunks, msg.data.chunk] }
                            : r
                    )
                );
                break;
            case 'request_complete':
                setRequests(prev =>
                    prev.map(r =>
                        r.id === msg.data.id
                            ? {
                                ...r,
                                status: 'complete',
                                statusCode: msg.data.statusCode ?? r.statusCode,
                                responseHeaders: msg.data.responseHeaders ?? r.responseHeaders,
                                responseBody: msg.data.responseBody ?? r.responseBody,
                                logFile: msg.data.logFile ?? r.logFile,
                            }
                            : r
                    )
                );
                break;
            case 'request_error':
                setRequests(prev =>
                    prev.map(r =>
                        r.id === msg.data.id
                            ? { ...r, status: 'error', error: msg.data.error }
                            : r
                    )
                );
                break;
            case 'template_updated':
                setTemplateInfo(msg.data);
                break;
        }
    }, []);

    useEffect(() => {
        clientRef.current = createProxyClient(WS_URL, {
            onMessage: handleMessage,
            onStateChange: setConnState,
        });
        return () => {
            clientRef.current?.disconnect();
        };
    }, [handleMessage]);

    const selectedRequest = requests.find(r => r.id === selectedId);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 bg-[#111827] border-b border-[#1e293b] shrink-0">
                <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${connectionDot(connState)}`} />
                    <span className="text-xs font-medium text-slate-400">{connectionLabel[connState]}</span>
                    <span className="text-xs text-slate-400">{WS_URL}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{filteredRequests.length} 个请求</span>
                    {(connState === 'disconnected' || connState === 'error') && (
                        <button
                            onClick={() => clientRef.current?.reconnect()}
                            className="px-3 py-1 text-[10px] font-semibold text-indigo-400 hover:bg-indigo-950/40 rounded-md border border-indigo-800 transition-colors"
                        >
                            重连
                        </button>
                    )}
                </div>
            </div>

            {/* Session Tab 栏 */}
            {sessions.size > 0 && (
                <div className="flex items-center gap-1 px-4 py-2 bg-[#111827] border-b border-[#1e293b] shrink-0 overflow-x-auto">
                    <div className="flex items-center gap-0.5">
                        <button
                            onClick={() => setActiveSession('all')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-l-md transition-colors whitespace-nowrap ${activeSession === 'all'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-400 hover:bg-[#1e293b]'
                                }`}
                        >
                            全部 ({requests.length})
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setRequests([]);
                                setSelectedId(null);
                            }}
                            title="清空所有请求"
                            className={`px-2 self-stretch flex items-center rounded-r-md transition-colors ${activeSession === 'all'
                                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                                : 'bg-[#1a2237] text-slate-400 hover:bg-[#1e293b] hover:text-slate-300'
                                }`}
                        >
                            <span className="text-[10px]">&#x2715;</span>
                        </button>
                    </div>
                    {Array.from(sessions.entries()).map(([sid, info]) => (
                        <div key={sid} className="flex items-center gap-0.5">
                            <button
                                onClick={() => setActiveSession(sid)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-l-md transition-colors whitespace-nowrap ${activeSession === sid
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:bg-[#1e293b]'
                                    }`}
                            >
                                <div className="flex flex-col items-start gap-0.5">
                                    <div className="flex items-center gap-1">
                                        <span className="font-mono">{sid === 'unknown' ? '未知' : sid.slice(0, 8)}</span>
                                        <span className="text-[10px] opacity-70">({info.count})</span>
                                    </div>
                                    {info.projectPath && (
                                        <span className={`text-[10px] font-normal truncate max-w-[260px] ${activeSession === sid ? 'text-indigo-200' : 'text-slate-400'}`} title={info.projectPath}>
                                            {info.projectPath}
                                        </span>
                                    )}
                                </div>
                            </button>
                            {sid !== 'unknown' && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(sid);
                                        const btn = e.currentTarget;
                                        btn.textContent = '✓';
                                        setTimeout(() => { btn.textContent = '📋'; }, 1000);
                                    }}
                                    title={`复制完整 Session ID: ${sid}`}
                                    className={`px-2 self-stretch flex items-center transition-colors ${activeSession === sid
                                        ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                                        : 'bg-[#1a2237] text-slate-400 hover:bg-[#1e293b] hover:text-slate-300'
                                        }`}
                                >
                                    📋
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setRequests(prev => prev.filter(r => (r.sessionId || 'unknown') !== sid));
                                    if (activeSession === sid) {
                                        setActiveSession('all');
                                    }
                                    if (selectedId && requests.find(r => r.id === selectedId && (r.sessionId || 'unknown') === sid)) {
                                        setSelectedId(null);
                                    }
                                }}
                                title={`清空此会话的所有请求`}
                                className={`px-2 self-stretch flex items-center rounded-r-md transition-colors ${activeSession === sid
                                    ? 'bg-indigo-600 text-white hover:bg-red-500'
                                    : 'bg-[#1a2237] text-slate-400 hover:bg-red-900/50 hover:text-red-300'
                                    }`}
                            >
                                <span className="text-[10px]">&#x2715;</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {tokenStats.total > 0 && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0f172a] border-b border-[#1e293b] shrink-0 flex-wrap">
                    <span className="text-xs font-bold text-slate-400 mr-1">累计用量</span>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-950/40">
                        <span className="text-xs text-blue-400 font-medium">输出 Token (output_tokens)</span>
                        <span className="text-sm font-bold text-blue-300">{tokenStats.output_tokens.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/40">
                        <span className="text-xs text-indigo-400 font-medium">输入 Token (input_tokens)</span>
                        <span className="text-sm font-bold text-indigo-300">{tokenStats.input_tokens.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40">
                        <span className="text-xs text-emerald-400 font-medium">缓存命中 (cache_read_input_tokens)</span>
                        <span className="text-sm font-bold text-emerald-300">{tokenStats.cache_read_input_tokens.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-950/40">
                        <span className="text-xs text-orange-400 font-medium">缓存创建 (cache_creation_input_tokens)</span>
                        <span className="text-sm font-bold text-orange-300">{tokenStats.cache_creation_input_tokens.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 ml-auto">
                        <span className="text-xs text-slate-300 font-medium">合计</span>
                        <span className="text-sm font-bold text-white">{tokenStats.total.toLocaleString()}</span>
                    </div>
                </div>
            )}

            <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="w-[340px] shrink-0 border-r border-[#1e293b] bg-[#111827] overflow-y-auto">
                    {filteredRequests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 px-6">
                            <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <p className="text-xs font-medium">等待请求中...</p>
                        </div>
                    ) : (
                        filteredRequests.slice().reverse().map(req => (
                            <div
                                key={req.id}
                                onClick={() => setSelectedId(req.id)}
                                className={`px-3 py-2.5 border-b border-[#1e293b] cursor-pointer transition-colors hover:bg-[#1e293b] ${selectedId === req.id ? 'bg-[#1e3a5f] border-l-2 border-l-indigo-500' : ''}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-mono text-slate-400">{formatTime(req.timestamp)}</span>
                                        {sourceBadge(req)}
                                    </div>
                                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusBadge(req.status)}`}>
                                        {req.status === 'streaming' ? '⏳ streaming' : req.status === 'complete' ? `✓ ${req.statusCode}` : req.status === 'error' ? '✗ error' : '● pending'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950/40 px-1 rounded">{req.method}</span>
                                    <span className="text-[11px] font-mono text-slate-300 truncate">{req.path}</span>
                                </div>
                                {req.requestBody && (
                                    <div className="text-xs text-slate-400 truncate">
                                        {String(req.requestBody.model ?? '')}
                                        {Array.isArray(req.requestBody.messages) && ` · ${req.requestBody.messages.length} msgs`}
                                        {Array.isArray(req.requestBody.tools) && ` · ${req.requestBody.tools.length} tools`}
                                        {req.requestBody.system ? ` · system \u2713` : null}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="flex-1 overflow-y-auto bg-[#0a0e1a]">
                    {selectedRequest ? (
                        <div className="p-5 space-y-4">
                            <div className="flex items-center gap-3 pb-3 border-b border-[#334155]">
                                <span className="text-xs font-bold text-indigo-400 bg-indigo-950/40 px-2 py-1 rounded">{selectedRequest.method}</span>
                                <span className="text-xs font-mono text-slate-300 truncate flex-1">{selectedRequest.path}</span>
                                {selectedRequest.statusCode && (
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${selectedRequest.statusCode < 400 ? 'bg-green-950/40 text-green-400' : 'bg-red-950/40 text-red-400'}`}>
                                        {selectedRequest.statusCode}
                                    </span>
                                )}
                                {sourceBadge(selectedRequest)}
                            </div>

                            {selectedRequest.logFile && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-amber-950/30 border border-amber-800/50 rounded-lg">
                                    <span className="text-xs">📄</span>
                                    <a
                                        href={`http://${window.location.hostname}:5555/__proxy__/log/${selectedRequest.logFile}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-mono text-amber-400 hover:text-amber-300 hover:underline truncate"
                                    >
                                        {selectedRequest.logFile}
                                    </a>
                                </div>
                            )}

                            <CollapsibleSection title="请求头" icon="📨" headerColor="bg-blue-950/30 hover:bg-blue-950/50" subtitle={`${Object.keys(selectedRequest.requestHeaders || {}).length} 个`} defaultOpen={false}>
                                <pre className="text-xs font-mono bg-[#0a0e1a] text-slate-200 p-3 rounded-lg border border-[#1e293b] overflow-x-auto whitespace-pre-wrap break-all">
                                    {JSON.stringify(selectedRequest.requestHeaders, null, 2)}
                                </pre>
                            </CollapsibleSection>

                            {selectedRequest.requestBody && (
                                <CollapsibleSection title="请求参数" icon="📤" headerColor="bg-green-950/30 hover:bg-green-950/50" subtitle={String(selectedRequest.requestBody.model ?? '')} defaultOpen={true}>
                                    <RequestInspector data={selectedRequest.requestBody} />
                                </CollapsibleSection>
                            )}

                            {Object.keys(selectedRequest.responseHeaders || {}).length > 0 && (
                                <CollapsibleSection title="响应头" icon="📩" headerColor="bg-purple-950/30 hover:bg-purple-950/50" subtitle={`${Object.keys(selectedRequest.responseHeaders).length} 个`} defaultOpen={false}>
                                    <pre className="text-xs font-mono bg-[#0a0e1a] text-slate-200 p-3 rounded-lg border border-[#1e293b] overflow-x-auto whitespace-pre-wrap break-all">
                                        {JSON.stringify(selectedRequest.responseHeaders, null, 2)}
                                    </pre>
                                </CollapsibleSection>
                            )}

                            {selectedRequest.responseBody && (
                                selectedRequest.responseBody._sse_parsed ? (
                                    <SSEResponseView data={selectedRequest.responseBody} />
                                ) : (
                                    <CollapsibleSection title="响应内容" defaultOpen={true}>
                                        <pre className="text-xs font-mono bg-[#0a0e1a] text-slate-200 p-3 rounded-lg border border-[#1e293b] overflow-x-auto whitespace-pre-wrap break-all">
                                            {JSON.stringify(selectedRequest.responseBody, null, 2)}
                                        </pre>
                                    </CollapsibleSection>
                                )
                            )}

                            {selectedRequest.error && (
                                <div className="p-3 bg-red-950/30 border border-red-800/50 rounded-lg">
                                    <p className="text-xs font-bold text-red-400">错误</p>
                                    <p className="text-xs text-red-300 mt-1">{selectedRequest.error}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                            <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                            </svg>
                            <p className="text-xs">选择一个请求查看详情</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProxyMonitor;
