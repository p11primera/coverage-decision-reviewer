# Coverage Decision Reviewer

> **Unofficial proof of concept.** Not affiliated with or endorsed by Evolent Health.
> All trademarks are the property of their respective owners. MIT licensed — see LICENSE.

A prior-authorization PoC for a health-plan stack: a clinician submits a coverage request;
a **Pydantic AI** agent streams a cited review narrative, calls coverage-rule + long
claim-check tools (live progress), survives a deliberately flaky risk tool, and **pauses on
a real AG-UI interrupt** for human approve/deny/edit-args — every reviewer action lands in
an append-only audit trail. No stubs, no mocked agent, no fake streams.

Stack: FastAPI + `pydantic-ai-slim[ag-ui]` (:8100) behind a **Next.js 15 App Router BFF**
(:3000) using CopilotKit v2 headless + `@ag-ui/client`, against an OpenAI-compatible vLLM
endpoint, SQLite for history/audit, portable containers only (AKS-shaped, zero
Vercel-specific features).

## Architecture

```
 Browser (React islands)
   │  SSE (unbuffered, X-Accel-Buffering: no) — never a direct browser→FastAPI call
   ▼
┌─────────────────────────────────────────────┐      server-side       ┌──────────────────────────────┐      ┌─────────┐
│ Next.js 15 App Router  :3000  =  THE BFF    │  HttpAgent (nodejs     │ FastAPI + Pydantic AI  :8100   │      │  vLLM   │
│  /login            dev-mode fake login      │   runtime, fetch)      │  POST /agent  AGUIAdapter      │─────►│ OpenAI- │
│  /api/login        HMAC-SHA256 cookie       │ ─────────────────────► │   .dispatch_request            │ SSE  │ compat  │
│  /api/copilotkit   cookie gate + attaches   │ ◄───────────────────── │   tools, StateDeps, resume[]   │◄─────│ /v1     │
│                    X-Reviewer-Id (server)   │      SSE piped raw     │  POST /cancel/{threadId}       │      └─────────┘
│  /api/audit        cookie gate + node:sqlite│                        │   CancellationToken registry   │
│  /api/policies     policy text for chips    │                        └───────────────┬────────────────┘
│  /       Server Component shell + islands   │                                        ▼
└─────────────────────────────────────────────┘                    data/reviewer.db (SQLite: ModelMessages
                                                                    history keyed by threadId + audit)
```

AKS mapping: `web` and `api` are Deployments behind the cluster ingress (TLS terminates
upstream — the app itself is http and tolerates non-secure contexts, see
`web/lib/id.ts`); SQLite sits on a PVC mounted into `api` (swap for managed Postgres by
replacing `backend/app/history.py` only — it is the single persistence seam). `docker-compose.yml`
runs web (:8080→3000), api (:8100) and the db volume.

## Run

```bash
export LLM_BASE_URL=http://spark.chat:8000/v1 LLM_MODEL=nvidia/Qwen3.8-Flash-Next-FP4-Local
bash scripts/run_server.sh                 # FastAPI :8100 (uv-managed .venv)
cd web && npm install && npm run build && npm run start   # BFF + UI :3000
npm run test                               # Vitest + RTL unit tests
npx playwright test                        # E2E (servers must already be running; single worker)
```

## AG-UI event contract (this app)

Which Pydantic AI construct emits which AG-UI event **here** — every row verified against
the raw captures (`out/sse_verify1.txt` = scripted run to interrupt,
`out/sse_verify1_resume.txt` = approve-resume continuation):

