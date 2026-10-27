# M4 spec — Evolent-inspired light theme (unaffiliated look & feel)

Foundation ALREADY DONE by the orchestrator (do not redo): web/app/globals.css has the
token palette (@theme inline: brand #7c1c93, brand-dark #5f1571, accent #08f0d5, navy
#020623, ink-soft #25282a, background #f4f4f4) + Montserrat cadence headings; web/app/
layout.tsx loads Montserrat via next/font + renders the unaffiliated footer disclaimer.

Your job: apply the theme across the components with CLASS-STRING edits ONLY.

HARD RULES:
- No logic/JSX-structure/prop changes. Every aria-label, role, button name, data-
  attribute, and element type stays byte-identical — 33 vitest tests + Playwright E2E
  selectors (form[aria-label="Prior authorization request"], buttons Approve/Deny/Retry/
  Sign in, role=alert, role=dialog, aria-disabled guard) depend on them.
- No new dependencies. Tailwind v4 utility classes only (tokens above are available as
  bg-brand, text-brand, bg-navy, text-navy, bg-accent, bg-background, text-foreground...).
- Contrast law (a11y tests may check): #08f0d5 teal is allowed ONLY as a graphical
  element on the navy chrome (rules, bars, dots) or decorative dividers — NEVER as text
  on white. Interactive text/buttons use brand purple (AA on white).
- Keep semantic status chip colors (ok=green, failed=red, running=amber, stopped=slate) —
  reviewers read them semantically; only unify their shape (rounded-full stays).

Per-file directives:
1. app/page.tsx — replace the current plain header with a navy chrome bar: bg-navy
   text-white, container max-w-6xl; wordmark "Coverage Decision Reviewer" text-lg
   font-semibold + a 40px x 3px bg-accent underline block below it (the reference's teal
   accent); keep Signed in as / ConnectionStatus / AuditDrawer where they are (move into
   the bar's right side, text-white variants OK). Page content below stays on paper bg.
2. components/RequestForm.tsx — submit button: bg-brand hover:bg-brand-dark text-white
   rounded-lg px-4 py-2 font-medium (reference CTA shape: 8px radius, medium weight).
   Inputs: rounded-lg border-slate-300 focus-visible:outline-2 focus-visible:outline-brand.
   Preserve every aria-label + the aria-disabled guard semantics EXACTLY.
3. components/ApprovalCard.tsx — card chrome rounded-lg; Approve button bg-brand (it is
   the page's primary action), Deny secondary: border-2 border-brand text-brand
   hover:bg-brand/5 (keeps the purple affordance family); keep all disabled/aria logic.
4. components/ReviewStream.tsx, StatePanel.tsx — cards: bg-white border border-slate-300
   rounded-lg shadow-sm (match existing, just verify radius unified to rounded-lg);
   section labels stay uppercase text-xs tracking-wide but text-ink-soft.
5. components/ProgressBar.tsx — fill bg-brand, track bg-slate-200, keep aria roles/labels.
6. components/ConnectionStatus.tsx — keep semantic pills; streaming pill: bg-amber-100
   text-amber-900 stays; do NOT use teal text here (white background).
7. components/AuditDrawer.tsx + app/audit/page.tsx — drawer header bg-navy text-white
   with close button text-white; audit table header row bg-navy text-white, zebra rows
   bg-white/odd:bg-slate-50; keep role=dialog/focus-trap/Esc logic untouched.
8. app/login/page.tsx + components/LoginForm.tsx — two-column hero: left panel bg-navy
   text-white (product name text-3xl font-normal tracking-tight + bg-accent underline
   block + ONE original sentence of your own writing describing the tool plainly —
   do NOT copy any external marketing copy), right panel the existing form card on paper.
   Sign-in button bg-brand hover:bg-brand-dark rounded-lg.

VERIFY (Pi is busy with a docker build — do NOT run next build): npm run test must be
33/33 green; npm run lint clean. Report any test you had to touch (should be none —
if a test breaks, your class edit violated the hard rules; fix the edit, not the test).
Write out/M4_STATUS.md; commit: git -c user.email=dustin@bone.dev -c user.name="Dustin Bone" commit -am "M4: Evolent-inspired light theme (Montserrat + navy/purple/teal tokens), unaffiliated".
