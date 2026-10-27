# Coverage Decision Reviewer

A clinician submits a prior-authorization request; a Pydantic AI agent reviews it over the
AG-UI protocol — streaming a cited narrative, calling coverage-rule lookup, long-running
claim checks (live progress via `CUSTOM` events), a flaky risk-scoring tool, and pausing on
a real interrupt for human approval of the final decision tool (`RUN_FINISHED` with
`outcome.type == "interrupt"`, resumed via `resume[]` against the original `tool_call_id`).

**M1 (current):** + Next.js 15 reviewer UI behind a BFF — streams narrative, tool calls,
live state panel and progress in the browser; dev-mode HMAC session cookie attaches the
reviewer identity server-side into the audit trail. M2 adds the approval round-trip UX
polish, M3 resilience + E2E.

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

## Run M1 (reviewer UI + BFF)

```bash
bash scripts/run_server.sh                          # backend on :8100 (as above)
cd web && npm install                               # no install-scripts approved; deps vendored
# web/.env.local: AGENT_URL, SESSION_SECRET, AUDIT_DB_PATH (see out/M1_STATUS.md)
npm run build && npm run start                      # BFF + reviewer UI on :3000
# open http://localhost:3000/login, sign in, submit a request
```

### Why CopilotKit (trade-off vs assistant-ui)

CopilotKit 1.80 was chosen deliberately: `useCoAgent`-style state sync comes free over
STATE_SNAPSHOT/STATE_DELTA, and the AG-UI remote agent is first-class via the runtime's
`HttpAgent` (`@copilotkit/runtime/v2` `CopilotRuntime` + `createCopilotRuntimeHandler`).
assistant-ui would need a custom runtime adapter for the same Pydantic-AI-over-AG-UI
backend, so CopilotKit removes the adapter we would otherwise own.

### BFF pattern (browser never talks to FastAPI)

`Reviewer (browser) → POST /api/copilotkit/agent/reviewer/run` (Next route handler: verifies
the HMAC session cookie, attaches `X-Reviewer-Id` server-side, pipes SSE unbuffered with
`X-Accel-Buffering: no`) `→ HttpAgent → FastAPI :8100/agent`. `AGENT_URL`/`SESSION_SECRET`
exist only in server env; unauthenticated `/api/copilotkit` → 401 (proven in
`out/sse_bff_capture.txt` / `out/M1_STATUS.md`). Route handlers use the **nodejs** runtime —
`@copilotkit/runtime` and `node:sqlite` are Node libraries and the deployment target is
portable containers on AKS, so no edge runtime and no Vercel-specific features anywhere.

### Server/Client boundary + accessibility

`app/page.tsx` is a Server Component shell (cookie-gated); every interactive piece is its own
`"use client"` island in `web/components/`, each opening with a comment on WHY it must be a
client component and why the boundary sits there. `/audit` renders on the server from the
append-only SQLite table via `node:sqlite` (read-only — zero client JS). The approval flow is
keyboard-operable (native buttons, visible focus rings, `aria-live` announcements), the
rationale is required before Deny enables, edit-args JSON is validated before save, and the
WCAG AA palette is Tailwind slate-based with high-contrast text pairs.

Or with containers: `docker compose up --build` (api on :8100, web placeholder on :8080,
SQLite on the `db` volume).

The full README (architecture diagram, AG-UI event contract table, interrupt mapping,
interview talking points) arrives at M3.