| Pydantic AI construct | AG-UI event(s) | Capture evidence |
|---|---|---|
| Model text output (`output_type=[str, …]`, `backend/app/agent.py:80-88`) | `TEXT_MESSAGE_START/CONTENT/END` | 4× START/END, 98× CONTENT in `sse_verify1.txt` |
| Model reasoning tokens | `REASONING_START/MESSAGE_*/END` | present in both captures; the UI deliberately ignores them (narrative is TEXT_MESSAGE only) |
| `@agent.tool` — `lookup_coverage_rule` (`agent.py:90`), `run_claim_checks` (`agent.py:110`), `score_claim_risk` (`agent.py:129`), `propose_decision` (`agent.py:147`) | `TOOL_CALL_START/ARGS/END` + `TOOL_CALL_RESULT` | 4 START / 51 ARGS / 4 END / 3 RESULT in `sse_verify1.txt` |
| `ctx.emit(ReviewProgressEvent(...))` inside `run_claim_checks` (`agent.py:118`) | `CUSTOM` `name="review_progress"`, `value={checked,total,check}` | 4× CUSTOM in `sse_verify1.txt`; rendered by `web/components/ProgressBar.tsx` via `AgentSubscriber.onCustomEvent` |
| `ToolReturn(metadata=StateSnapshotEvent(...))` (`agent.py:104-108,123-127,161`) | `STATE_SNAPSHOT` | `sse_verify1.txt`; client applies it in `@ag-ui/client` → `web/components/StatePanel.tsx` |
| `StateDeltaEvent` (imported `agent.py:20`; RFC-6902 deltas once the tree is initialized) | `STATE_DELTA` | 1× DELTA in `sse_verify1.txt` |
| `requires_approval=True` on `propose_decision` (`agent.py:147`) | `RUN_FINISHED` with `outcome.type="interrupt"`, interrupt `id="int-<tool_call_id>"`, `responseSchema {approved, reason?, editedArgs?}` | `sse_verify1.txt` line 677: id `int-chatcmpl-tool-a79248d7994235ff`, `toolCallId chatcmpl-tool-a79248d7994235ff` |
| reviewer `resume[]` → `ToolApproved`/`ToolDenied` | resumed run's `TOOL_CALL_RESULT` + final `TEXT_MESSAGE_*` | `sse_verify1_resume.txt`: RESULT replays the SAME `chatcmpl-tool-a79248d7994235ff` |
| `CancellationToken` + `on_cancel` (`backend/app/main.py:69-73`) | `RunCancelled.all_messages()` persisted to history + audit `run_cancelled` row; client sees bare `RUN_FINISHED` (no cancelled outcome on the wire — the UI learns "cancelled" from the BFF `/api/cancel` fetch, `web/lib/cancelBus.ts`) | verified in `out/M3A_STATUS.md` (live-browser pass) |

## Interrupt → resume mapping

`propose_decision` is declared `requires_approval=True` (`backend/app/agent.py:147`) and the
agent's `output_type=[str, DeferredToolRequests]` (`agent.py:80-88`). When the model calls
it, pydantic-ai defers execution: the run ends with `DeferredToolRequests` as output, which
`AGUIAdapter` serializes as `RUN_FINISHED outcome.type="interrupt"` carrying
`{id: "int-{tool_call_id}", toolCallId, responseSchema}` (capture assertion above). The
client (`web/components/ApprovalCard.tsx`) renders the proposed args; Approve/Deny/Edit-args
build a payload `{approved, reason?, editedArgs?}` — Deny is gated on a non-empty rationale,
edited JSON is validated before save (`ApprovalCard.tsx:73-95`) — and resolve it via
`useInterrupt` as a spec `ResumeEntry {interruptId, status:"resolved", payload}` with the
interrupt id preserved (`ApprovalCard.tsx:296-310`). On the server the resume entry becomes
`ToolApproved(override_args=…)` when `editedArgs` is present, else plain `ToolApproved`, or
`ToolDenied(message=reason)` — and pydantic-ai **replays the ORIGINAL `tool_call_id`**
(approved-run capture shows `TOOL_CALL_RESULT` for `chatcmpl-tool-a79248d7994235ff`, never a
new id). The BFF also appends the audit row (`who/when/decision/rationale/tool_call_id`)
from `run_input.resume` **before** dispatching (`main.py:76-87`), so the evidence is durable
even if the resumed run later dies.

## Interview talking points

**Server/Client boundary.** `web/app/page.tsx` is a Server Component shell that does the
auth check (`cookies()` + `lib/auth`) and renders only static layout; every interactive
piece is its own `"use client"` island file in `web/components/`, each opening with a
comment stating WHY it must be client-side and WHY the boundary sits exactly there (e.g.
`ReviewStream` renders token deltas that exist nowhere but the live browser connection;
`AuditDrawer` fetches over HTTP precisely because importing `lib/audit` would drag
`node:sqlite` into the client bundle — the fetch *is* the boundary). The split keeps the
initial paint server-rendered and confines hydration cost to the islands that mutate.

**BFF rationale.** The browser has no path to FastAPI: all traffic goes to Next route
handlers — `/api/copilotkit` (CopilotKit runtime → server-side `HttpAgent` → `:8100`),
`/api/audit`, `/api/cancel/[threadId]`, `/api/login`, `/api/policies`. Identity is
**never client-supplied**: `/api/login` mints an HMAC-SHA256 cookie
(`lib/auth.ts`, httpOnly, sameSite=lax) and each route verifies it server-side, forwarding
`X-Reviewer-Id` to the backend (`main.py:43-46` — the audit `actor` can only ever be the
verified name; proven in `out/M1_STATUS.md`/`out/audit_api_with_cookie.json`, where forged
and missing cookies get 401). SSE is piped unbuffered (`X-Accel-Buffering: no`) so token
streaming survives the extra hop. `AGENT_URL`/`SESSION_SECRET` exist only in server env.
This mirrors their production shape (.NET/FastAPI behind a BFF) — the route handlers are
the nodejs-runtime equivalent.

