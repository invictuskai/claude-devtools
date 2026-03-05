# capture.py - mitmproxy addon 脚本
# 拦截 Claude Code CLI 的 HTTPS 请求，通过 HTTP POST 推送到 Express 代理
#
# 用法：
#   mitmdump -s server/capture.py -p 8080 --quiet
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
from urllib.request import Request, urlopen
from urllib.error import URLError

# Express 代理推送地址
PUSH_URL = os.environ.get("CAPTURE_PUSH_URL", "http://localhost:5555/__proxy__/push")
# 日志保存目录
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "requestLog")
# 模板保存目录
TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")


def _ensure_dir(d):
    if not os.path.exists(d):
        os.makedirs(d, exist_ok=True)


def _push_to_proxy(message: dict):
    """通过 HTTP POST 推送数据到 Express 代理（后台线程，不阻塞 mitmproxy）"""
    def _do_push():
        try:
            data = json.dumps(message).encode("utf-8")
            req = Request(
                PUSH_URL,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            resp = urlopen(req, timeout=5)
            resp.read()
        except URLError as e:
            print(f"[push] ⚠ 推送失败: {e.reason}")
        except Exception as e:
            print(f"[push] ⚠ 推送失败: {e}")

    threading.Thread(target=_do_push, daemon=True).start()


def _parse_sse_to_body(text: str) -> dict:
    """将 SSE 流式响应解析为结构化数据"""
    thinking = ""
    output_text = ""
    model = ""
    message_id = ""
    stop_reason = ""
    usage = {}

    for line in text.split("\n"):
        line = line.strip()
        if not line.startswith("data: "):
            continue
        try:
            data = json.loads(line[6:])
        except json.JSONDecodeError:
            continue

        dtype = data.get("type", "")

        if dtype == "message_start":
            msg = data.get("message", {})
            model = msg.get("model", "")
            message_id = msg.get("id", "")
            if msg.get("usage"):
                usage.update(msg["usage"])

        elif dtype == "content_block_delta":
            delta = data.get("delta", {})
            if delta.get("type") == "thinking_delta":
                thinking += delta.get("thinking", "")
            elif delta.get("type") == "text_delta":
                output_text += delta.get("text", "")

        elif dtype == "message_delta":
            stop_reason = data.get("delta", {}).get("stop_reason", "")
            if data.get("usage"):
                usage.update(data["usage"])

    return {
        "_sse_parsed": True,
        "model": model,
        "id": message_id,
        "thinking": thinking,
        "text": output_text,
        "stop_reason": stop_reason,
        "usage": usage,
    }


def load(loader):
    """mitmproxy 加载时初始化"""
    _ensure_dir(LOG_DIR)
    _ensure_dir(TEMPLATE_DIR)

    print("")
    print("╔══════════════════════════════════════════════╗")
    print("║  Claude Code MITM 抓包脚本                  ║")
    print("╠══════════════════════════════════════════════╣")
    print(f"║  推送地址: {PUSH_URL:<33}║")
    print(f"║  日志目录: {LOG_DIR:<33}║")
    print("╠══════════════════════════════════════════════╣")
    print("║  请确保 Express 代理已启动: npm run proxy    ║")
    print("╚══════════════════════════════════════════════╝")
    print("")

    # 测试推送连通性
    try:
        req = Request(PUSH_URL.replace("/push", "/template"), method="GET")
        resp = urlopen(req, timeout=3)
        resp.read()
        print("[push] ✓ Express 代理连通正常")
    except Exception:
        print("[push] ⚠ Express 代理未响应，请确认是否已启动")


def request(flow: http.HTTPFlow):
    """拦截请求"""
    if "messages" not in flow.request.path:
        return

    try:
        body = json.loads(flow.request.content.decode())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return

    headers = dict(flow.request.headers)
    import datetime
    now = datetime.datetime.now()
    ts = now.strftime("%Y-%m-%d %H:%M:%S.") + f"{now.microsecond // 1000:03d}"
    ts_file = now.strftime("%Y-%m-%d_%H时%M分%S秒") + f"{now.microsecond // 1000:03d}"
    request_id = f"mitm_{int(time.time() * 1000)}_{id(flow) % 100000:05d}"

    # 缓存到 flow.metadata，等响应时一起写日志
    flow.metadata["capture_id"] = request_id
    flow.metadata["capture_ts"] = ts
    flow.metadata["capture_ts_file"] = ts_file
    flow.metadata["capture_headers"] = headers
    flow.metadata["capture_body"] = body
    flow.metadata["capture_url"] = flow.request.pretty_url

    ua = headers.get("user-agent", "")
    from_cli = "claude-cli/" in ua
    flow.metadata["capture_from_cli"] = from_cli

    # 推送给前端
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
    _push_to_proxy({"type": "new_request", "data": record})

    # 如果是 CLI 请求且包含完整模板，保存
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
        _ensure_dir(TEMPLATE_DIR)
        with open(os.path.join(TEMPLATE_DIR, "cli_template.json"), "w", encoding="utf-8") as f:
            json.dump(template, f, ensure_ascii=False, indent=2)

        _push_to_proxy({
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


def response(flow: http.HTTPFlow):
    """拦截响应，与请求信息一起写入日志文件"""
    if "messages" not in flow.request.path:
        return

    request_id = flow.metadata.get("capture_id")
    if not request_id:
        return

    status_code = flow.response.status_code if flow.response else 0
    resp_headers = dict(flow.response.headers) if flow.response else {}

    # 解析响应体
    response_text = ""
    response_body = None
    if flow.response and flow.response.content:
        response_text = flow.response.content.decode("utf-8", errors="replace")
        content_type = resp_headers.get("content-type", "") or resp_headers.get("Content-Type", "")
        is_sse = "text/event-stream" in content_type

        if is_sse:
            response_body = _parse_sse_to_body(response_text)
        else:
            try:
                response_body = json.loads(response_text)
            except json.JSONDecodeError:
                pass

    # 从 flow.metadata 取出请求阶段缓存的数据
    req_headers = flow.metadata.get("capture_headers", {})
    req_body = flow.metadata.get("capture_body", {})
    req_url = flow.metadata.get("capture_url", "")
    ts = flow.metadata.get("capture_ts", time.strftime("%Y-%m-%d %H:%M:%S.000"))
    ts_file = flow.metadata.get("capture_ts_file", time.strftime("%Y-%m-%d_%H-%M-%S.000"))

    # 文件名格式: 模型_mitm_时间戳.log
    model = req_body.get("model", "unknown") if req_body else "unknown"
    log_filename = f"{model}_mitm_{ts_file}.log"
    log_path = os.path.join(LOG_DIR, log_filename)

    _ensure_dir(LOG_DIR)
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(f"{'='*80}\n")
        f.write(f"请求时间: {ts}\n")
        f.write(f"请求 URL: {req_url}\n")
        f.write(f"响应状态: {status_code}\n")
        f.write(f"{'='*80}\n\n")

        f.write(f"{'─'*40} 请求头 {'─'*40}\n")
        f.write(json.dumps(req_headers, indent=2, ensure_ascii=False))
        f.write("\n\n")

        f.write(f"{'─'*40} 请求参数 {'─'*40}\n")
        f.write(json.dumps(req_body, indent=2, ensure_ascii=False))
        f.write("\n\n")

        f.write(f"{'─'*40} 响应头 {'─'*40}\n")
        f.write(json.dumps(resp_headers, indent=2, ensure_ascii=False))
        f.write("\n\n")

        f.write(f"{'─'*40} 原始响应内容 {'─'*40}\n")
        f.write(response_text)
        f.write("\n\n")

        f.write(f"{'─'*40} 格式化后响应内容 {'─'*40}\n")
        if response_body:
            f.write(json.dumps(response_body, indent=2, ensure_ascii=False))
        else:
            f.write(response_text)
        f.write("\n")

    # 单次推送：包含 responseHeaders + responseBody + statusCode + logFile
    _push_to_proxy({
        "type": "request_complete",
        "data": {
            "id": request_id,
            "status": "complete",
            "statusCode": status_code,
            "responseHeaders": resp_headers,
            "responseBody": response_body,
            "rawResponseText": response_text,
            "logFile": log_filename,
        }
    })

    print(f"本次请求日志已保存<{log_path}>")
