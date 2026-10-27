#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/.."
uv add "pydantic-ai-slim[ag-ui,openai]" fastapi uvicorn aiosqlite 2>&1 | tail -8
echo "=== installed ==="
uv pip list 2>/dev/null | grep -iE "pydantic|ag-ui|fastapi|uvicorn|starlette"
