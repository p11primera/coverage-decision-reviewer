# M1.2 Spec — tool-activity legibility: attempts grouping (ApprovalCard TOOL ACTIVITY)

Context: web/components/ApprovalCard.tsx renders TOOL ACTIVITY keyed by toolCallId
(correct — one entry per real tool call; keep that invariant). Problem: when the model
retries a flaky tool (score_claim_risk fails then succeeds), users see two identical
labels with different statuses and no signal they are attempts of ONE logical tool.

Requirement (visual only, no data-model change):
- Group consecutive same-name tool calls (consecutive = adjacent in call order; do NOT
  group non-adjacent same-name calls across unrelated phases).
- Group header: "<tool_name>" plus, when count > 1, a compact "attempt N/M" prefix on
  each row (e.g. "score_claim_risk  (2 attempts)" header; rows "attempt 1 · failed",
  "attempt 2 · ok"). Single calls render exactly as today (no header/attempt noise).
- Keep aria-label="Approval and tool activity"; group rows must remain readable in
  order for screen readers (semantic list, aria-live for status changes stays as-is).
- Keyboard: no interactive elements added (rows are status display, not buttons).
- Keep statuses/colors identical to current ok/failed/running chips.

Constraints: touch ONLY ApprovalCard.tsx (plus a tiny pure helper colocated and exported
for tests — export it); no new deps; keep every existing resume/approval code path
byte-identical (grouping is render-layer only — derive groups from the existing
toolCallId-keyed state in render, do not mutate the map keys).
WHY comment: explain per-call rows are deliberate (trace isomorphism with server history)
and grouping is cosmetic.

Acceptance: npm run build + eslint clean in web/; render unit-test-free proof is fine
(no test infra yet — M3 adds Vitest; DO export the group-by-attempts pure function so
M3 tests can import it, path web/components/toolActivityGroups.ts). Rebuild + restart
web via out/web.log ONLY if web process is down (check curl :3000 first; do NOT restart
backend; do NOT kill the running web server — `next start` serves from .next so a
rebuild requires restart: in that case pkill "next[-]server" then nohup npm run start).
Save out/M1C_STATUS.md; commit:
git -c user.email=dustin@bone.dev -c user.name="Dustin Bone" commit -am "M1.2: group retry attempts in tool activity (cosmetic only, per-call rows preserved)"
