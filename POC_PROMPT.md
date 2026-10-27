# New-session prompt: AG-UI portfolio PoC (closes Next.js / agent-UI / BFF gaps)

Build a small, production-quality proof-of-concept I will use as my flagship portfolio
project when interviewing for a Sr/Lead Software Engineer role at a health-plan tech
company (Evolent Health) whose stack is: Pydantic AI agents exposed over the AG-UI
protocol, consumed by a Next.js (App Router, TypeScript) frontend with CopilotKit or
assistant-ui, behind a backend-for-frontend, self-hosted in containers (their prod is
AKS), with human-in-the-loop approval of agent tool calls and a full audit trail.
Treat this as a real artifact I will defend line-by-line in interviews — no stubs, no
mocked agent, no fake streams.

## Product concept: "Coverage Decision Reviewer"
A clinician submits a prior-authorization-style coverage request (patient summary,
CPT/HCPCS code, notes). A Pydantic AI agent:
1. Streams a review narrative with citations to a seeded policy corpus (JSON fixture
   policies are fine; cite policy IDs inline).
2. Calls a backend lookup tool (coverage rules from a fixture SQLite/JSON dataset).
3. Calls one deliberately flaky tool (random timeout/exception) to exercise
   failure/resilience handling.
4. Proposes approve/deny via a tool declared `requires_approval=True` — the run must
   pause on a real AG-UI interrupt, the reviewer approves/denies/edits args in the UI,
   and the run resumes against the ORIGINAL tool_call_id.
5. Every reviewer action writes an append-only audit record: who, when, decision,
   structured rationale (required free-text on deny), agent recommendation, and the
   tool_call_id chain.

## Backend (FastAPI + Pydantic AI)
- `pydantic-ai-slim[ag-ui]` + uvicorn; serve the agent via `AGUIAdapter.dispatch_request`
  on a single POST `/` (or `/agent`) route. Starlette/FastAPI, Python 3.12, uv.
- `output_type=[str, DeferredToolRequests]` so approval pauses cleanly.
- Shared state: model the request + review as a Pydantic `BaseModel`, wired through
  `StateDeps[ReviewState]`, and push `StateSnapshotEvent`s from tools so the reviewer
  panel updates live.
- Emit a `CustomEvent` via `ctx.emit()` for streaming progress from inside the long
  review tool (e.g. `{"checked": n, "total": N}`) rendered as a live progress bar.
- Server owns message history: persist agent `ModelMessage`s keyed by AG-UI thread ID
  (SQLite is fine) and pass them as `message_history` — do NOT rely on client-held
  history (I know @ag-ui/client drops ACTIVITY_SNAPSHOT records; document this in the
  README as a deliberate design decision).
- Cancellation: wire a cancel endpoint to a CancellationToken; on cancel, persist
  resumable history from `RunCancelled.all_messages()`.

## Frontend (Next.js 15, App Router, TypeScript)
- Server Components by default; mark only the streaming/chat/state islands `"use client"`
  and write a short comment at each boundary explaining WHY the split is where it is.
- CopilotKit (preferred) or assistant-ui + `@ag-ui/client` — your choice, but document
  the trade-off you weighed in the README.
- Reviewer UI: request form, streaming narrative with citation chips, live state panel,
  inline approve/deny/edit-args card on the interrupt, progress bar from custom events,
  and an audit-trail view (server-rendered from the audit table).
- Resilience UX: when the flaky tool fails or the stream dies, show clear status, offer
  retry, and make the run resumable — this exact bullet ("slow, interrupted, or failed
  agent calls: resumable streams, retries, timeouts, clear status") is on the JD.
- Accessibility: keyboard-operable approval flow, WCAG AA contrast — mention in README.

## BFF layer
- No direct browser→FastAPI calls. Next.js route handlers (`app/api/agent/route.ts`)
  proxy/stream to FastAPI, attach a server-side-authenticated user identity (a simple
  dev-mode session cookie or JWT with a fake login is fine), and forward SSE unbuffered.
  Document this as the BFF pattern mirroring their .NET/FastAPI + BFF production shape.

## Ops & quality bar
- Dockerfile for each service + docker-compose (web, api, db); no Vercel-specific
  features anywhere (their standard is portable containers on AKS).
- Vitest + React Testing Library for the reviewer components; Playwright E2E for the
  golden path (submit → stream → interrupt → approve → audit row exists).
- README must contain: (1) architecture diagram (ASCII is fine), (2) the AG-UI event
  contract table — which Pydantic AI construct emits which AG-UI event in this app,
  (3) the interrupt mapping (requires_approval → RUN_FINISHED outcome.type="interrupt"
  → resume[] → ToolApproved/ToolDenied), (4) the four interview talking points I most
  want to be able to defend: Server/Client boundary rationale, BFF rationale,
  server-side history rationale, interrupt/resume semantics.

## Milestones (implement in this order, verify each before the next)
- M0: scaffold + docker-compose up; agent answers over AG-UI in curl'd SSE output.
- M1: reviewer UI streams narrative + tool calls + state panel live in the browser.
- M2: approval interrupt round-trip works end-to-end (deny requires rationale, audit
  row persisted, resumed tool replays against original tool_call_id).
- M3: flaky-tool failure path + cancel/resume + Playwright E2E green.

Start by scaffolding M0 and show me the raw SSE event stream from a scripted run so I
can see the AG-UI event sequence (RUN_STARTED → TEXT_MESSAGE_* → TOOL_CALL_* →
RUN_FINISHED with interrupt outcome) before we build the UI.
