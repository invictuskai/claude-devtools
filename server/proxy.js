/**
 * Claude Code 请求监听代理服务 (增强版)
 *
 * 功能：
 *   1. 拦截 Claude Code CLI 请求并透传到目标 API
 *   2. 通过 WebSocket 推送请求/响应到前端可视化
 *   3. 自动捕获并保存 CLI 模板（system/tools/headers），用于后续复用
 *   4. 模板注入模式：简单请求自动补全 system/tools/headers 以通过中转站验证
 *
 * 用法：
 *   1. node server/proxy.js
 *   2. 设置环境变量:
 *      set ANTHROPIC_BASE_URL=http://localhost:5555
 *      set CLAUDE_CODE_ATTRIBUTION_HEADER=0
 *      set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
 *   3. 用 Claude Code CLI 发一条消息，代理自动捕获模板
 *   4. 之后可用简单请求调用，代理自动注入模板通过验证
 */

import express from 'express';
import http from 'http';
import https from 'https';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== 配置 ==========
const PROXY_PORT = process.env.PROXY_PORT || 5555;
const TARGET_HOST = process.env.TARGET_HOST || 'api.anthropic.com';
const TARGET_BASE = `https://${TARGET_HOST}`;
const TEMPLATE_DIR = path.join(__dirname, 'templates');
const REQUEST_LOG_DIR = path.join(__dirname, 'requestLog');

// 确保日志目录存在
if (!fs.existsSync(REQUEST_LOG_DIR)) {
  fs.mkdirSync(REQUEST_LOG_DIR, { recursive: true });
}
// 从请求体中提取 session ID 和项目路径
function extractSessionMeta(record) {
  try {
    // 提取 session ID
    const userId = record.requestBody?.metadata?.user_id || '';
    const match = userId.match(/session_([a-f0-9-]+)$/);
    if (match) {
      record.sessionId = match[1];
    }
    // 提取项目路径 (从 system 块中的 "Primary working directory: xxx")
    const systemBlocks = record.requestBody?.system;
    if (Array.isArray(systemBlocks)) {
      for (const block of systemBlocks) {
        if (block.text) {
          const pathMatch = block.text.match(/Primary working directory:\s*(.+)/);
          if (pathMatch) {
            record.projectPath = pathMatch[1].trim();
            break;
          }
        }
      }
    }
  } catch { /* 忽略 */ }
}

