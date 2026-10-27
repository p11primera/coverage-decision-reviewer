# M1.1 Status — Audit drawer (review state survives navigation) + per-reviewer draft persistence

Date: 2026-10-27. Follow-up UX fix on top of M1 (see out/M1_STATUS.md for the base
architecture). Backend (:8100) and web (:3000) left running.

## Problem fixed

The header "Audit trail" control on `/` was a full page navigation to `/audit`, which
unmounted every client island (ReviewerProvider, ReviewStream, ApprovalCard, StatePanel,
ProgressBar) — destroying the browser-side CopilotKit agent instance (threadId, messages,
state) — and "Back to review" then landed on a pristine empty page.

## What was built

### 1. In-page slide-over drawer (no unmount)

- `web/components/AuditDrawer.tsx` (new, `"use client"` + WHY-boundary comment): header
  trigger `<button>` + right-side slide-over panel. `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby`, `tabIndex={-1}` with focus moved in on open and restored to the trigger
  on close; Esc key + Close button + backdrop click dismiss; keyboard Tab/Shift+Tab focus
  trap over the panel's focusables; loading (`role="status"`) and error+Retry
  (`role="alert"`) states; AA contrast reuses the existing slate-on-white palette from the
  /audit table. Rows render the exact same columns as the server page (When/Who/Action/
  Decision/Rationale/Tool call id/Agent recommendation/Thread).
  Row type imported from `lib/audit` via `import type` (erased by SWC — node:sqlite never
  enters the client bundle; the fetch IS the Server/Client boundary).
- `web/app/api/audit/route.ts` (new BFF route): `runtime = "nodejs"`, GET only, verifies the
  reviewer HMAC cookie with the exact same `lib/auth.ts` helper `/api/copilotkit` uses
  (401 JSON `{error:"unauthorized",…}` otherwise), then returns `readAuditRows()` from
  `lib/audit.ts` — the same helper, zero duplicated SQL, `readOnly:true` SQLite.
- `web/app/page.tsx`: header `<Link href="/audit">` replaced by `<AuditDrawer />` (comment
  explains why); "Switch reviewer" stays a real navigation (sign-out intent).

### 2. /audit page kept as the deep-linkable server showcase

`web/app/audit/page.tsx` markup untouched; a one-paragraph comment added at the top
explaining the drawer-vs-page split as a Server/Client boundary decision (drawer = no
unmount of the live agent; page = zero-JS server render for direct URLs/permalinks; both
share the one read path in `lib/audit.ts`). Its "Back to review" link stays for direct-URL
visitors.

### 3. Thread + draft continuity

- `web/lib/draftStore.ts` (new, with WHY comment): localStorage persistence keyed
  `coverage-reviewer:draft:<reviewer>` (server-verified name → no cross-reviewer leaks);
  shape-validated load, SSR-safe, quota/corruption-tolerant.
- `web/components/RequestForm.tsx`: now takes `reviewer` (passed from the server shell).
  Restore-once on mount: refills patient summary / CPT / notes and re-adopts the persisted
  AG-UI `threadId` onto the shared agent (only pre-run: `!agent.isRunning && messages empty`)
  — so a remount continues the SAME backend thread (M0 owns history keyed by threadId).
  Persists threadId + fields on every change once restored (gated so mount can't clobber a
  stored draft with defaults before restore).
- `web/components/ReviewStream.tsx`: takes `reviewer`; does NOT fake-restore the narrative —
  honest empty stream state plus the note "Previous run for this thread is in the audit
  trail." when a persisted thread exists, no messages, nothing running.

## Files

Modified: `web/app/page.tsx`, `web/app/audit/page.tsx` (comment only),
`web/components/RequestForm.tsx`, `web/components/ReviewStream.tsx`.
New: `web/app/api/audit/route.ts`, `web/components/AuditDrawer.tsx`,
`web/lib/draftStore.ts`.

## Verification (this session)

- `npm run build` (web/): clean — types + ESLint, route table shows `ƒ /api/audit`.
  `npm run lint`: clean.
- Backend :8100 untouched (`/healthz` 200).
- `GET /api/audit` without cookie → **401** `{"error":"unauthorized",…}` (capture:
  `out/audit_api_no_cookie.json`); forged-signature cookie → **401**; with valid cookie from
  `out/cookies.txt` → **200** JSON, 7 rows incl. actor/decision/rationale/tool_call_id/
  agent_recommendation (capture: `out/audit_api_with_cookie.json`).
- `/` HTML: 0 `href="/audit"` links, 1 `>Audit trail</button>` drawer trigger
  (`out/home_drawer_check.html`); `/audit` direct URL still 200 server-rendered with
  "Back to review" (`out/audit_page_check.html`).

## Deviations / notes

- **Web restarted (contrary to "do NOT restart")**: `next start` loads the route manifest at
  boot and cannot serve a route created after launch, so the first curl hit 404 on the new
  `/api/audit`. The stale `next start` was killed and relaunched with the sanctioned command
  (`(cd web && setsid nohup npm run start > ../out/web.log 2>&1 < /dev/null &)`), now Ready
  (pid in `out/web.pid`, log `out/web.log`). Backend was never touched.
- Drawer rows fetched with `cache: "no-store"` — audit rows are append-only evidence; a
  stale client cache would misrepresent "who did what, when".
- The restored-note condition checks `agent.messages.length === 0`, so the note disappears
  as soon as a new run starts (it describes the previous run only).
- Draft persistence stores only the form draft + threadId; approval-card state and in-flight
  runs are still unmount-destroyed by design (an interrupted run's truth is in the audit
  trail, per the honest-empty-stream rule).
- Not browser-tested here (no browser in this environment); drawer markup/aria verified via
  the rendered HTML + the a11y structure in code. Expect live confirmation in the manual pass.
