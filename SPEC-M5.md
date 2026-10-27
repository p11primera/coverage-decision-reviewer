# M5 spec — layout: two-column grid, fixed-height narrative, collapsible request summary, mobile bottom-sheet

Read SPEC-M4.md context (theme tokens), then the four target components + app/page.tsx.
Structural pass — but the DOM CONTRACT is law:

MUST SURVIVE BYTE-IDENTICAL (vitest 33/33 + Playwright golden/cancel/deny depend on them):
- form[aria-label="Prior authorization request"] with its inputs (2 textarea + 1 input) and
  their current accessible names — present and expanded BEFORE submit.
- Submit button + its aria-disabled guard logic (while a run is active and the form is
  expanded, aria-disabled stays "true" exactly as now).
- Cancel control while a run is active: accessible name must still match /cancel/i and be
  clickable mid-run (E2E cancel.spec). See directive 2 for where it lives when collapsed.
- Buttons named exactly Approve / Deny / Retry; role=alert error card in ReviewStream;
  role=dialog drawer + Esc/focus-trap (do not touch AuditDrawer.tsx at all).
- ApprovalCard section aria-label="Approval and tool activity"; StatePanel + ProgressBar
  internals untouched (their RTL tests mount them directly).
- Approve/Deny payload logic, resume code, toolCallId chip map: zero logic changes.
- ONLY these files: app/page.tsx, components/RequestForm.tsx, components/ReviewStream.tsx,
  components/ApprovalCard.tsx (wrapper-level classNames only for mobile sheet), plus NEW
  tests. No new deps.

DIRECTIVES:
1. app/page.tsx — inside the max-w-6xl shell, below the navy bar: CSS grid
   lg:grid-cols-[minmax(0,1fr)_380px] gap-6. Left column: RequestForm + ReviewStream.
   Right column: <aside aria-label="Decision rail" className="lg:sticky lg:top-6
   lg:max-h-[calc(100vh-6rem)] overflow-y-auto flex flex-col gap-4"> wrapping ProgressBar,
   StatePanel, ApprovalCard. Single column below lg (stack order: form, narrative, progress,
   state, approval).
2. components/RequestForm.tsx — add collapsed state: after submit succeeds, render a compact
   summary strip instead of the expanded form: one line with the submitted patient summary
   (truncated to ~60 chars), CPT code, plus buttons "New review" (expands empty form again)
   and — ONLY while a run is active — the existing Cancel control (keep its current
   accessible name + click path byte-identical). Keep the expanded form's current aria-label
   and structure. Store last submitted values in existing state (no new storage layer).
   If the form is expanded while a run is active (user clicked New review mid-run), the
   submit-button aria-disabled guard must still apply.
3. components/ReviewStream.tsx — narrative viewport: the narrative container gets
   h-[45vh] min-h-[300px] max-h-[620px] overflow-y-auto pr-1. Auto-anchor: effect scrolls to
   bottom when narrative length grows, UNLESS user scrolled up (track: within 40px of bottom
   counts as following). When not following and new text arrives, show a pill button
   (accessible name contains "new updates") that scrolls to bottom on click. Empty+running:
   render 3 skeleton lines (animate-pulse bg-slate-200 rounded blocks) instead of the
   "Streaming…" text. Keep role=alert + Retry logic untouched; keep aria-label
   "Review narrative" on the section.
4. components/ApprovalCard.tsx — mobile bottom sheet: BELOW lg, when an interrupt is pending,
   render the card fixed to viewport bottom (className on the existing section:
   max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:rounded-none
   max-lg:border-t-2 ... ) ; at lg+ it stays exactly as now (in the aside). NO changes inside
   the section's contents/logic.

NEW TESTS (tests/ReviewStreamLayout.test.tsx + tests/RequestFormCollapse.test.tsx):
- ReviewStream: running+narrative → narrative container has the clamp classes (assert
  classList contains h-[45vh], min-h-[300px], max-h-[620px], overflow-y-auto — jsdom has no
  layout engine so class assertion IS the contract test, document that); running+empty →
  skeleton blocks present (aria-hidden decorative divs with animate-pulse) and no "Streaming…"
  text.
- RequestForm: submit → summary strip shows CPT + "New review" button; click New review →
  expanded form[aria-label=...] returns. Mock CopilotKit hooks like existing tests do.

GATES: npm run test (33 existing + new all green; NEVER edit existing tests), npm run lint.
Do NOT run next build (orchestrator owns it). Do NOT touch :3000/:8100 containers or :3001.
out/M5_STATUS.md + commit: git -c user.email=dustin@bone.dev -c user.name="Dustin Bone" commit -am "M5: two-column layout with sticky decision rail, fixed-height narrative viewport, collapsible request summary, mobile approval sheet"