// 将项目路径转为安全的目录名：取最后两级路径，用 _ 连接
function sanitizeProjectDir(projectPath) {
  if (!projectPath) return 'unknown-project';
  // 统一分隔符，取最后两级
  const parts = projectPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const tail = parts.slice(-2).join('_');
  // 替换非法文件名字符
  return tail.replace(/[<>:"|?*]/g, '_') || 'unknown-project';
}

// 将请求/响应记录写入日志文件（纯文本格式，与 claudecode-parse 的 capture.py 一致）
// 按项目路径 + session ID 分子目录保存：requestLog/{project}/{sessionId}/{filename}.log
function saveRequestLog(record) {
  try {
    // 生成与原始项目一致的文件名: {模型名}_{来源}_{日期}_{时分秒毫秒}.log
    const model = record.requestBody?.model || 'unknown';
    const source = record.fromMitmproxy ? 'mitm' : (record.fromCli ? 'cli' : (record.injected ? 'inject' : 'api'));
    const d = new Date(record.timestamp);
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}h${pad(d.getMinutes())}m${pad(d.getSeconds())}s${pad(d.getMilliseconds(), 3)}`;
    const filename = `${model}_${source}_${dateStr}_${timeStr}.log`;

    // 按 项目/session 分目录
    const projectDir = sanitizeProjectDir(record.projectPath);
    const sessionDir = record.sessionId || 'unknown';
    const logDir = path.join(REQUEST_LOG_DIR, projectDir, sessionDir);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const ts = `${dateStr} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    const url = record.requestHeaders?.host
      ? `https://${record.requestHeaders.host}${record.path}`
      : record.path;
    const sep80 = '='.repeat(80);
    const sep40 = '─'.repeat(40);

    const lines = [];
    lines.push(sep80);
    lines.push(`请求时间: ${ts}`);
    lines.push(`请求 URL: ${url}`);
    lines.push(`响应状态: ${record.statusCode || 0}`);
    lines.push(sep80);
    lines.push('');

    lines.push(`${sep40} 请求头 ${sep40}`);
    lines.push(JSON.stringify(record.requestHeaders || {}, null, 2));
    lines.push('');

    lines.push(`${sep40} 请求参数 ${sep40}`);
    lines.push(JSON.stringify(record.requestBody || {}, null, 2));
    lines.push('');

    lines.push(`${sep40} 响应头 ${sep40}`);
    lines.push(JSON.stringify(record.responseHeaders || {}, null, 2));
    lines.push('');

    lines.push(`${sep40} 原始响应内容 ${sep40}`);
    if (record.rawResponseText) {
      lines.push(record.rawResponseText);
    } else {
      lines.push('(原始 SSE 流数据不可用)');
    }
    lines.push('');

    lines.push(`${sep40} 格式化后响应内容 ${sep40}`);
    if (record.responseBody) {
      lines.push(JSON.stringify(record.responseBody, null, 2));
    } else {
      lines.push('(无响应内容)');
    }
    lines.push('');

    const logFilePath = `${projectDir}/${sessionDir}/${filename}`;
    fs.writeFileSync(
      path.join(logDir, filename),
      lines.join('\n'),
      'utf-8'
    );
    return logFilePath;
  } catch (err) {
    console.error('[日志] 写入失败:', err.message);
    return null;
  }
}

// ========== 模板管理 ==========
// 存储从 CLI 请求中捕获的模板数据
let cliTemplate = {
  system: null,      // system prompt 数组
  tools: null,       // tools 定义数组
  headers: null,     // 关键 Headers
  capturedAt: null,  // 捕获时间
  cliVersion: null,  // CLI 版本
};

// 启动时尝试加载已保存的模板
function loadTemplate() {
  try {
    if (!fs.existsSync(TEMPLATE_DIR)) {
      fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
    }

    const templatePath = path.join(TEMPLATE_DIR, 'cli_template.json');
    if (fs.existsSync(templatePath)) {
      const data = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
      cliTemplate = data;
      console.log(`[模板] 已加载保存的模板 (CLI ${data.cliVersion || '未知版本'}, 捕获于 ${data.capturedAt || '未知时间'})`);
      console.log(`[模板]   system: ${data.system ? data.system.length + ' 块' : '无'}`);
      console.log(`[模板]   tools:  ${data.tools ? data.tools.length + ' 个' : '无'}`);
      console.log(`[模板]   headers: ${data.headers ? Object.keys(data.headers).length + ' 个' : '无'}`);
      return true;
    }
  } catch (err) {
    console.error('[模板] 加载失败:', err.message);
  }
  return false;
}

// 保存模板到文件
function saveTemplate() {
  try {
    if (!fs.existsSync(TEMPLATE_DIR)) {
      fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
    }

    // 保存合并的模板
    fs.writeFileSync(
      path.join(TEMPLATE_DIR, 'cli_template.json'),
      JSON.stringify(cliTemplate, null, 2),
      'utf-8'
    );

    // 分别保存 system 和 tools（方便单独使用）
    if (cliTemplate.system) {
      fs.writeFileSync(
        path.join(TEMPLATE_DIR, 'cli_system.json'),
        JSON.stringify(cliTemplate.system, null, 2),
        'utf-8'
      );
    }
    if (cliTemplate.tools) {
      fs.writeFileSync(
        path.join(TEMPLATE_DIR, 'cli_tools.json'),
        JSON.stringify(cliTemplate.tools, null, 2),
        'utf-8'
      );
    }
    if (cliTemplate.headers) {
      fs.writeFileSync(
        path.join(TEMPLATE_DIR, 'cli_headers.json'),
        JSON.stringify(cliTemplate.headers, null, 2),
        'utf-8'
      );
    }

    console.log(`[模板] ✓ 已保存到 ${TEMPLATE_DIR}/`);
  } catch (err) {
    console.error('[模板] 保存失败:', err.message);
  }
}

// 从请求中提取模板
function extractTemplate(headers, body) {
  if (!body || !body.system || !body.tools) return false;

  // 检测 CLI 版本（从 User-Agent 中提取）
  const ua = headers['user-agent'] || '';
  const versionMatch = ua.match(/claude-cli\/([\d.]+)/);
  const cliVersion = versionMatch ? versionMatch[1] : '未知';

  // 提取需要保存的关键 Headers
  const importantHeaders = {};
  const headerKeys = [
    'user-agent', 'x-stainless-arch', 'x-stainless-lang', 'x-stainless-os',
    'x-stainless-package-version', 'x-stainless-retry-count', 'x-stainless-runtime',
    'x-stainless-runtime-version', 'x-stainless-timeout', 'anthropic-beta',
    'anthropic-dangerous-direct-browser-access', 'anthropic-version',
    'sec-fetch-mode', 'x-app', 'accept', 'accept-language',
  ];
  for (const key of headerKeys) {
    if (headers[key]) {
      importantHeaders[key] = headers[key];
    }
  }

  cliTemplate = {
    system: body.system,
    tools: body.tools,
    headers: importantHeaders,
    capturedAt: new Date().toISOString(),
    cliVersion,
  };

  saveTemplate();

  // 广播模板更新到前端
  broadcast({
    type: 'template_updated', data: {
      cliVersion,
      capturedAt: cliTemplate.capturedAt,
      systemBlocks: body.system.length,
      toolsCount: body.tools.length,
      headersCount: Object.keys(importantHeaders).length,
      systemSize: JSON.stringify(body.system).length,
      toolsSize: JSON.stringify(body.tools).length,
    }
  });

  return true;
}

// 判断请求是否来自 CLI（根据 User-Agent）
function isCliRequest(headers) {
  const ua = headers['user-agent'] || '';
  return ua.includes('claude-cli/');
}

// 判断请求是否需要注入模板（非 CLI 且缺少 system/tools）
function needsInjection(headers, body) {
  if (isCliRequest(headers)) return false;
  if (!body || !body.messages) return false;
  // 如果已经有完整的 system 和 tools，不注入
  if (body.system && body.tools) return false;
  return true;
}

// 注入模板到请求中
function injectTemplate(body, rawHeaders) {
  if (!cliTemplate.system || !cliTemplate.tools) return { body, headers: rawHeaders };

  const injected = { ...body };

  // 注入 system（如果缺失）
  if (!injected.system) {
    injected.system = cliTemplate.system;
  }

  // 注入 tools（如果缺失）
  if (!injected.tools) {
    injected.tools = cliTemplate.tools;
  }

  // 注入 metadata（如果缺失）
  if (!injected.metadata) {
    injected.metadata = { user_id: `user_proxy_${Date.now()}` };
  }

  // 注入 max_tokens（如果缺失）
  if (!injected.max_tokens) {
    injected.max_tokens = 32000;
  }

  // 注入 thinking（如果缺失）
  if (!injected.thinking) {
    injected.thinking = { type: 'enabled', budget_tokens: 31999 };
  }

  // 注入 stream（如果缺失）
  if (injected.stream === undefined) {
    injected.stream = true;
  }

  // 合并 Headers（用模板补全缺失的）
  const mergedHeaders = { ...rawHeaders };
  if (cliTemplate.headers) {
    for (const [key, value] of Object.entries(cliTemplate.headers)) {
      if (!mergedHeaders[key]) {
        mergedHeaders[key] = value;
      }
    }
  }

  return { body: injected, headers: mergedHeaders };
}

// ========== Express 应用 ==========
const app = express();
app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));

