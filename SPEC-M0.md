# M0 Spec — Coverage Decision Reviewer backend (FastAPI + Pydantic AI over AG-UI)

Read the parent `../poc_prompt.md` for full product intent. THIS file scopes **M0 only**:
a real, non-stubbed FastAPI backend serving the Pydantic AI agent over the AG-UI protocol,
plus a scripted curl'd run whose raw SSE stream is the acceptance artifact.

## Ground rules
- Python 3.12 (uv-managed, `.venv` exists, deps already installed: `pydantic-ai-slim[ag-ui,openai]==2.61.0`,
  `ag-ui-protocol==0.1.22`, `fastapi`, `uvicorn`, `aiosqlite`). Do NOT add deps without need.
- LLM: OpenAI-compatible vLLM at `http://spark.chat:8000/v1`, model id
  `nvidia/Qwen3.8-Flash-Next-FP4-Local`, no real API key (set `OPENAI_API_KEY=local-vllm` fallback in code).
  Wire it via:
  `from pydantic_ai.models.openai import OpenAIChatModel` +
  `from pydantic_ai.providers.openai import OpenAIProvider` →
  `OpenAIChatModel('nvidia/Qwen3.8-Flash-Next-FP4-Local', provider=OpenAIProvider(base_url=..., api_key=...))`.
  Make base_url + model id configurable via env (`LLM_BASE_URL`, `LLM_MODEL`).
- NO stubs, NO mocked agent, NO fake streams. The SSE must come from a real model run.
- Authoritative API reference = the installed source, read it when unsure:
  `.venv/lib/python3.12/site-packages/pydantic_ai/ui/ag_ui/` (`_adapter.py`, `_interrupt.py`, `_event_stream.py`)
  and bundled docs `.venv/lib/python3.12/site-packages/pydantic_ai/.agents/skills/building-pydantic-ai-agents/references/`
  (TOOLS-CORE.md, TOOLS-ADVANCED.md, INPUT-AND-HISTORY.md).

## Verified API facts (do not re-invent; these were confirmed in installed 2.61.0)
- `AGUIAdapter.dispatch_request(request, agent=..., deps=..., message_history=...,
  deferred_tool_results=..., cancellation_token=..., on_complete=..., manage_system_prompt=...)`
  is a classmethod → returns a streaming Response. Route: single POST `/agent` (also mount `/` same handler).
- Agent must use `output_type=[str, DeferredToolRequests]` (from `pydantic_ai.tools`) so a
  `requires_approval=True` tool pauses the run → `RUN_FINISHED` with `outcome.type == "interrupt"`,
  `Interrupt.id == f"int-{tool_call_id}"`, `Interrupt.reason == "tool_call"`.
- Tools returning `ag_ui.core.StateSnapshotEvent` / `StateDeltaEvent` push live state
  (`STATE_SNAPSHOT` / `STATE_DELTA` SSE events). Model run state as a Pydantic `BaseModel`
  wired through `pydantic_ai.ui._adapter.StateDeps[ReviewState]` (deps type).
- Custom progress events: `await ctx.emit(CustomEvent(name=..., value=...))` inside a tool, where
  `ctx: RunContext[ReviewState]` and `CustomEvent` is from `pydantic_ai.messages` → adapter yields
  `ag_ui.core.CustomEvent` SSE (`handle_custom_event` in `ui/ag_ui/_event_stream.py`).
- Server owns history: persist agent `ModelMessage`s keyed by AG-UI `threadId` in SQLite
  (aiosqlite, single `history` table: thread_id, seq, message_json using
  `pydantic_ai.messages.ModelMessage` `model_dump_json()`/validation). Load history before dispatch,
  pass `message_history=...`; persist new messages in `on_complete`.
- Cancellation: keep a `threadId → CancellationToken` registry; POST `/cancel/{thread_id}` triggers it;
  `on_cancel` persists `RunCancelled`-style resumable history (inspect `ui/_adapter.py` `on_cancel`
  signature; persist whatever messages the run produced so far).

