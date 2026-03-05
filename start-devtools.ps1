# Claude Devtools - One-click launcher
# Usage: .\start-devtools.ps1

$PROJECT_DIR = $PSScriptRoot
$MITM_PORT = 9581

Write-Host ""
Write-Host "  Claude Devtools - Starting..." -ForegroundColor Cyan
Write-Host ""

# 1. Start yarn dev (frontend:3000 + trace:3001 + proxy:5555)
Write-Host "  [1/3] Starting yarn dev ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PROJECT_DIR'; Write-Host 'Claude Devtools - Frontend + Server' -ForegroundColor Cyan; yarn dev"

# 2. Start mitmproxy
Write-Host "  [2/3] Starting mitmproxy on port $MITM_PORT ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Claude Devtools - mitmproxy' -ForegroundColor Cyan; mitmdump -s '$PROJECT_DIR\server\capture.py' -p $MITM_PORT --quiet"

# 3. Wait for services to be ready
Write-Host "  [3/3] Waiting for services ..." -ForegroundColor Yellow
Start-Sleep -Seconds 4

# 4. Set env vars and start Claude CLI in current terminal
$env:HTTPS_PROXY = "http://127.0.0.1:$MITM_PORT"
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
$env:CLAUDE_CODE_ATTRIBUTION_HEADER = "0"
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1"

Write-Host ""
Write-Host "  All services started:" -ForegroundColor Green
Write-Host "    Frontend:  http://localhost:3000" -ForegroundColor DarkGray
Write-Host "    Trace API: http://localhost:3001" -ForegroundColor DarkGray
Write-Host "    Proxy:     http://localhost:5555" -ForegroundColor DarkGray
Write-Host "    mitmproxy: http://localhost:$MITM_PORT" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Launching Claude CLI ..." -ForegroundColor Cyan
Write-Host ""

claude