// 解析 JSON body（保留原始 buffer 用于转发，跳过 /__proxy__/ 路径）
app.use((req, res, next) => {
  // /__proxy__/ 路径由各自的 express.json() 处理
  if (req.path.startsWith('/__proxy__/')) {
    return next();
  }
  let chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks);
    try {
      req.parsedBody = JSON.parse(req.rawBody.toString());
    } catch {
      req.parsedBody = null;
    }
    next();
  });
});

// ========== HTTP 服务器 + WebSocket ==========
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// 跟踪所有 WebSocket 连接
const wsClients = new Set();
wss.on('connection', (ws) => {
  console.log('[WS] 前端已连接');
  wsClients.add(ws);

  // 连接时发送历史请求
  ws.send(JSON.stringify({ type: 'history', data: requestHistory }));

  // 发送当前模板状态
  if (cliTemplate.capturedAt) {
    ws.send(JSON.stringify({
      type: 'template_updated', data: {
        cliVersion: cliTemplate.cliVersion,
        capturedAt: cliTemplate.capturedAt,
        systemBlocks: cliTemplate.system?.length || 0,
        toolsCount: cliTemplate.tools?.length || 0,
        headersCount: cliTemplate.headers ? Object.keys(cliTemplate.headers).length : 0,
        systemSize: cliTemplate.system ? JSON.stringify(cliTemplate.system).length : 0,
        toolsSize: cliTemplate.tools ? JSON.stringify(cliTemplate.tools).length : 0,
      }
    }));
  }

  // 接收 mitmproxy 推送的请求数据
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'mitmproxy_request' && msg.data) {
        const record = msg.data;
        extractSessionMeta(record);
        // 保存到历史
        requestHistory.push(record);
        if (requestHistory.length > MAX_HISTORY) {
          requestHistory.shift();
        }
        // 广播给其他前端客户端
        broadcast({ type: 'new_request', data: record });
        const source = record.fromCli ? 'MITM-CLI' : 'MITM-API';
        console.log(`[${new Date().toLocaleTimeString()}] [${source}] ${record.method} ${record.path}`);

        // 如果包含模板数据，尝试提取
        if (record.fromCli && record.requestBody) {
          const extracted = extractTemplate(record.requestHeaders, record.requestBody);
          if (extracted) {
            console.log(`[模板] ✓ 从 MITM 捕获的 CLI 请求中提取模板`);
          }
        }
      }
    } catch {
      // 忽略非 JSON 消息
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log('[WS] 前端已断开');
  });
});

