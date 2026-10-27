# M1 Status — Reviewer UI + BFF (Next.js 15 + CopilotKit 1.80 + @ag-ui/client 1.0.3)

Date: 2026-10-27. Verified by the implementing agent per SPEC-M1 Acceptance; servers left
running for live browser re-verification.

## Live services (left running)

| Service | URL | Logs | PID file |
|---|---|---|---|
| FastAPI + Pydantic AI agent (AG-UI SSE) | http://localhost:8100 (`/agent`, `/healthz`, `/cancel/{thread}`) | `out/server.log` | `out/backend.pid` |
| Next.js 15 production server (`next start`) | http://localhost:3000 | `out/web.log` | `out/web.pid` |

How to (re)start everything from the repo root:

```bash
setsid nohup bash scripts/run_server.sh > out/server.log 2>&1 < /dev/null &
(cd web && setsid nohup npm run start > ../out/web.log 2>&1 < /dev/null &)
# sign in at http://localhost:3000/login (any name), then http://localhost:3000/
```

`web/.env.local` (gitignored) holds the server-side-only env: `AGENT_URL=http://localhost:8100/agent`,
`SESSION_SECRET=…`, `AUDIT_DB_PATH=../data/reviewer.db`. The browser never references the
FastAPI URL — all traffic goes through the BFF route handler.

## Routes implemented (web/)

- `app/api/copilotkit/[...path]/route.ts` — **the BFF**. Verifies the HMAC session cookie
  (401 JSON without it), resolves the reviewer identity server-side per request and attaches
  it to the runtime's `HttpAgent` as `X-Reviewer-Id`, rewrites run bodies to the
  server-owns-history contract (`resume` → `messages: []`, initial → last user turn), pipes
  SSE unbuffered (`X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`). Node
  runtime (documented: Node libs + portable containers on AKS, no Vercel features).
  Client-facing paths: `POST /api/copilotkit/agent/reviewer/run`, `GET /api/copilotkit/info`.
- `app/api/login/route.ts` — dev fake login: `POST {name}` sets `reviewer=<name>.<hmac-sig>`
  (HMAC-SHA256/SESSION_SECRET, httpOnly, sameSite=lax).
- `app/api/policies/[id]/route.ts` — policy text for citation-chip popovers, served by the
  BFF from repo fixtures (browser never touches FastAPI).
- `app/page.tsx` — Server Component shell (cookie-gated) hosting the client islands.
- `app/login/page.tsx` — server component + tiny `LoginForm` island (`/login?switch=1`
  skips the already-signed-in redirect).
- `app/audit/page.tsx` — server-rendered audit table, zero client JS.

## Files created

Backend (only the sanctioned audit-actor change): `backend/app/main.py` reads
`X-Reviewer-Id` → audit `actor` (fallback `reviewer`).

Web: `lib/auth.ts`, `lib/audit.ts`, `types/node-sqlite.d.ts`,
`components/ReviewerProvider.tsx`, `components/RequestForm.tsx`, `components/ReviewStream.tsx`,
`components/StatePanel.tsx`, `components/ProgressBar.tsx`, `components/ApprovalCard.tsx`,
`components/LoginForm.tsx`, `app/api/copilotkit/[...path]/route.ts`, `app/api/login/route.ts`,
`app/api/policies/[id]/route.ts`, `app/login/page.tsx`, `app/audit/page.tsx`, `app/page.tsx`.
Every `"use client"` file starts with a WHY-boundary comment (why it must be client + why
the boundary sits exactly there).

## Event mechanisms (installed-API verified, with node_modules citations)

- **Runtime/BFF**: `@copilotkit/runtime/v2` `CopilotRuntime({agents})` +
  `createCopilotRuntimeHandler({runtime, basePath, mode:"multi-route"})` —
  `web/node_modules/@copilotkit/runtime/dist/v2/index.d.mts` (exports) and
  `.../v2/runtime/core/fetch-handler.d.mts` (options), route table in
  `.../v2/runtime/core/fetch-router.mjs` (`agent/:agentId/run`, `info`); per-request agent
  factory context in `.../v2/runtime/core/runtime.d.mts:58-73`. `HttpAgent` (with
  `headers` option) imported from `@ag-ui/client` —
  `web/node_modules/@ag-ui/client/dist/index.d.ts:30-33,303-317`.
- **CUSTOM events (progress)**: CopilotKit 1.80's public `CopilotKitCoreSubscriber` has no
  custom-event hook (`web/node_modules/@copilotkit/core/dist/index.d.mts:2189-2260`), so the
  mechanism is the AG-UI `AgentSubscriber.onCustomEvent`
  (`web/node_modules/@ag-ui/client/dist/index.d.ts:258-260`) registered on the agent returned
  by the public headless `useAgent` hook
  (`web/node_modules/@copilotkit/react-core/dist/v2/headless.d.mts:250-257`;
  `AbstractAgent.subscribe` at `@ag-ui/client/dist/index.d.ts:580-582`).
  Filter `event.name === "review_progress"`.
