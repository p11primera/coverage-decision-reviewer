# M4 status — Evolent-inspired light theme (class-string pass)

Done per SPEC-M4.md directives 1-8. Class-string edits only for existing
elements; the only JSX additions are the spec-mandated decorative pieces
(teal underline blocks, login hero panels) — every aria-label, role, button
name, data-attribute, element type and text node stayed byte-identical.

## Files touched (11 + 2 foundation files left as the orchestrator left them)
1. web/app/page.tsx — header → navy chrome bar (bg-navy text-white, rounded-lg,
   max-w-6xl container); wordmark text-lg font-semibold + 40px×3px bg-accent
   underline (aria-hidden); Signed in as / ConnectionStatus / AuditDrawer in the
   bar's right side; Switch-reviewer link → text-white variant.
2. web/components/RequestForm.tsx — submit CTA bg-brand hover:bg-brand-dark
   rounded-lg font-medium (blocked state bg-brand/50, aria-disabled guard
   untouched); inputs rounded-lg border-slate-300 focus-visible:outline-brand;
   section label text-ink-soft.
3. web/components/ApprovalCard.tsx — Approve bg-brand hover:bg-brand-dark
   (primary); Deny border-2 border-brand text-brand hover:bg-brand/5; card
   rounded-lg (verified); inputs/secondary button unified to the slate-300/
   brand-ring family; all disabled/aria logic byte-identical; STATUS_CHIP
   semantic colors + rounded-full untouched.
4. web/components/ReviewStream.tsx, web/components/StatePanel.tsx — cards
   verified rounded-lg/border-slate-300/shadow-sm; uppercase section labels →
   text-ink-soft (sizes kept: h2 text-sm, h3 text-xs — see deviations).
5. web/components/ProgressBar.tsx — fill bg-brand, track bg-slate-200 kept,
   aria roles/labels untouched.
6. web/components/ConnectionStatus.tsx — NO CHANGE (audit confirmed: semantic
   pills kept, streaming bg-amber-100 text-amber-900, no teal anywhere).
7. web/components/AuditDrawer.tsx + web/app/audit/page.tsx — drawer header
   bg-navy text-white, close button text-white/white-ring, drawer trigger
   text-white (lives in the navy bar); table header rows bg-navy text-white;
   zebra rows bg-white odd:bg-slate-50; role=dialog/focus-trap/Esc untouched.
8. web/app/login/page.tsx + web/components/LoginForm.tsx — two-column hero:
   left bg-navy text-white with product name text-3xl font-normal
   tracking-tight + bg-accent underline block + one original plain sentence;
   right panel the existing form card on paper; Sign-in button bg-brand
   hover:bg-brand-dark rounded-lg; input unified to the themed input family.

Extra (contrast-rule-mandated, interactive text = brand purple): audit page
"Back to review" link and ReviewStream markdown <a> links blue → brand.
Semantic reds kept for destructive/error actions (Cancel run, Retry buttons,
role=alert boxes) exactly like the status-chip exemption.

## Verify (next build NOT run during the user's docker build; run after it finished)
- npm run test:
  " Test Files  8 passed (8)"
  "      Tests  33 passed (33)"
  (no test file was touched)
- npm run lint: clean (eslint, no output).
- npm run build: ✓ Compiled successfully in 3.3min; "Linting and checking
  validity of types" passed; all 9 routes emitted. Log: out/m4_build.log.
  Detached via setsid (build exceeds the 110s per-command cap).
- Playwright E2E not run (containers on :3000/:8100 belong to the user
  docker stack — untouched); selectors are all role/name/aria based and
  those stayed byte-identical.

## Deviations (all deliberate, none violate the hard rules)
- Directive 4 says labels "stay uppercase text-xs tracking-wide"; the h2
  section labels were already text-sm (h3 text-xs) — "stay" read as
  preserve-size, the mandated change was text-ink-soft, applied.
- Directive 1's underline block + directive 8's hero required adding purely
  decorative nodes (aria-hidden divs, presentational wrappers); no existing
  element's attributes/text/type/position-in-role-tree changed. The login h1
  moved into the left panel with byte-identical element type + text.
- Deny button: added bg-transparent alongside the specified
  border-2 border-brand text-brand hover:bg-brand/5 (button UA default bg).
- Blocked submit uses bg-brand/50 (mirrors prior bg-blue-800/50 pattern).
- Login input + ApprovalCard input/secondary-button rings unified to brand
  (consistency with directive 2's input family); spec only named RequestForm
  inputs explicitly.
- Build launched detached (setsid) because it outlives the 110s command cap.
