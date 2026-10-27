# M5 status — two-column grid, fixed-height narrative, collapsible request summary, mobile bottom-sheet

## Files touched (only the spec-allowed set)
- `web/app/page.tsx` — grid `lg:grid-cols-[minmax(0,1fr)_380px] gap-6`; left column
  RequestForm + ReviewStream; right `<aside aria-label="Decision rail" className="flex
  flex-col gap-4 overflow-y-auto lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)]">` wrapping
  ProgressBar, StatePanel, ApprovalCard. Single column below lg keeps DOM order
  form → narrative → progress → state → approval.
- `web/components/RequestForm.tsx` — collapsed summary strip after submit: truncated
  patient summary (~60 chars) + `CPT {code}`, "New review" button, and — only while a run
  is active — the Cancel control copied byte-identically (same `data-testid="cancel-button"`,
  accessible name "Cancel run"/"Cancelling…", onClick=onCancel, disabled rule). Expanded
  form + aria-label untouched; last submitted values kept in plain component state.
  aria-disabled guard untouched, so an expanded form mid-run (New review during a run)
  still gets `aria-disabled="true"`.
- `web/components/ReviewStream.tsx` — narrative viewport div
  (`h-[45vh] min-h-[300px] max-h-[620px] overflow-y-auto pr-1`, `data-testid=
  "narrative-viewport"`); auto-anchor effect on narrative length growth with 40px
  "following" threshold via onScroll; pill button "↓ New updates — jump to latest"
  (accessible name contains "new updates") when scrolled up and narrative present;
  running+empty renders 3 `aria-hidden` `animate-pulse bg-slate-200 rounded` skeleton
  blocks and the "Streaming…" text is gone. role=alert + Retry + section aria-label
  untouched.
- `web/components/ApprovalCard.tsx` — wrapper-level classNames only: when
  `agent.pendingInterrupts.length > 0` the section additionally gets
  `max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:rounded-none
  max-lg:border-t-2 max-lg:border-amber-500 max-lg:shadow-2xl`; at lg+ unchanged. No
  contents/logic changed.
- NEW: `web/tests/ReviewStreamLayout.test.tsx` (2 tests), `web/tests/RequestFormCollapse.test.tsx` (2 tests).

## Gates
- `npm run test`: 10 files / 37 tests passed (33 existing untouched + 4 new).
- `npm run lint`: clean (eslint, no output).
- `next build` NOT run (orchestrator gate). Playwright NOT run here (:3000/:8100/:3001
  off-limits per instructions); E2E selector audit done statically instead —
  submit-button/cancel-button testids, aria-disabled guard, Approve/Deny/Retry,
  role=alert, form/region/section aria-labels, "history saved" role=status (cancel
  re-expands the form so cancel.spec's submit-button + status assertions still resolve)
  all present.

## Verbatim vitest tail (final run, full output from `npm run test`)
```
 RUN  v3.2.7 /opt/data/workspace/evolent/coverage-reviewer/web

 ✓ tests/RequestFormCollapse.test.tsx (2 tests) 1732ms
   ✓ RequestForm collapse (M5) > submit succeeds -> compact summary strip with CPT + 'New review' replaces the form  1388ms
   ✓ RequestForm collapse (M5) > 'New review' expands an empty form with the original aria-label  338ms
 ✓ tests/ReviewStream.test.tsx (2 tests) 1611ms
   ✓ ReviewStream markdown rendering > renders emphasis and lists as HTML, not raw markdown syntax  1452ms
 ✓ tests/ApprovalCard.test.tsx (7 tests) 4077ms
   ✓ ApprovalCard (interrupt card) > renders the card region with accessible labels  1296ms
   ✓ ApprovalCard (interrupt card) > keeps Deny disabled until a non-empty rationale is typed (whitespace does not count)  896ms
   ✓ ApprovalCard (interrupt card) > includes editedArgs in the approve payload when edited args were saved as valid JSON  602ms
   ✓ ApprovalCard (interrupt card) > does not save invalid JSON (save button disabled + role=alert)  318ms
   ✓ ApprovalCard (interrupt card) > denies with payload {approved:false, reason:<rationale>}  671ms
 ✓ tests/ProgressBar.test.tsx (4 tests) 1231ms
   ✓ ProgressBar (CUSTOM review_progress events) > handles a missing initial state gracefully (delta-before-snapshot guard)  921ms
 ✓ tests/StatePanel.test.tsx (3 tests) 1087ms
   ✓ StatePanel > handles missing initial state gracefully (no crash, em-dash placeholders)  938ms
 ✓ tests/ReviewStreamLayout.test.tsx (2 tests) 1229ms
   ✓ ReviewStream narrative viewport > running + narrative: the container carries the fixed-height clamp classes  1153ms
 ✓ tests/auth.test.ts (7 tests) 31ms
 ✓ tests/toolChipStatus.test.tsx (3 tests) 986ms
   ✓ tool chip status (structured TOOL_FAILED: marker only) > marks a genuine failure (TOOL_FAILED: prefix) as failed  854ms
 ✓ tests/toolActivityGroups.test.ts (5 tests) 29ms
 ✓ tests/id.test.ts (2 tests) 18ms

 Test Files  10 passed (10)
      Tests  37 passed (37)
   Start at  20:48:36
   Duration  25.94s (transform 1.25s, setup 8.82s, collect 3.86s, tests 12.03s, environment 35.47s, prepare 4.30s)
```

## Deviations / judgement calls (all additive, none violating the DOM contract)
1. Collapse timing: the strip renders as soon as submit passes the guard (run started),
   not after `runAgent` resolves — this is what puts the Cancel control in the strip
   during the run, as directive 2 + cancel.spec require.
2. A successful cancel re-expands the form (the "history saved" role=status lives in the
   expanded form and cancel.spec asserts it plus the re-enabled submit button); a submit
   error also re-expands so the role=alert is visible. Not spelled out in the spec.
3. Collapsed strip additionally renders the `not_found` status and error `role=alert`
   paragraphs (same JSX) so a failed cancel isn't invisible while collapsed.
4. Skeleton widths vary (w-3/4 / w-full / w-2/3) for realistic shimmer; still exactly 3
   aria-hidden animate-pulse bg-slate-200 rounded blocks.
5. Pill copy: "↓ New updates — jump to latest" (contains "new updates").
6. Test-only `data-testid="narrative-viewport"` added to pin the clamp-class assertion.
7. jsdom has no layout engine: the clamp-class assertion IS the contract test (documented
   in the test header, per spec); scroll/follow behaviour is only exercised by Playwright
   in a real viewport.

## Not verifiable here
- Playwright golden/cancel/deny + visual behaviour of sticky rail, 45vh clamp, auto-anchor
  and mobile sheet (requires the running stack — orchestrator owns those gates).
- `npx tsc --noEmit` shows 4 pre-existing TS2493 errors in the UNTOUCHED
  tests/ApprovalCard.test.tsx (vi.fn mock tuple typing) — predates M5 and outside the
  vitest/lint gates; left alone per "never edit existing tests".
