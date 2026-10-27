# M3 Pass B spec — Vitest+RTL unit tests, Playwright E2E, interview README

Read POC_PROMPT.md (Ops & quality bar + README requirements sections are YOUR acceptance
list), SPEC-M1.md, out/M1B_STATUS.md, out/M3A_STATUS.md first. Repo-only; temps in out/.
Chromium: /opt/hermes/tools/chromium-1208/chrome-linux/chrome (no sudo; if playwright's
own browser download fails use executablePath to this). Servers: backend :8100, web :3000
currently running detached — REUSE them; if you must restart web use setsid nohup
(... < /dev/null &); do NOT restart the backend unless a test needs FLAKY_ALWAYS_FAIL=1
(kill uvicorn backend[.]app first; ALWAYS restore normal mode after and leave it running).

## 1. Vitest + React Testing Library (in web/, dev deps allowed: vitest @testing-library/react
   @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react)
   - vitest.config.ts + test setup; add "test": "vitest run" script.
   - Unit: web/components/toolActivityGroups.ts — same-name consecutive grouping, non-adjacent
     same-name NOT grouped, single stays single, status propagation.
   - Components (jsdom): ApprovalCard — deny disabled until non-empty rationale; approve payload
     contains approved:true (+editedArgs when edited args valid JSON); deny payload carries reason;
     aria-labels present. ProgressBar — renders CUSTOM review_progress events (checked/total/check).
     lib/auth sign/verify roundtrip + tampered-sig rejected. lib/id newId() with and without
     crypto.randomUUID (delete the method in the test to force the fallback path; validate v4 shape).
   - Mock CopilotKit hooks where needed (vi.mock) — keep mocks thin, do not test the mocks.
   - `npm run test` must exit 0. Include the tests that WOULD have caught: the secure-context
     randomUUID bug (newId fallback), the delta-before-snapshot crash (assert ProgressBar/
     StatePanel handle missing initial state gracefully if testable cheaply).

## 2. Playwright E2E (web/e2e/, dev dep @playwright/test; config: webServer NONE — servers
   already run; baseURL http://localhost:3000; chromium executablePath as above; single worker
   on this Pi)
   - e2e/golden.spec.ts: login as "E2E Bot" -> submit prefilled 72148 request -> narrative
     non-empty appears (timeout 240s) -> tool chips reach ok -> interrupt card appears ->
     approve -> RECOMMENDATION 'approve' text -> drawer: audit row for E2E Bot exists (open
     drawer via header button, assert row text).
   - e2e/cancel.spec.ts: submit -> Cancel mid-run -> assert 'history saved' status + submit
     re-enabled (aria-disabled null/false).
   - e2e/deny.spec.ts: submit -> interrupt -> type rationale -> Deny enabled -> confirm audit
     row decision=deny with rationale text appears in drawer (or /audit). Use FLAKY_ALWAYS_FAIL=1
     for determinism ONLY if needed for speed; restore normal mode after (finally block).
   - `npx playwright test` green. Save the HTML/trace output paths into out/M3B_STATUS.md.

## 3. README.md (root) — REPLACE the stub. Required by the product prompt:
   (a) ASCII architecture diagram: browser -> Next.js BFF (:3000, HMAC cookie identity) ->
       FastAPI+Pydantic AI (:8100) -> vLLM; SQLite volumes; AKS mapping (Deployments+PVC).
   (b) AG-UI event contract table: which Pydantic AI construct emits which AG-UI event IN THIS
       APP (agent text -> TEXT_MESSAGE_*; @agent.tool -> TOOL_CALL_START/ARGS/END/RESULT;
       ToolReturn metadata StateSnapshotEvent/Delta -> STATE_SNAPSHOT/DELTA; ctx.emit
       ReviewProgressEvent -> CUSTOM; requires_approval -> RUN_FINISHED outcome.interrupt;
       on_cancel -> cancelled persist; verify against out/sse_verify1.txt captures, cite them).
   (c) Interrupt mapping paragraph: requires_approval=True -> DeferredToolRequests in output_type
       -> RUN_FINISHED outcome.type="interrupt" (interrupt id int-{tool_call_id}) -> client
       resume[] {interruptId,status:'resolved',payload:{approved,reason?,editedArgs?}} ->
       ToolApproved/ToolDenied(resume replays ORIGINAL tool_call_id; editedArgs ->
       override_args) — cite backend/app/agent.py + ApprovalCard.tsx.
   (d) Four interview talking points (write them as defense prose, 1 paragraph each): Server/Client
       boundary rationale (islands + WHY comments), BFF rationale (identity never client-supplied,
       unbuffered SSE, /api/copilotkit|audit|cancel), server-side history rationale (@ag-ui/client
       drops ACTIVITY_SNAPSHOT — server owns ModelMessages keyed by threadId, BFF strips client
       run messages), interrupt/resume semantics (id chain proof: out/sse_verify1.txt assertions).
   (e) CopilotKit vs assistant-ui trade-off (documented decision).
   (f) a11y notes (keyboard-operable approval flow, aria-live regions, AA contrast) + honest
       known-limitations list (LAN-IP requires the newId fallback — already handled; docker
       compose unverified until host run; RISK SCORE shows '—' when scorer unavailable —
       ALSO FIX THIS: display 'unavailable' when state.risk_score==='unavailable' in StatePanel).
   Keep it tight and factual — it's an engineering README, not marketing.

## Acceptance & finishing
- npm run test green; npx playwright test green (paste pass output into out/M3B_STATUS.md);
  npm run build + lint still clean; docker-compose.yml still parses.
- Backend restored to NORMAL mode and running; web running; out/M3B_STATUS.md written
  (test counts, durations, traces paths, anything skipped + why).
- Commit: git -c user.email=dustin@bone.dev -c user.name="Dustin Bone" commit -am "M3B: Vitest+RTL unit tests, Playwright E2E suite, interview README"
- Report: test counts, E2E pass list, README section list, deviations, unverified items.