**Server-side history.** `@ag-ui/client` drops ACTIVITY_SNAPSHOT records, so client-held
history is provably lossy — the server owns it instead. `backend/app/history.py` persists
agent `ModelMessage`s in SQLite keyed by AG-UI `threadId` and every run replays them as
`message_history` (`main.py:48,93`). The BFF strips the client-sent run messages before
forwarding (the browser copy is for rendering only), and Retry/Resume semantics fall out of
this: after a stream death or cancel, re-running the same `threadId` continues from the
last **persisted** point (documented honestly in `ReviewStream.tsx:126-138` — there is no
mid-tool-call replay; a partially executed tool is re-run from scratch by the model).

**Interrupt/resume semantics (id-chain proof).** The chain
`TOOL_CALL_START(toolCallId)` → `RUN_FINISHED interrupt id = "int-"+toolCallId` →
`resume[].interruptId` → replayed `TOOL_CALL_RESULT(same toolCallId)` is asserted on the
raw wire in `out/sse_verify1.txt` (line 677: `id":"int-chatcmpl-tool-a79248d7994235ff"`,
`"toolCallId":"chatcmpl-tool-a79248d7994235ff"`) and `out/sse_verify1_resume.txt` (the
resumed run's single `TOOL_CALL_RESULT` carries exactly that id). Approval never invents a
second tool call, and the audit row stores `tool_call_id = interrupt_id.removeprefix("int-")`
(`main.py:85`) so the whole decision is traceable back to the model's original call.

## CopilotKit vs assistant-ui (documented decision)

CopilotKit 1.80 (v2 headless) was chosen over assistant-ui: `useAgent`/`useInterrupt` give
first-class AG-UI integration — STATE_SNAPSHOT/STATE_DELTA sync, the standard
`RUN_FINISHED outcome.type="interrupt"` → `ResumeEntry` flow, and the runtime's `HttpAgent`
(`@copilotkit/runtime/v2` `CopilotRuntime` + `createCopilotRuntimeHandler`) mean zero
adapter code between their Pydantic-AI AG-UI backend and React. assistant-ui would own the
chat primitives better but required writing and maintaining a custom runtime adapter for
AG-UI interrupts and shared state — code we'd defend in interviews but not ship value with.
Trade-off accepted: we pin to `@copilotkit/react-core@1.80` and documented the real APIs
from installed `node_modules` type defs (citations in component headers), not blog snippets.

## Accessibility

The approval flow is keyboard-operable end-to-end: native `<button>`s with visible
`:focus-visible` rings, textarea + Enter/Space paths, Deny enabling is announced through an
`aria-live="assertive"` region, the rationale textarea is `aria-required`, invalid edit-args
JSON surfaces `role="alert"` + `aria-invalid`. The audit drawer is a WAI-ARIA dialog
(`aria-modal`, focus moved in, focus restored to the trigger, Esc + focus trap). Live
regions: progress updates are `aria-live="polite"` (`ProgressBar`), the stream pane uses
`aria-busy`. Palette is Tailwind slate-based with WCAG AA text/background pairs (e.g.
`text-slate-700` on white, white on `bg-red-800`/`bg-green-800`). The submit guard uses
`aria-disabled` + `aria-describedby` instead of a dead native `disabled`, so screen readers
announce *why* submission is blocked.

## Known limitations (honest)

- **LAN-IP http is a non-secure context**: `crypto.randomUUID()` is undefined there (the
  original "button does nothing" bug). Handled by the `crypto.getRandomValues` fallback in
  `web/lib/id.ts` (unit-tested by deleting `randomUUID` — `web/tests/id.test.ts`).
- **`docker compose up` unverified on this host** (no Docker daemon in the dev container);
  the YAML parses and images lint-clean, but they must be booted once on the Pi host
  before claiming parity.
- **RISK SCORE "unavailable"**: when the flaky scorer fails the panel showed `—`, which
  reads like "no data yet". Fixed at M3B — `StatePanel.tsx` renders the sentinel
  `state.risk_score === "unavailable"` verbatim (unit-tested). Caveat kept honest: the
  failure path raises `ToolFailed` which carries no `StateSnapshotEvent`, so the sentinel
  only reaches the client if a later snapshot lands; before that the panel still shows `—`.
- Flaky tool is stochastic by default (50% fail); `FLAKY_ALWAYS_FAIL=1` exists for
  deterministic failure tests — E2E deliberately does not depend on either mode.
- Cancel registry is in-process and single-instance; a multi-replica `api` Deployment would
  need a shared registry (or sticky routing) — noted, not built.