// 广播消息到所有连接的前端
function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

// ========== 请求历史记录 ==========
const requestHistory = [];
const MAX_HISTORY = 100;

// ========== 模板查询 API ==========
app.get('/__proxy__/template', (req, res) => {
  res.json({
    hasTemplate: !!cliTemplate.capturedAt,
    cliVersion: cliTemplate.cliVersion,
    capturedAt: cliTemplate.capturedAt,
    systemBlocks: cliTemplate.system?.length || 0,
    toolsCount: cliTemplate.tools?.length || 0,
  });
});

// ========== 日志文件读取 API ==========
// 支持 sessionId/filename 格式的路径
app.get('/__proxy__/log/*', (req, res) => {
  const filePath = req.params[0];
  // 安全检查：防止路径遍历
  if (filePath.includes('..')) {
    return res.status(400).send('Invalid filename');
  }
  const logPath = path.resolve(REQUEST_LOG_DIR, filePath);
  if (!logPath.startsWith(path.resolve(REQUEST_LOG_DIR))) {
    return res.status(400).send('Invalid filename');
  }
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    res.type('text/plain; charset=utf-8').send(content);
  } catch (e) {
    res.status(404).send('日志文件不存在: ' + filePath);
  }
});

// ========== mitmproxy 数据推送 API ==========
app.post('/__proxy__/push', express.json({ limit: '50mb' }), (req, res) => {
  const msg = req.parsedBody || req.body;
  if (!msg || !msg.type) {
    return res.status(400).json({ error: '缺少 type 字段' });
  }

  if (msg.type === 'new_request' && msg.data) {
    const record = msg.data;
    extractSessionMeta(record);
    requestHistory.push(record);
    if (requestHistory.length > MAX_HISTORY) {
      requestHistory.shift();
    }
    broadcast({ type: 'new_request', data: record });

    // 提取模板
    if (record.fromCli && record.requestBody?.system && record.requestBody?.tools) {
      extractTemplate(record.requestHeaders || {}, record.requestBody);
      console.log(`[模板] ✓ 从 MITM 捕获的 CLI 请求中提取模板`);
    }

    const source = record.fromCli ? 'MITM-CLI' : 'MITM';
    console.log(`[${new Date().toLocaleTimeString()}] [${source}] ${record.method} ${record.path}`);

  } else if (msg.type === 'update_request' && msg.data) {
    // 更新历史记录中的响应头等信息
    const d = msg.data;
    for (const r of requestHistory) {
      if (r.id === d.id) {
        if (d.statusCode != null) r.statusCode = d.statusCode;
        if (d.status) r.status = d.status;
        if (d.responseHeaders) r.responseHeaders = d.responseHeaders;
        break;
      }
    }
    broadcast(msg);

  } else if (msg.type === 'request_complete' && msg.data) {
    // 更新历史记录中的响应体、响应头、状态码
    const d = msg.data;
    for (const r of requestHistory) {
      if (r.id === d.id) {
        r.status = 'complete';
        if (d.statusCode != null) r.statusCode = d.statusCode;
        if (d.responseHeaders) r.responseHeaders = d.responseHeaders;
        if (d.responseBody != null) r.responseBody = d.responseBody;
        if (d.rawResponseText != null) r.rawResponseText = d.rawResponseText;

        // 写入日志文件
        const logFile = saveRequestLog(r);
        if (logFile) {
          r.logFile = logFile;
          d.logFile = logFile;
          console.log(`[日志] ✓ ${logFile}`);
        }
        break;
      }
    }
    broadcast(msg);

  } else {
    broadcast(msg);
  }

  res.json({ ok: true });
});

