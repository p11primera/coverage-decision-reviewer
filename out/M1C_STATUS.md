# M1.2 Status — tool-activity attempts grouping (cosmetic only)

## Change
- NEW `web/components/toolActivityGroups.ts`: pure, exported
  `groupConsecutiveAttempts(entries: ToolCallEntry[]): AttemptGroup[]` (M3 Vitest will import).
  Also hosts the shared `ToolCallStatus` / `ToolCallView` types (imported by ApprovalCard).
- `web/components/ApprovalCard.tsx`: TOOL ACTIVITY render now derives groups at render time
  only. Consecutive same-name tool calls collapse under a header
  `"<name> (<N> attempts)"` with sub-rows `"attempt i · <status>"`. Single calls render
  byte-identical to before. The `toolCallId`-keyed state map and ALL resume/approval code
  paths are untouched (grouping is a render-layer derivation). WHY comment added explaining
  per-call rows = trace isomorphism with server history; grouping cosmetic.
- ok/failed/running chip markup + STATUS_CHIP colors preserved exactly in both single and
  group rows. No new deps, no interactive elements added.

## Verification
- `npm run build`: PASS (5/5 pages, build traces collected).
- `npm run lint` (eslint): clean, no output.
- Web restarted so next start serves fresh `.next`: killed `next-server`, relaunched
  `npm run start` (detached, pid 121942), logging to `out/web.log`.
  `curl localhost:3000/login` → 200.
- Backend untouched on :8100: `curl localhost:8100/healthz` → `{"status":"ok"}`.
