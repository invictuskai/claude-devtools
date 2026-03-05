# capture_standalone.py - 独立模式 mitmproxy 抓包脚本
# 内置 WebSocket 服务器，不依赖 Express 代理即可与前端通信
#
# 用法：
#   mitmdump -s server/capture_standalone.py -p 8080 --quiet
#
# 前端连接 ws://localhost:5555/ws 即可接收推送
#
# 然后在另一个终端：
#   $env:HTTPS_PROXY="http://127.0.0.1:8080"
#   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
#   $env:CLAUDE_CODE_ATTRIBUTION_HEADER="0"
#   $env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1"
#   claude

from mitmproxy import http
import json
import os
import re
import time
import threading
import asyncio

# 配置
WS_PORT = int(os.environ.get("CAPTURE_WS_PORT", "5555"))
TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")

# 全局状态
_ws_clients = set()
_ws_loop = None
_ws_thread = None
_request_history = []
_MAX_HISTORY = 100


def _ensure_template_dir():
    if not os.path.exists(TEMPLATE_DIR):
        os.makedirs(TEMPLATE_DIR, exist_ok=True)


def _save_captured(data: dict, filename: str = "captured.json"):
    _ensure_template_dir()
    filepath = os.path.join(TEMPLATE_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _broadcast(message: dict):
    """广播消息到所有连接的前端"""
    global _ws_loop
    if not _ws_loop or not _ws_clients:
        return

    data = json.dumps(message)

    async def _do_broadcast():
        disconnected = set()
        for ws in _ws_clients.copy():
            try:
                await ws.send(data)
            except Exception:
                disconnected.add(ws)
        _ws_clients.difference_update(disconnected)

    asyncio.run_coroutine_threadsafe(_do_broadcast(), _ws_loop)


def _start_ws_server():
    """启动内置 WebSocket 服务器"""
    global _ws_loop

    _ws_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_ws_loop)

    async def _handler(websocket):
        print(f"[WS] 前端已连接")
        _ws_clients.add(websocket)

        # 发送历史记录
        try:
            await websocket.send(json.dumps({
                "type": "history",
                "data": _request_history,
            }))
        except Exception:
            pass

        try:
            async for _ in websocket:
                pass  # 忽略客户端消息
        except Exception:
            pass
        finally:
            _ws_clients.discard(websocket)
            print(f"[WS] 前端已断开")

    async def _serve():
        import websockets
        server = await websockets.serve(_handler, "127.0.0.1", WS_PORT, path="/ws")
        print(f"[WS] ✓ WebSocket 服务器启动: ws://localhost:{WS_PORT}/ws")
        await server.wait_closed()

    _ws_loop.run_until_complete(_serve())


def load(loader):
    """mitmproxy 加载时初始化"""
    global _ws_thread

    print("")
    print("╔══════════════════════════════════════════════╗")
    print("║  Claude Code MITM 抓包 (独立模式)           ║")
    print("╠══════════════════════════════════════════════╣")
    print(f"║  WebSocket: ws://localhost:{WS_PORT}/ws             ║")
    print(f"║  模板目录:  {TEMPLATE_DIR:<33}║")
    print("╠══════════════════════════════════════════════╣")
    print("║  前端连接 ws://localhost:5555/ws 即可        ║")
    print("║  无需启动 Express 代理                       ║")
    print("╚══════════════════════════════════════════════╝")
    print("")

    _ws_thread = threading.Thread(target=_start_ws_server, daemon=True)
    _ws_thread.start()
    time.sleep(0.5)


def request(flow: http.HTTPFlow):
    """拦截请求"""
    if "messages" not in flow.request.path:
        return

    try:
        body = json.loads(flow.request.content.decode())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return

    headers = dict(flow.request.headers)
    request_id = f"mitm_{int(time.time() * 1000)}_{id(flow) % 100000:05d}"

    # 保存到文件
    _save_captured({
        "url": flow.request.pretty_url,
        "headers": headers,
        "body": body,
    })

    ua = headers.get("user-agent", "")
    from_cli = "claude-cli/" in ua

    # 构建记录
    record = {
        "id": request_id,
        "timestamp": int(time.time() * 1000),
        "method": flow.request.method,
        "path": flow.request.path,
        "requestHeaders": headers,
        "requestBody": body,
        "responseHeaders": {},
        "responseChunks": [],
        "responseBody": None,
        "status": "pending",
        "statusCode": None,
        "fromCli": from_cli,
        "injected": False,
        "fromMitmproxy": True,
    }

    # 保存到历史
    _request_history.append(record)
    if len(_request_history) > _MAX_HISTORY:
        _request_history.pop(0)

    # 广播
    _broadcast({"type": "new_request", "data": record})

    # 如果是 CLI + 完整模板，保存
    if from_cli and body.get("system") and body.get("tools"):
        cli_version = "未知"
        match = re.search(r"claude-cli/([\d.]+)", ua)
        if match:
            cli_version = match.group(1)

        template = {
            "system": body["system"],
            "tools": body["tools"],
            "headers": headers,
            "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "cliVersion": cli_version,
        }
        _save_captured(template, "cli_template.json")

        _broadcast({
            "type": "template_updated",
            "data": {
                "cliVersion": cli_version,
                "capturedAt": template["capturedAt"],
                "systemBlocks": len(body["system"]),
                "toolsCount": len(body["tools"]),
                "headersCount": len(headers),
                "systemSize": len(json.dumps(body["system"])),
                "toolsSize": len(json.dumps(body["tools"])),
            }
        })
        print(f"[*] ✓ CLI 模板已保存 (v{cli_version})")

    model = body.get("model", "未知")
    msg_count = len(body.get("messages", []))
    source = "CLI" if from_cli else "API"
    print(f"[*] [{source}] 已捕获: {model} | {msg_count} msgs | {len(headers)} headers")

    # 将 flow 与 request_id 关联（用于响应匹配）
    flow.metadata["capture_id"] = request_id


def response(flow: http.HTTPFlow):
    """拦截响应"""
    if "messages" not in flow.request.path:
        return

    request_id = flow.metadata.get("capture_id")
    if not request_id:
        return

    status_code = flow.response.status_code if flow.response else 0

    # 更新状态
    _broadcast({
        "type": "update_request",
        "data": {
            "id": request_id,
            "statusCode": status_code,
            "status": "streaming",
            "responseHeaders": dict(flow.response.headers) if flow.response else {},
        }
    })

    # 解析响应体
    response_body = None
    if flow.response and flow.response.content:
        content = flow.response.content.decode("utf-8", errors="replace")
        try:
            response_body = json.loads(content)
        except json.JSONDecodeError:
            response_body = None

    # 更新历史记录
    for r in _request_history:
        if r["id"] == request_id:
            r["status"] = "complete"
            r["statusCode"] = status_code
            r["responseHeaders"] = dict(flow.response.headers) if flow.response else {}
            r["responseBody"] = response_body
            break

    _broadcast({
        "type": "request_complete",
        "data": {
            "id": request_id,
            "status": "complete",
            "responseBody": response_body,
        }
    })

    print(f"[*] ✓ 响应: {flow.request.path} → {status_code}")
