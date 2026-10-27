# M3A Status — cancel via BFF + resilience UX + concurrency guard + containers

## Delivered (code by OpenCode `m3a-features`/`m3a-finish` session; acceptance verified
## personally by the orchestrating agent in headless Chromium over the LAN IP after the
## builder process hung in-model-inference ~40min before finishing its own acceptance run)

### Files
- `web/app/api/cancel/[threadId]/route.ts` — BFF cancel route: nodejs runtime, HMAC
  reviewer cookie gate (reuses lib/auth.ts), proxies to backend POST /cancel/{threadId},
  forwards 404 not_found.
- `web/components/ConnectionStatus.tsx` — Status pill (connected/streaming/failed) inside
  the shared ReviewerProvider, driven by the same agent subscription as the stream.
- `web/lib/cancelBus.ts` — cancel signalling between RequestForm and run state.
- `web/components/RequestForm.tsx` — Cancel button during active run; submit guard
  (`aria-disabled=true` while running/interrupt pending — ARIA-disabled, not native
  disabled, so screen readers announce the reason).
- `web/components/ReviewStream.tsx` — stream-death error card (role=alert) with Retry.
- `web/Dockerfile` + root `Dockerfile` + `docker-compose.yml` — telemetry opt-outs
  (NEXT_TELEMETRY_DISABLED, COPILOTKIT_TELEMETRY_DISABLED), web runs the exact
  `next start` command as the verified local flow (no untested standalone/server.js
  path), HEALTHCHECK hits /login 200 (real render, not a bare 307).

## Verified by orchestrator (headless Chromium, http://192.168.1.96:3000)
1. Guard: mid-run submit button `aria-disabled="true"`, Cancel button present,
   header pill "Status: streaming".
2. Cancel mid-stream: "cancelled — history saved; you can start a new review", chips
   freeze (in-flight flaky tool shows dedicated "stopped" state, not "failed"),
   submit re-enabled.
3. Resubmit after cancel: full round-trip to interrupt -> Approve -> RECOMMENDATION
   shows "approve".
4. Backend killed mid-stream: role=alert card "Stream interrupted / fetch failed" +
   Retry button + "Status: failed" pill; no uncaught client errors.
5. Backend restored (normal stochastic mode): Retry recovered the same page instance
   to a fresh interrupt -> approve completed the review.
6. Cancel BFF gate: no cookie -> 401 JSON; forged signature -> 401; valid cookie +
   unknown thread -> backend {"status":"not_found"} 404 passthrough.

## Not verified here (honest)
- `docker compose up` (no Docker daemon in this dev container) — must be run on the
  Pi host; images are lint-clean YAML but unbooted.
- Focus-trap keyboard audit of the error card (drawer's was verified in M1.1).
