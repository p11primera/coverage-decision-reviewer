# M3B Status — Vitest+RTL unit tests, Playwright E2E suite, interview README

Date: 2026-10-27. Follows SPEC-M3B.md (acceptance list = POC_PROMPT "Ops & quality bar" +
README requirements; base context: SPEC-M1.md, out/M1B_STATUS.md, out/M3A_STATUS.md).

## 1. Unit tests — `npm run test` (Vitest 3 + RTL, jsdom) — exit 0

```
Test Files  6 passed (6)
     Tests  28 passed (28)
  Duration  14.53s
```

Files (web/tests/):
- `toolActivityGroups.test.ts` (5) — adjacent same-name grouping, **non-adjacent same-name
  NOT grouped** (separated by another tool), single stays single, empty, per-attempt status
  propagation.
- `ApprovalCard.test.tsx` (7) — card region + aria labels; **Deny disabled until non-empty
  rationale** (whitespace-only stays disabled, title explains why); approve payload
  `{approved:true}` + interrupt id preserved; **editedArgs in approve payload** after
  saving valid JSON; invalid JSON -> role=alert + save disabled + aria-invalid; deny
  payload `{approved:false, reason}`; aria-live announcement. CopilotKit hooks mocked thin
  (vi.mock of `@copilotkit/react-core/v2` + cancelBus; mocks only route the interrupt
  render-callback + resolve spy — the payload contract is the real component's code).
- `ProgressBar.test.tsx` (4) — missing-initial-state graceful (idle bar, no crash — the
  delta-before-snapshot class of bug), **CUSTOM `review_progress` rendering**
  (checked/total/check -> aria-valuenow/max/valuetext + text), other-name CUSTOM ignored,
  reset on next run start.
- `StatePanel.test.tsx` (3) — null state renders em-dashes (no crash), live snapshot
  values, **risk_score 'unavailable' renders literally** (covers the M3B fix).
- `auth.test.ts` (7) — sign/verify roundtrip (incl. dotted names), **tampered-sig
  rejected**, tampered-name rejected, malformed values, charset, Cookie-header extraction.
- `id.test.ts` (2) — randomUUID path used when present; **randomUUID deleted from the
  crypto object -> getRandomValues fallback produces valid RFC-4122 v4** (the LAN-IP
  non-secure-context regression). Full logs: out/m3b_vitest5.log (earlier iterations:
  m3b_vitest1..4.log).

## 2. Playwright E2E — `npx playwright test` — green

```
✓ e2e/cancel.spec.ts  cancel -> 'history saved' status + submit re-enabled (4.9s)
✓ e2e/deny.spec.ts    interrupt -> Deny gated on rationale -> audit row decision=deny with rationale (25.3s)
✓ e2e/golden.spec.ts  submit -> narrative -> chips ok -> interrupt -> approve -> RECOMMENDATION approve -> audit row (30.1s)
3 passed (1.1m)
```

- Config: `web/playwright.config.ts` — no webServer (reused live :8100/:3000), single
  worker, 240s test timeouts (240_000ms `LLM_TIMEOUT` for every model-crossing wait in
  `e2e/helpers.ts`; selector-only waits keep the 15s expect default so typos fail fast),
  chromium via `executablePath=/opt/hermes/tools/chromium-1208/chrome-linux/chrome`
  (this container cannot download playwright's own browser build).
- golden: prefilled 72148 request; narrative poll >40 chars; >=2 "ok" chips (flaky risk
  tool may end 'failed' — deliberately not asserted 'ok'); interrupt card; Approve;
  RECOMMENDATION 'approve' in the state panel; audit row (actor=E2E Bot,
  decision_resolved/approve, non-empty tool_call_id) via BFF `/api/audit` poll, then
  visible in the drawer.
- deny: unique per-run rationale; deny disabled -> enabled only after typing; audit row
  decision=deny with exact rationale (poll + drawer assertion).
- cancel: cancel mid-run -> 'history saved' status + submit aria-disabled cleared +
  button text back to "Submit for review".
- Artifacts: HTML report `out/playwright-report/index.html`; traces `trace.zip` in
  `out/playwright-results/<test>/` (3 dirs). Runs: out/m3b_playwright1.log (first full),
  m3b_playwright2.log (golden regression after web restart onto fresh build),
  m3b_playwright3.log (final full run — artifacts currently on disk are from this run;
  playwright clears output dirs per run).
- FLAKY_ALWAYS_FAIL was **never needed** (normal stochastic mode passed repeatedly: 3 full
  golden/deny runs) — backend env untouched; verified no FLAKY_* in the live uvicorn
  environ (normal mode, running, pid per `pgrep -f "uvicorn backend[.]app"`).

## 3. README.md (root) — stub replaced per SPEC-M3B §3

Sections: intro+stack; ASCII architecture (browser -> Next BFF :3000 HMAC identity ->
FastAPI+Pydantic AI :8100 -> vLLM; SQLite volume; AKS Deployments+PVC mapping); Run;
AG-UI event contract table (each row cites the emitting construct in
`backend/app/agent.py` with line numbers + counts/lines from `out/sse_verify1.txt` /
`out/sse_verify1_resume.txt`); interrupt->resume mapping paragraph (id chain
`int-chatcmpl-tool-a79248d7994235ff` <-> `chatcmpl-tool-a79248d7994235ff` cited verbatim,
`backend/app/agent.py` + `web/components/ApprovalCard.tsx`); four interview talking
points as defense prose (server/client boundary, BFF, server-side history, interrupt
semantics); CopilotKit vs assistant-ui decision; accessibility notes; honest
known-limitations (LAN-IP randomUUID fallback, docker compose unverified, risk-score
sentinel caveat + fix, flaky-mode toggle, in-process cancel registry).

### Small fix (spec 3f)
`web/components/StatePanel.tsx` — Risk score renders `unavailable` verbatim when
`state.risk_score === "unavailable"` (was falling into the em-dash sentinel expression);
covered by `tests/StatePanel.test.tsx`. Honest caveat kept in README: the failure path
raises `ToolFailed` with no StateSnapshotEvent, so the sentinel only reaches the client
if a later snapshot lands.

## 4. Build / lint / compose

- `npm run build` (turbopack): clean — route table incl. ƒ / /api/audit /api/cancel/… (log
  `out/m3b_build.log`). `npm run lint`: clean (exit 0).
- `docker-compose.yml` parses (yaml.safe_load: services api+web, volume hermes-data).
  Still **not booted** — no Docker daemon in this dev container (unchanged from M3A).

## 5. Servers left running (required end state)

- Backend :8100 — same untouched normal-mode uvicorn (`/healthz` 200).
- Web :3000 — restarted ONCE onto the fresh M3B build (sanctioned
  `setsid nohup npm run start > ../out/web.log 2>&1 < /dev/null &`), `/login` 200,
  pid in `out/web.pid`; golden re-verified green against it (m3b_playwright2.log).

## Deviations / honest skips

- **No skipped tests.** Nothing excluded; no FLAKY_ALWAYS_FAIL flip (speed was fine: full
  suite 1.1m).
- `vitest@5` ERESOLVEs against the pinned `@types/node@20` (peer wants >=22) — used
  `vitest@^3` + `@vitejs/plugin-react@^4` (spec allows any of the listed dev deps; versions
  not pinned by spec). `@playwright/test` latest.
- RTL needs explicit `afterEach(cleanup)` in `tests/setup.ts` (vitest `globals` left off to
  keep imports explicit); JSON-editor tests use `fireEvent.change` (userEvent's
  key-descriptor syntax collides with `{` and `paste` raced the controlled re-render).
- Discovered while testing (component left as-is, documented in the test): the edit-args
  validator reads state one keystroke behind (`onChange` validates `argsText` state, not
  the event value) — first invalid keystroke shows no alert until the next change; tests
  simulate two changes like real typing.
- `pgrep -f "next build"` self-match quirk noted during polling (cosmetic, tool-side).
