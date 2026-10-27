# M1 Spec — Next.js 15 reviewer UI + BFF (streams narrative, tool calls, state panel live)

Read POC_PROMPT.md (repo root) for product intent and SPEC-M0.md for the backend that
already exists and is VERIFIED (do not regress it). M1 = the reviewer browser experience
end-to-end through the BFF. No stubs, no mocked streams; all rendering must come from the
real SSE from the FastAPI backend on :8100.

## Stack (already scaffolded — verify, don't recreate)
- `web/` = create-next-app@15, App Router, TypeScript, Tailwind, turbopack. Installed:
  `@copilotkit/react-core@1.80.0 @copilotkit/react-ui@1.80.0 @copilotkit/runtime@1.80.0 @ag-ui/client@1.0.3`.
- CopilotKit is the DELIBERATE choice (documented trade-off vs assistant-ui: CopilotKit gives
  `useCoAgent` state sync over STATE_SNAPSHOT/STATE_DELTA + first-class AG-UI remote agent via
  runtime HttpAgent; assistant-ui would need a custom runtime adapter). README section for this.
- AUTHORITATIVE API = what's actually installed. Before writing any CopilotKit/AG-UI code,
  read `web/node_modules/@copilotkit/runtime/dist/**` and `@copilotkit/react-core` and
  `@ag-ui/client` type defs. Official pattern (from CopilotKit's Pydantic-AI docs) is:
  `@copilotkit/runtime/v2` `CopilotRuntime({agents:{name: new HttpAgent({url})}})` +
  `createCopilotRuntimeHandler({runtime, basePath})` exported as GET/POST from a route handler.
  CONFIRM the real export paths/shapes in node_modules — do not trust this snippet blindly.

## Architecture (the BFF pattern — the interview talking point)
Browser NEVER talks to FastAPI. Flow:
`Reviewer (browser) → POST /api/copilotkit (Next route handler = BFF; verifies HMAC session
cookie, attaches reviewer identity server-side; HttpAgent forwards to AGENT_URL server-side;
SSE piped through unbuffered — set X-Accel-Buffering: no and flush properly) → FastAPI :8100/agent`.
- `AGENT_URL` and any secret only ever exist server-side (`.env.local` + runtime env).
- Dev-mode fake login: `POST /api/login {name}` sets `reviewer=<name>.<hmac-sig>` cookie
  (HMAC-SHA256 with `SESSION_SECRET` env, `httpOnly`, `sameSite=lax`). Unauthenticated
  /api/copilotkit → 401 JSON. Minimal login form page at `/login` (server component + tiny client island).
- Backend change (small, separate commit): FastAPI `main.py` accepts reviewer identity from
  header `X-Reviewer-Id` and uses it as the audit `actor` (fallback 'anonymous'). The Next
  runtime route forwards the verified cookie identity in that header (via HttpAgent
  headers option or fetch headers on the runtime agent). Verify the audit row's actor changes
  to the logged-in name — proof the identity is server-attached, not client-supplied.

## Reviewer UI (app/page.tsx = SERVER component shell; every interactive piece its own
## "use client" island file, each starting with a one-paragraph comment: WHY it must be a
## client component, and WHY the boundary sits exactly there)
Components (files in web/components/):
1. `RequestForm` — clinician submits patient_summary, cpt, notes → starts the agent run
   (CopilotKit chat/run API). CPT default 72148 (fixtures have rules for it).
2. `ReviewStream` — streaming narrative; render inline citations `[POL-###]` as styled
   citation chips (regex on streamed text; chip click opens a details popover — keyboard
   operable: button element, focus ring, Enter/Space).
3. `StatePanel` — live reviewer panel via shared state (STATE_SNAPSHOT/STATE_DELTA):
   request echo, checked_count/total, findings list, recommendation. Must visibly update
   DURING the run (this is an M1 acceptance point).
4. `ProgressBar` — renders CUSTOM events (name `review_progress`, value {checked,total,check}).
   Investigate how CopilotKit 1.80 surfaces CUSTOM events to React (public hook/prop first;
   if none, subscribe on the agent instance obtained from react-core hooks, or runtime event
   middleware — read node_modules to find the real mechanism). Document the chosen mechanism
   with a file:line citation from node_modules in a code comment.
5. `ApprovalCard` — on run finish with interrupt outcome: card showing proposed args
   (decision, rationale, cited_policy_ids), buttons [Approve] [Deny] [Edit args], textarea
   for rationale (REQUIRED before Deny enabled — disabled state until non-empty), edit-args
   JSON textarea (validate JSON before enabling save; sends payload.editedArgs). Full
   keyboard operability + aria-live announcements. Resume posts with interruptId preserved.
   Tool-call activity: show each tool name + status chip (running/ok/failed) from TOOL_CALL_* events.
6. `/audit` page — SERVER-rendered table reading the same SQLite file (data/reviewer.db,
   read-only, aiosqlite/better-sqlite3 or node:sqlite — pick, justify) showing who/when/
   decision/rationale/tool_call_id/agent recommendation. No client JS needed → good Server
   Component showcase.

## Accessibility + polish bar
- Keyboard-only usable approval flow; visible focus; WCAG AA contrast (Tailwind slate-based
  palette, check text/bg pairs). Note it in README.
- Loading/error states: connection refused → clear error card with Retry; no silent hangs.

## Hard constraints
- No Vercel-specific features (no Vercel URL conventions, no next/auth-v5-vercel glue, edge
  runtime NOT required — use nodejs runtime for route handlers; document why: portable containers on AKS).
- Do not touch M0 backend behavior beyond the X-Reviewer-Id audit actor change.
- All temp/log files live in `out/` inside the repo. Never reference paths outside the repo root.
- Keep `next build` (webpack or turbopack) passing with zero errors; ESLint clean.

## Acceptance (verify yourself; I will re-verify in a real browser afterward)
1. `npm run build` clean in web/.
2. Start backend (scripts/run_server.sh) + `npm run start` (or dev) on :3000 (both backgrounded,
   logs under out/).
3. BFF passthrough proof: `curl -X POST localhost:3000/api/copilotkit` (or the actual runtime
   route path you implement) with a valid cookie and CopilotKit-shaped body streams SSE; without
   cookie → 401. Save raw output to out/sse_bff_capture.txt.
4. Identity proof: complete one run via curl/BFF then query the audit table — actor == logged-in
   reviewer name, not 'reviewer'/'anonymous'.
5. Leave server + web running when done (I verify the live UI in a browser), and write
   out/M1_STATUS.md with: routes implemented, files created, event mechanisms chosen (with
   node_modules citations), any deviations, and how to start everything.
6. Commit everything (git -c user.email=dustin@bone.dev -c user.name="Dustin Bone").
