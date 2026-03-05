<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61dafb?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Express-4.18-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/mitmproxy-Capture-ff6600" alt="mitmproxy" />
</p>

<p align="right"><a href="./README_EN.md">English</a></p>

# Claude Devtools

> 可视化你的 Claude Code 会话历史 & 实时监控 API 流量

Claude Devtools 是一款面向 Claude Code 开发者的本地调试工具。它将 Claude Agent 的会话 trace 渲染为可交互的 DAG（有向无环图），同时通过 mitmproxy 拦截并展示实时 API 请求/响应，帮助开发者理解 Agent 的执行流程、调试 prompt 和优化 token 用量。

---

## 截图

### Session Traces — DAG 可视化

![Session Traces](images/sessionTraces.png)

- 左侧边栏浏览项目 & 会话
- 画布上以 DAG 展示 user / assistant / tool / task / subagent 节点
- 支持搜索、折叠链、展开详情面板

### Live Monitor — 实时 API 监控

![Live Monitor](images/liveMonitor.png)

- 左侧请求列表，实时显示 Claude Code CLI 发出的每一次 API 调用
- 右侧结构化展示请求体：model、messages、system、tools、metadata、thinking、token 用量等
- 自动统计 input / output / cache token 汇总

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **DAG 可视化** | 将会话事件渲染为有向图，节点类型包括 USER / ASSISTANT / TOOL / TASK / HOOK / SUBAGENT |
| **子代理分支** | Task 节点右分支，subagent 链在并行列中运行 |
| **时间轴布局** | 纵轴按时间戳排列，并行链对齐，顺序段紧凑排列 |
| **链折叠** | 线性无分支节点自动折叠，点击在侧面板中展开 |
| **事件详情面板** | 点击节点查看 metadata、content blocks、thinking、tool 输入/结果、原始 YAML/JSON |
| **会话浏览器** | 侧栏列出所有项目和会话，显示事件数和时间戳 |
| **实时代理监控** | 通过 mitmproxy 捕获 Claude Code CLI 的 API 流量，WebSocket 实时推送 |
| **模板捕获** | 自动保存 system prompt 和 tool 定义供复用 |

---

## 快速开始

### 前置条件

- **Node.js** >= 18
- **yarn** 或 **npm**
- **Python 3** + [mitmproxy](https://mitmproxy.org/)（Live Monitor 功能需要）
- **Claude Code CLI**（`claude` 命令可用）

### 安装

```bash
git clone https://github.com/anthropics/claude-devtools.git
cd claude-devtools
yarn install
```

### 一键启动

推荐使用一键启动脚本，它会自动启动所有服务并设置环境变量：

**Windows (PowerShell)**
```powershell
.\start-devtools.ps1
```

**macOS / Linux**
```bash
chmod +x start-devtools.sh
./start-devtools.sh
```

脚本会依次启动以下服务，然后在当前终端打开 Claude CLI：

| 服务 | 地址 | 说明 |
|------|------|------|
| Frontend | http://localhost:3000 | Devtools Web 界面 |
| Trace API | http://localhost:3001 | 会话 trace 读取 API |
| Proxy | http://localhost:5555 | WebSocket 实时推送服务 |
| mitmproxy | http://localhost:9581 | HTTPS 流量拦截代理 |

### 手动启动

如果你只需要 Session Traces 功能（不需要实时监控）：

```bash
yarn dev
```

如果需要实时监控，额外启动 mitmproxy 并设置环境变量：

```bash
# 终端 1 — 启动所有开发服务
yarn dev

# 终端 2 — 启动 mitmproxy
mitmdump -s server/capture.py -p 9581 --quiet

# 终端 3 — 设置环境变量后启动 Claude CLI
export HTTPS_PROXY="http://127.0.0.1:9581"
export NODE_TLS_REJECT_UNAUTHORIZED="0"
export CLAUDE_CODE_ATTRIBUTION_HEADER="0"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1"
claude
```

---

## 配置

### Trace 目录

默认从 `~/.claude/projects` 读取会话 trace 文件。可通过环境变量覆盖：

```bash
TRACES_DIR=/path/to/projects yarn dev
```

或直接运行服务端：

```bash
node --import tsx/esm server/index.ts /path/to/projects
```

每个项目是一个子目录，包含 `.jsonl` 会话文件。子代理 trace 位于 `<project>/<sessionId>/subagents/<agentId>.jsonl`。

### npm 脚本

| 命令 | 说明 |
|------|------|
| `yarn dev` | 启动全部服务（frontend + trace API + proxy + capture） |
| `yarn client` | 仅启动前端（Vite dev server） |
| `yarn server` | 仅启动 trace API server |
| `yarn proxy` | 仅启动 WebSocket 代理服务 |
| `yarn capture` | 仅启动 mitmproxy 捕获脚本 |
| `yarn build` | 生产构建（Vite + tsc） |

---

## 架构

```mermaid
graph TD
    CLI["<b>Claude Code CLI</b><br/>HTTPS_PROXY → mitmproxy"]
    MITM["<b>mitmproxy</b><br/>capture.py · port 9581<br/>拦截 Claude API 请求/响应"]
    API["<b>Anthropic API</b><br/>api.anthropic.com"]
    PROXY["<b>Proxy WS</b><br/>port 5555<br/>WebSocket 实时推送"]
    TRACE["<b>Trace API Server</b><br/>Express · port 3001<br/>读取 ~/.claude/projects JSONL"]
    FE["<b>Frontend</b><br/>React · port 3000<br/>DAG 可视化 + Live Monitor"]
    JSONL[("~/.claude/projects<br/>JSONL 会话文件")]

    CLI -- "HTTPS" --> MITM
    MITM -- "转发请求" --> API
    API -- "返回响应" --> MITM
    MITM -- "HTTP POST<br/>捕获的请求/响应" --> PROXY
    PROXY -- "WebSocket<br/>实时推送" --> FE
    TRACE -- "REST /api" --> FE
    JSONL -. "读取" .-> TRACE

    style CLI fill:#1e3a5f,stroke:#60a5fa,color:#f1f5f9
    style MITM fill:#7c2d12,stroke:#fb923c,color:#f1f5f9
    style API fill:#475569,stroke:#94a3b8,color:#f1f5f9
    style PROXY fill:#134e4a,stroke:#2dd4bf,color:#f1f5f9
    style TRACE fill:#312e81,stroke:#a5b4fc,color:#f1f5f9
    style FE fill:#1e3a5f,stroke:#60a5fa,color:#f1f5f9
    style JSONL fill:#1a2237,stroke:#64748b,color:#94a3b8
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| **前端** | React 18, @xyflow/react v12, Tailwind CSS 4, TypeScript |
| **布局算法** | 自定义时间戳 + 泳道布局，dagre 辅助 |
| **后端** | Express 4, WebSocket (ws), 逐行读取 JSONL |
| **流量捕获** | mitmproxy (Python), capture.py addon |
| **构建** | Vite 5, tsx, concurrently |

---

## License

MIT
