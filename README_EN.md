<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61dafb?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Express-4.18-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/mitmproxy-Capture-ff6600" alt="mitmproxy" />
</p>

<p align="right"><a href="./README.md">中文</a></p>

# Claude Devtools

> Visualize your Claude Code session history & monitor API traffic in real time

Claude Devtools is a local debugging tool for Claude Code developers. It renders Claude Agent session traces as interactive DAGs (Directed Acyclic Graphs) and captures real-time API requests/responses via mitmproxy, helping developers understand Agent execution flows, debug prompts, and optimize token usage.

---

## Screenshots

### Session Traces — DAG Visualization

![Session Traces](images/sessionTraces.png)

- Browse projects & sessions in the left sidebar
- Canvas renders USER / ASSISTANT / TOOL / TASK / SUBAGENT nodes as a DAG
- Search, collapse chains, and expand detail panels

### Live Monitor — Real-time API Monitoring

![Live Monitor](images/liveMonitor.png)

- Left panel shows a live list of every API call made by Claude Code CLI
- Right panel displays structured request body: model, messages, system, tools, metadata, thinking, token usage, etc.
- Automatic aggregation of input / output / cache tokens

---

## Key Features

| Feature | Description |
|---------|-------------|
| **DAG Visualization** | Renders session events as a directed graph with node types: USER / ASSISTANT / TOOL / TASK / HOOK / SUBAGENT |
| **Subagent Branching** | Task nodes branch right, subagent chains run in parallel columns |
| **Time-based Layout** | Y-axis follows timestamps; parallel chains align; sequential segments use compact spacing |
| **Chain Collapsing** | Linear non-branching nodes auto-collapse; click to expand in a side panel |
| **Event Detail Panel** | Click any node to inspect metadata, content blocks, thinking, tool inputs/results, raw YAML/JSON |
| **Session Browser** | Sidebar lists all projects and sessions with event counts and timestamps |
| **Real-time Monitoring** | Captures Claude Code CLI API traffic via mitmproxy with WebSocket live push |
| **Template Capture** | Auto-saves system prompts and tool definitions for reuse |

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **yarn** or **npm**
- **Python 3** + [mitmproxy](https://mitmproxy.org/) (required for Live Monitor)
- **Claude Code CLI** (`claude` command available)

### Installation

```bash
git clone https://github.com/anthropics/claude-devtools.git
cd claude-devtools
yarn install
```

### One-click Launch

Use the launcher script to start all services and set environment variables automatically:

**Windows (PowerShell)**
```powershell
.\start-devtools.ps1
```

**macOS / Linux**
```bash
chmod +x start-devtools.sh
./start-devtools.sh
```

The script starts the following services, then opens Claude CLI in the current terminal:

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Devtools Web UI |
| Trace API | http://localhost:3001 | Session trace reader API |
| Proxy | http://localhost:5555 | WebSocket live push service |
| mitmproxy | http://localhost:9581 | HTTPS traffic interception proxy |

### Manual Start

If you only need Session Traces (no live monitoring):

```bash
yarn dev
```

For live monitoring, start mitmproxy separately and set environment variables:

```bash
# Terminal 1 — Start all dev services
yarn dev

# Terminal 2 — Start mitmproxy
mitmdump -s server/capture.py -p 9581 --quiet

# Terminal 3 — Set env vars and launch Claude CLI
export HTTPS_PROXY="http://127.0.0.1:9581"
export NODE_TLS_REJECT_UNAUTHORIZED="0"
export CLAUDE_CODE_ATTRIBUTION_HEADER="0"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1"
claude
```

---

## Configuration

### Trace Directory

By default, session traces are read from `~/.claude/projects`. Override with an environment variable:

```bash
TRACES_DIR=/path/to/projects yarn dev
```

Or pass it directly when running the server standalone:

```bash
node --import tsx/esm server/index.ts /path/to/projects
```

Each project is a subdirectory containing `.jsonl` session files. Subagent traces live at `<project>/<sessionId>/subagents/<agentId>.jsonl`.

### npm Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start all services (frontend + trace API + proxy + capture) |
| `yarn client` | Start frontend only (Vite dev server) |
| `yarn server` | Start trace API server only |
| `yarn proxy` | Start WebSocket proxy service only |
| `yarn capture` | Start mitmproxy capture script only |
| `yarn build` | Production build (Vite + tsc) |

---

## Architecture

```mermaid
graph TD
    CLI["<b>Claude Code CLI</b><br/>HTTPS_PROXY → mitmproxy"]
    MITM["<b>mitmproxy</b><br/>capture.py · port 9581<br/>Intercepts Claude API traffic"]
    API["<b>Anthropic API</b><br/>api.anthropic.com"]
    PROXY["<b>Proxy WS</b><br/>port 5555<br/>WebSocket live push"]
    TRACE["<b>Trace API Server</b><br/>Express · port 3001<br/>Reads ~/.claude/projects JSONL"]
    FE["<b>Frontend</b><br/>React · port 3000<br/>DAG Visualization + Live Monitor"]
    JSONL[("~/.claude/projects<br/>JSONL session files")]

    CLI -- "HTTPS" --> MITM
    MITM -- "Forward request" --> API
    API -- "Return response" --> MITM
    MITM -- "HTTP POST<br/>captured req/res" --> PROXY
    PROXY -- "WebSocket<br/>real-time push" --> FE
    TRACE -- "REST /api" --> FE
    JSONL -. "read" .-> TRACE

    style CLI fill:#1e3a5f,stroke:#60a5fa,color:#f1f5f9
    style MITM fill:#7c2d12,stroke:#fb923c,color:#f1f5f9
    style API fill:#475569,stroke:#94a3b8,color:#f1f5f9
    style PROXY fill:#134e4a,stroke:#2dd4bf,color:#f1f5f9
    style TRACE fill:#312e81,stroke:#a5b4fc,color:#f1f5f9
    style FE fill:#1e3a5f,stroke:#60a5fa,color:#f1f5f9
    style JSONL fill:#1a2237,stroke:#64748b,color:#94a3b8
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, @xyflow/react v12, Tailwind CSS 4, TypeScript |
| **Layout** | Custom timestamp + lane-based algorithm, dagre |
| **Backend** | Express 4, WebSocket (ws), line-by-line JSONL reader |
| **Traffic Capture** | mitmproxy (Python), capture.py addon |
| **Build** | Vite 5, tsx, concurrently |

---

## License

MIT