- **Live state (StatePanel)**: `useAgent({updates:[UseAgentUpdate.OnStateChanged]})`;
  STATE_SNAPSHOT/STATE_DELTA applied to `AbstractAgent.state`
  (`@ag-ui/client/dist/index.d.ts:537`).
- **Narrative**: assistant `Message.content` from `agent.messages` (TEXT_MESSAGE_* applied by
  @ag-ui/client), re-render via `UseAgentUpdate.OnMessagesChanged`.
- **Tool activity**: `onToolCallStartEvent/onToolCallArgsEvent/onToolCallResultEvent`
  (`@ag-ui/client/dist/index.d.ts:220-233`) → name + running/ok/failed chips.
- **Interrupt/approval**: `useInterrupt({renderInChat:false})` from
  `@copilotkit/react-core/v2` (`.../react-core/dist/v2/headless.d.mts:543-589`) handles the
  standard `RUN_FINISHED outcome.type==="interrupt"` flow and resumes with a spec
  `ResumeEntry {interruptId, status:"resolved", payload}` — interruptId preserved. Payload
  matches pydantic-ai's `_ResumePayload`
  (`.venv/lib/python3.12/site-packages/pydantic_ai/ui/ag_ui/_interrupt.py:110-112`):
  `{approved, reason?, editedArgs?}` → `ToolApproved(override_args)` / `ToolDenied(message)`.
- **Run start**: `useCopilotKit().copilotkit.runAgent({agent})`
  (`web/node_modules/@copilotkit/core/dist/index.d.mts:2811`, params at `:876-889`).
- **Audit DB driver**: `node:sqlite` (built into the Node 26 runtime) — zero new npm deps,
  `readOnly:true`; local ambient types in `web/types/node-sqlite.d.ts` because the pinned
  `@types/node@20` predates node:sqlite typings.

## Acceptance evidence

1. `npm run build` — clean (types + ESLint). Output captured during this session; `npm run
   lint` also clean.
2. Backend on :8100 + `npm run start` on :3000, both detached, logs in `out/`.
3. BFF passthrough: `POST /api/copilotkit/agent/reviewer/run` **without** cookie → `401`
   JSON; **with** cookie → full SSE stream saved to `out/sse_bff_capture.txt` (RUN_STARTED,
   TEXT_MESSAGE_*, TOOL_CALL_*, STATE_SNAPSHOT/STATE_DELTA, CUSTOM×4 review_progress,
   RUN_FINISHED `outcome.type:"interrupt"` with `interrupts[].id = int-<propose_decision
   toolCallId>`). Resume stream in `out/sse_bff_resume.txt` (RUN_FINISHED success,
   TOOL_CALL_RESULT against the original tool_call_id). `GET /api/copilotkit/info` → 200 with
   cookie / 401 without.
4. Identity proof: audit row for thread `m1-1793085549` has
   `actor='Dr. Dana Reviewer'` (asserted in-session), `action='decision_resolved'`,
   `decision='approve'`, `rationale='clinically appropriate; M1 BFF identity proof'`,
   `tool_call_id='chatcmpl-tool-91cd7d6f6a2f80d3'` — identity came from the verified cookie
   attached server-side, not from the client.
5. Both servers left running (this file written last).

## Deviations / notes

- **Spec snippet corrected by node_modules reality**: `HttpAgent` is imported from
  `@ag-ui/client` (the runtime v2 surface does not export it); the route is a catch-all at
  `/api/copilotkit/[...path]` because multi-route mode serves `/agent/:id/run` and `/info`
  under the basePath.
- **Agents-factory cast**: `@ag-ui/client` ships both `index.d.ts` and `index.d.mts`, and TS
  treats the duplicated nominal class declarations (private `_debug`) as distinct across the
  `@copilotkit/runtime` dts boundary; one documented `as unknown as AgentsConfig` cast in the
  route file. Runtime behavior is exactly the documented factory contract.
- **BFF message rewrite**: to keep the M0 "server owns history" contract intact against
  CopilotKit's whole-thread POSTs, the BFF strips run bodies (`resume` → `[]`, else last
  user message) — mirrors `scripts/scripted_run.py`, which the curl proof used.
- **Audit-page recommendation**: `decision_resolved` rows carry who/when/decision/rationale/
  tool_call_id; the agent recommendation is derived read-only from persisted history
  (`propose_decision` tool args) rather than touching the M0 audit schema.
- **node:sqlite ambient types** instead of a `@types/node` bump (no new/app-upgraded deps).
- **Not browser-tested here** (no browser in this environment): the interrupt-approve UI path
  uses the same `useInterrupt`→`resume[]` protocol proven by the curl captures; expect live
  confirmation in the manual pass. `web/.env.local` is gitignored by the scaffold — recreate
  from the values above when deploying.