## Deliverables (repo layout)
```
backend/
  app/
    __init__.py
    main.py          # FastAPI app, POST /agent + / , POST /cancel/{thread_id}, GET /healthz
    agent.py         # the Agent + all tools + instructions (instructions must make the model
                     # call tools in order and end with propose_decision)
    state.py         # ReviewState BaseModel (request, checked_count, total_checks,
                     # recommendation, citations, audit-able fields)
    history.py       # SQLite message-history store (async, aiosqlite) + audit table
    fixtures/
      policies.json       # >=4 seeded coverage policy docs {id,title,body,applies_to:[cpt...]}
      coverage_rules.json # >=6 rules {cpt, rule_id, criteria, outcome_guidance}
data/               # sqlite db lives here at runtime (gitignored)
scripts/
  run_server.sh     # uvicorn backend.app.main:app --host 0.0.0.0 --port 8100
  scripted_run.py   # builds RunAgentInput JSON for a sample prior-auth request, POSTs to
                    # /agent with Accept: text/event-stream, prints RAW SSE lines to stdout
                    # (and tees to out/sse_capture.txt). Supports --resume <decision> <rationale>
                    # to send resume[] against the interrupted tool_call_id.
Dockerfile          # api service: python:3.12-slim, uv-based install, non-root, HEALTHCHECK
docker-compose.yml  # services: api (build .), web (placeholder nginx or node stub, M1 fills in),
                    # db not needed separately (sqlite volume) — but keep 'db' volume mount
README.md           # stub now: what it is + how to run M0 (full README comes at M3)
```

## Agent behavior (prior-authorization review)
System prompt role: clinical coverage reviewer. Given a request payload in the user message
(patient summary, CPT/HCPCS code, notes), it must:
1. Call `lookup_coverage_rule(cpt)` — reads `fixtures/coverage_rules.json`, returns matching rules.
   Tool must also return a `StateDeltaEvent` updating `checked_count`/`rule findings` in `ReviewState`.
2. Call `run_claim_checks(...)` — the "long" tool: loops N steps, `await ctx.emit(CustomEvent(
   name='review_progress', value={'checked': i, 'total': N}))` per step with small sleeps, then
   returns a `StateSnapshotEvent` with findings.
3. Call `score_claim_risk(...)` — the deliberately FLAKY tool: `random.random()` < 0.5 raises
   `ModelRetry`-free hard exception (simulate timeout with `asyncio.TimeoutError` path);
   env `FLAKY_ALWAYS_FAIL=1` forces failure for deterministic tests. Show the agent gracefully
   retrying/reporting.
4. Call `propose_decision(decision, rationale, cited_policy_ids)` — `@agent.tool_plain(
   requires_approval=True)`; returns text result. This is what triggers the interrupt.
Inline citations like `[POL-102]` required in narrative.

## Acceptance (must verify yourself before declaring done)
1. `bash scripts/run_server.sh` serves; `curl localhost:8100/healthz` → ok.
2. `uv run python scripts/scripted_run.py` prints a raw SSE stream containing at least:
   `RUN_STARTED` → `TEXT_MESSAGE_START/CONTENT/END` → `TOOL_CALL_START/ARGS/END` (lookup tool) →
   `STATE_SNAPSHOT` or `STATE_DELTA` → `CUSTOM` (review_progress) → … → `RUN_FINISHED` whose
   JSON contains `"outcome"` with `"type": "interrupt"` and an `interrupts` array whose
   `toolCallId` matches the `propose_decision` TOOL_CALL_START id.
3. `uv run python scripts/scripted_run.py --resume approve "clinically appropriate"` (second POST
   with same threadId + `resume[]`) completes the run: `RUN_FINISHED` success outcome.
4. Save the full raw SSE to `out/sse_capture.txt` and `out/sse_resume.txt`. Commit everything.
If the vLLM model misbehaves (no tool calls, malformed args), tune the system prompt /
`model_settings` (temperature 0) until stable for 2 consecutive runs — that tuning is part of the task.
