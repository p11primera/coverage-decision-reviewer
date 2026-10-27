# M3 Spec (Pass A — features): resilience UX, cancel/resume, form guard, container polish

Read POC_PROMPT.md (product intent, especially the JD bullet "slow, interrupted, or failed
agent calls: resumable streams, retries, timeouts, clear status") and SPEC-M1.md /
out/M1B_STATUS.md first. Backend :8100 and web :3000 run via scripts/run_server.sh and
npm run start. Do NOT read outside the repo; temps in out/ only.

## 1. Cancel (wire the existing backend endpoint through the BFF + UI)
- Backend POST /cancel/{thread_id} already exists (cancellation-token registry + on_cancel
  persists resumable history from RunCancelled.all_messages()). Do not change its semantics.
- NEW BFF route web/app/api/cancel/[threadId]/route.ts: nodejs runtime, HMAC cookie-gated
  (reuse lib/auth.ts), 401 JSON otherwise, proxies POST to AGENT_URL's /cancel/<threadId>,
  forwards backend status (incl. 404 not_found).
- UI: while a run is active (agent.isRunning), the RequestForm area shows a Cancel button
  (keyboard-operable, focus ring, AA). On success: visible status "Run cancelled — history
  saved; you can start a new review" (role=status) and progress/tool-activity chips freeze
  with their last statuses (no spinner hangs). On 404: "No active run to cancel."
- After cancel, submitting again MUST work cleanly on a fresh run (new threadId) — no stuck
  isRunning.

## 2. Pending-interrupt / concurrency guard (observed defect)
Observed: submitting a new request while a previous approval was mid-resume left the old
propose_decision chip stuck "failed" and raced two runs. Guard:
- Disable submit while agent.isRunning OR an interrupt is pending (useInterrupt state).
- Disabled state has aria-disabled + tooltip text explaining why (e.g. "Finish or cancel the
  current review first"), not just a dead button.
- Keep the existing happy path unregressed.

## 3. Stream-death resilience (clear status + retry)
- If the SSE connection dies / backend unreachable mid-run (simulate: backend down), the
  ReviewStream must show a clear error card (role=alert) with a Retry button that re-runs
  (retries the same agent run — CopilotKit runAgent again on same thread is acceptable;
  document behavior honestly in the card comment).
- Add a small "Status: connected / streaming / failed" indicator next to the header
  reviewer name, driven by agent subscription state.

## 4. Container polish (AKS-portable, no Vercel features)
- Complete web/Dockerfile: multi-stage (deps → build → node:26-alpine-ish runtime — use
  node:26-slim if alpine glibc issues; non-root; HEALTHCHECK curl :3000/login; NEXT_TELEMETRY_DISABLED=1).
- Root docker-compose.yml: replace the M0 'web' placeholder: services web (build ./web,
  env SESSION_SECRET, AGENT_URL=http://api:8100/agent, depends_on api healthcheck), api
  (build ., DATABASE_PATH=/data/reviewer.db, volume hermes-style named volume for /data),
  healthchecks on both. No Vercel, no vendor lock-in; document AKS mapping in comments
  (web+api = Deployments, PVC for /data). Docker daemon is NOT available in this dev
  container: do not try to run compose; a lint-level sanity check (docker compose config
  if binary present, else YAML parse via node) is enough — note it honestly in status.

## Acceptance (verify yourself)
1. npm run build + lint clean.
2. Cancel E2E by hand: start backend :8100 + web :3000 (detached: use setsid nohup ... < /dev/null
   so your tool timeouts don't kill servers; readiness via curl). Submit a request; while
   progress is streaming click Cancel; assert: status message appears, chips freeze, form
   re-enables, and a NEW submit then completes to interrupt + approve (full round trip).
   Save out/m3_cancel_capture.txt (the SSE from scripted_run.py with FLAKY_ALWAYS_FAIL=1
   to make the run long enough: run_claim_checks sleeps) OR browser-captured equivalent.
3. Guard proof: during active run, submit button aria-disabled=true (DOM check via curl'ed
   page is not enough — do a node script with the Playwright package if installed, else
   puppeteer-core pointed at /opt/hermes/tools/chromium-1208/chrome-linux/chrome, else
   document manual DOM inspection via evaluate_script equivalent).
4. Backend unreachable resilience: stop backend, submit → error card with Retry appears,
   no uncaught errors in out/web.log; restart backend, Retry → completes.
5. Leave both servers running; write out/M3A_STATUS.md (routes, files, honest deviations,
   how docker verification was done); commit: git -c user.email=dustin@bone.dev -c
   user.name="Dustin Bone" commit -am "M3A: cancel via BFF + resilience UX + concurrency guard + web Dockerfile/compose".
