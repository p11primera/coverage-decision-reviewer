FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY src ./src
RUN uv sync --frozen --no-dev

COPY backend ./backend
COPY scripts ./scripts

# /data is the compose named-volume mount (hermes-data). Docker only seeds a fresh named
# volume with the image directory's ownership when the mountpoint is NON-EMPTY — an empty
# /data yields a root-owned volume that appuser cannot write reviewer.db into. The .keep
# file is what triggers copy-on-create (verified via `docker compose up` on the Pi host).
# AKS equivalent: give the PVC a fsGroup in pod securityContext so it mounts group-writable.
RUN useradd -m appuser && mkdir -p /app/data /data && touch /app/data/.keep /data/.keep \
    && chown -R appuser:appuser /app /data
USER appuser

ENV PATH="/app/.venv/bin:$PATH" \
    NEXT_TELEMETRY_DISABLED=1 \
    COPILOTKIT_TELEMETRY_DISABLED=true \
    DATABASE_PATH=/app/data/reviewer.db \
    LLM_BASE_URL=http://spark.chat:8000/v1 \
    LLM_MODEL=nvidia/Qwen3.8-Flash-Next-FP4-Local \
    OPENAI_API_KEY=local-vllm

EXPOSE 8100

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8100/healthz', timeout=2).status==200 else 1)"

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8100"]
