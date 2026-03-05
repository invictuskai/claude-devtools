#!/usr/bin/env bash
# Claude Devtools - One-click launcher (macOS / Linux)
# Usage: ./start-devtools.sh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MITM_PORT=9581

# Colors
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
GRAY='\033[0;90m'
NC='\033[0m'

echo ""
echo -e "  ${CYAN}Claude Devtools - Starting...${NC}"
echo ""

# Cleanup background processes on exit
PIDS=()
cleanup() {
  echo ""
  echo -e "  ${YELLOW}Shutting down services...${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo -e "  ${GREEN}Done.${NC}"
}
trap cleanup EXIT INT TERM

# 1. Start yarn dev (frontend:3000 + trace:3001 + proxy:5555)
echo -e "  ${YELLOW}[1/3] Starting yarn dev ...${NC}"
cd "$PROJECT_DIR"
yarn dev > /dev/null 2>&1 &
PIDS+=($!)

# 2. Start mitmproxy
echo -e "  ${YELLOW}[2/3] Starting mitmproxy on port ${MITM_PORT} ...${NC}"
mitmdump -s "$PROJECT_DIR/server/capture.py" -p "$MITM_PORT" --quiet &
PIDS+=($!)

# 3. Wait for services to be ready
echo -e "  ${YELLOW}[3/3] Waiting for services ...${NC}"
sleep 4

# 4. Set env vars and start Claude CLI in current shell
export HTTPS_PROXY="http://127.0.0.1:${MITM_PORT}"
export NODE_TLS_REJECT_UNAUTHORIZED="0"
export CLAUDE_CODE_ATTRIBUTION_HEADER="0"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1"

echo ""
echo -e "  ${GREEN}All services started:${NC}"
echo -e "    ${GRAY}Frontend:  http://localhost:3000${NC}"
echo -e "    ${GRAY}Trace API: http://localhost:3001${NC}"
echo -e "    ${GRAY}Proxy:     http://localhost:5555${NC}"
echo -e "    ${GRAY}mitmproxy: http://localhost:${MITM_PORT}${NC}"
echo ""
echo -e "  ${CYAN}Launching Claude CLI ...${NC}"
echo ""

claude