// ========== 核心代理逻辑 ==========
app.all('*', (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = Date.now();
  const fromCli = isCliRequest(req.headers);

  // 如果是 CLI 请求，尝试提取模板
  if (fromCli && req.parsedBody) {
    const extracted = extractTemplate(req.headers, req.parsedBody);
    if (extracted) {
      console.log(`[模板] ✓ 从 CLI 请求中捕获模板 (${cliTemplate.cliVersion})`);
    }
  }

  // 决定是否注入模板
  let finalBody = req.parsedBody;
  let finalHeaders = { ...req.headers };
  let injected = false;

  if (needsInjection(req.headers, req.parsedBody)) {
    if (cliTemplate.capturedAt) {
      const result = injectTemplate(req.parsedBody, req.headers);
      finalBody = result.body;
      finalHeaders = result.headers;
      injected = true;
      console.log(`[注入] ✓ 已为非 CLI 请求注入模板 (system + tools + headers)`);
    } else {
      console.log(`[注入] ⚠ 非 CLI 请求缺少 system/tools，但模板尚未捕获。请先用 CLI 发一条消息。`);
    }
  }

  // 构建请求记录
  const record = {
    id: requestId,
    timestamp,
    method: req.method,
    path: req.originalUrl,
    requestHeaders: { ...finalHeaders },
    requestBody: finalBody,
    responseHeaders: {},
    responseChunks: [],
    responseBody: null,
    status: 'pending',
    statusCode: null,
    fromCli,
    injected,
  };

  delete record.requestHeaders['host'];

  // 保存到历史
  extractSessionMeta(record);
  requestHistory.push(record);
  if (requestHistory.length > MAX_HISTORY) {
    requestHistory.shift();
  }

  // 广播新请求
  broadcast({ type: 'new_request', data: record });

  const source = fromCli ? 'CLI' : (injected ? 'API+注入' : 'API');
  console.log(`[${new Date().toLocaleTimeString()}] [${source}] ${req.method} ${req.originalUrl}`);

  // 重新序列化 body（注入后可能已修改）
  const bodyBuffer = injected ? Buffer.from(JSON.stringify(finalBody)) : req.rawBody;

  // 构建转发请求选项
  const targetUrl = new URL(req.originalUrl, TARGET_BASE);
  const proxyHeaders = { ...finalHeaders };
  proxyHeaders['host'] = TARGET_HOST;
  delete proxyHeaders['accept-encoding'];

  // 更新 content-length（注入后 body 大小变化）
  if (bodyBuffer && bodyBuffer.length > 0) {
    proxyHeaders['content-length'] = String(bodyBuffer.length);
  }

  const options = {
    hostname: targetUrl.hostname,
    port: 443,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: proxyHeaders,
  };

  // 发起 HTTPS 请求到目标
  const proxyReq = https.request(options, (proxyRes) => {
    record.statusCode = proxyRes.statusCode;
    record.responseHeaders = { ...proxyRes.headers };
    record.status = 'streaming';

    broadcast({ type: 'update_request', data: { id: requestId, statusCode: proxyRes.statusCode, status: 'streaming', responseHeaders: record.responseHeaders } });

    res.writeHead(proxyRes.statusCode, proxyRes.headers);

    proxyRes.on('data', (chunk) => {
      const chunkStr = chunk.toString();
      record.responseChunks.push(chunkStr);
      broadcast({ type: 'response_chunk', data: { id: requestId, chunk: chunkStr } });
      res.write(chunk);
    });

    proxyRes.on('end', () => {
      record.status = 'complete';

      const fullResponse = record.responseChunks.join('');
      try {
        record.responseBody = JSON.parse(fullResponse);
      } catch {
        record.responseBody = null;
      }

      // 写入日志文件
      const logFile = saveRequestLog(record);
      if (logFile) {
        record.logFile = logFile;
      }

      broadcast({ type: 'request_complete', data: { id: requestId, status: 'complete', responseBody: record.responseBody, logFile } });

      console.log(`[${new Date().toLocaleTimeString()}] ✓ [${source}] ${req.originalUrl} → ${proxyRes.statusCode} (${record.responseChunks.length} chunks)${logFile ? ' → ' + logFile : ''}`);
      res.end();
    });
  });

  proxyReq.on('error', (err) => {
    record.status = 'error';
    record.error = err.message;
    broadcast({ type: 'request_error', data: { id: requestId, error: err.message } });
    console.error(`[错误] ${req.originalUrl}:`, err.message);

    if (!res.headersSent) {
      res.status(502).json({ error: '代理转发失败', detail: err.message });
    }
  });

  if (bodyBuffer && bodyBuffer.length > 0) {
    proxyReq.write(bodyBuffer);
  }
  proxyReq.end();
});

// ========== 启动服务 ==========
loadTemplate();

server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Claude Code 请求监听代理服务 (增强版)                     ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║   代理地址:  http://localhost:${PROXY_PORT}                          ║`);
  console.log(`║   转发目标:  ${TARGET_BASE}                       ║`);
  console.log(`║   WebSocket: ws://localhost:${PROXY_PORT}/ws                        ║`);
  console.log(`║   模板目录:  ${TEMPLATE_DIR}  ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║   使用方法:                                                 ║');
  console.log('║   1. 设置环境变量:                                          ║');
  console.log(`║      set ANTHROPIC_BASE_URL=http://localhost:${PROXY_PORT}           ║`);
  console.log('║      set CLAUDE_CODE_ATTRIBUTION_HEADER=0                   ║');
  console.log('║      set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1         ║');
  console.log('║   2. 启动 Claude Code (claude)                              ║');
  console.log('║   3. 发一条消息 → 代理自动捕获 CLI 模板                     ║');
  console.log('║   4. 之后可用简单 API 请求，代理自动注入模板通过验证        ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║   模板状态: ${cliTemplate.capturedAt ? '✓ 已加载 (' + cliTemplate.cliVersion + ')' : '✗ 未捕获，请先用 CLI 发消息'}        ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
});
