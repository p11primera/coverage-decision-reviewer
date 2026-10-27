# Coverage Decision Reviewer

A clinician submits a prior-authorization request; a Pydantic AI agent reviews it over the
AG-UI protocol — streaming a cited narrative, calling coverage-rule lookup, long-running
claim checks (live progress via `CUSTOM` events), a flaky risk-scoring tool, and pausing on
a real interrupt for human approval of the final decision tool (`RUN_FINISHED` with
`outcome.type == "interrupt"`, resumed via `resume[]` against the original `tool_call_id`).

**M0 (current):** FastAPI backend + Pydantic AI agent served over AG-UI SSE, with
server-owned SQLite message history, cancellation, and an append-only audit table.
M1 adds the Next.js reviewer UI, M2 the approval round-trip UX, M3 resilience + E2E.

## Run M0

```bash
# deps are uv-managed (.venv); LLM is an OpenAI-compatible vLLM endpoint
export LLM_BASE_URL=http://spark.chat:8000/v1
export LLM_MODEL=nvidia/Qwen3.8-Flash-Next-FP4-Local

bash scripts/run_server.sh              # serves on :8100
curl localhost:8100/healthz

uv run python scripts/scripted_run.py                                  # raw SSE -> out/sse_capture.txt
uv run python scripts/scripted_run.py --resume approve "clinically appropriate"  # -> out/sse_resume.txt
```

Or with containers: `docker compose up --build` (api on :8100, web placeholder on :8080,
SQLite on the `db` volume).

The full README (architecture diagram, AG-UI event contract table, interrupt mapping,
interview talking points) arrives at M3.
