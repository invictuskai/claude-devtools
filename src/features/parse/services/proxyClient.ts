/**
 * WebSocket 客户端封装
 * 连接代理服务器，接收实时请求数据
 */

// 代理请求记录类型
export interface ProxyRequestRecord {
    id: string;
    timestamp: number;
    method: string;
    path: string;
    requestHeaders: Record<string, string>;
    requestBody: Record<string, unknown>;
    responseHeaders: Record<string, string>;
    responseChunks: string[];
    responseBody: Record<string, unknown>;
    status: 'pending' | 'streaming' | 'complete' | 'error';
    statusCode: number | null;
    error?: string;
    fromCli?: boolean;      // 是否来自 CLI
    injected?: boolean;     // 是否注入了模板
    fromMitmproxy?: boolean; // 是否来自 mitmproxy 抓包
    logFile?: string;        // requestLog 日志文件名
    sessionId?: string;
    projectPath?: string;
}

// 模板信息类型
export interface TemplateInfo {
    cliVersion: string;
    capturedAt: string;
    systemBlocks: number;
    toolsCount: number;
    headersCount: number;
    systemSize: number;
    toolsSize: number;
}

// WebSocket 消息类型
export type ProxyMessage =
    | { type: 'history'; data: ProxyRequestRecord[] }
    | { type: 'new_request'; data: ProxyRequestRecord }
    | { type: 'update_request'; data: { id: string; statusCode: number; status: string; responseHeaders: Record<string, string> } }
    | { type: 'response_chunk'; data: { id: string; chunk: string } }
    | { type: 'request_complete'; data: { id: string; status: string; responseBody: Record<string, unknown>; statusCode?: number; responseHeaders?: Record<string, string>; logFile?: string } }
    | { type: 'request_error'; data: { id: string; error: string } }
    | { type: 'template_updated'; data: TemplateInfo };

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export type ProxyClientCallback = {
    onMessage: (msg: ProxyMessage) => void;
    onStateChange: (state: ConnectionState) => void;
};

/**
 * 创建 WebSocket 客户端，支持自动重连
 */
export function createProxyClient(wsUrl: string, callbacks: ProxyClientCallback) {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let shouldReconnect = true;

    function connect() {
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
            return;
        }

        callbacks.onStateChange('connecting');

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            callbacks.onStateChange('connected');
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as ProxyMessage;
                callbacks.onMessage(msg);
            } catch {
                // ignore malformed messages
            }
        };

        ws.onclose = () => {
            callbacks.onStateChange('disconnected');
            if (shouldReconnect) {
                reconnectTimer = setTimeout(connect, 2000);
            }
        };

        ws.onerror = () => {
            callbacks.onStateChange('error');
        };
    }

    function disconnect() {
        shouldReconnect = false;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (ws) {
            ws.close();
            ws = null;
        }
    }

    // 立即开始连接
    connect();

    return { disconnect, reconnect: () => { shouldReconnect = true; connect(); } };
}
