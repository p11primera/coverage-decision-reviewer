// WHY this is a client component: submitting a request mutates the browser-side CopilotKit
// agent (adds the user message) and drives copilotkit.runAgent over a live SSE connection —
// both are stateful browser APIs with no server-side equivalent. WHY the boundary sits
// exactly here: the surrounding page stays a Server Component (auth check + layout render
// on the server); only this form — the one thing the reviewer types into — crosses into
// client land, and it shares the agent with the read-only islands via the provider's
// registry (same agentId) rather than duplicating connection logic per island.

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { UseAgentUpdate, useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { publishRunCancelled } from "@/lib/cancelBus";
import { newId } from "@/lib/id";
import { loadDraft, saveDraft } from "@/lib/draftStore";

const DEFAULT_CPT = "72148"; // fixtures/coverage_rules.json has rules for it

export function RequestForm({ reviewer }: { reviewer: string }) {
  const { copilotkit } = useCopilotKit();
  const { agent, isReady } = useAgent({
    agentId: "reviewer",
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  const [restored, setRestored] = useState(false);
  const [patientSummary, setPatientSummary] = useState(
    "52-year-old male with 8 weeks of progressive low back pain radiating to the left leg, " +
      "worsening foot drop, and saddle numbness. History of treated renal cell carcinoma.",
  );
  const [cpt, setCpt] = useState(DEFAULT_CPT);
  const [notes, setNotes] = useState(
    "Neurologic exam shows 3/5 left ankle dorsiflexion and reduced anal sphincter tone. " +
      "NSAIDs and physical therapy have not relieved symptoms. MRI lumbar spine without " +
      "contrast requested to rule out cauda equina compression and metastatic disease.",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelState, setCancelState] = useState<"idle" | "pending" | "cancelled" | "not_found">("idle");
  const draftLoaded = useRef(false);
  // Set when a cancel was accepted: the agent gets a FRESH threadId immediately (so the
  // next submit cannot resume the half-persisted cancelled thread), but messages/state
  // wipe only AFTER the dying run's stream closes (in runAgent's finally) — clearing
  // mid-stream would yank message ids out from under trailing events the agent still
  // applies (AbstractAgent.apply, web/node_modules/@ag-ui/client/dist/index.d.ts:596).
  const freshThreadPending = useRef(false);

  // M3A concurrency guard: submit is blocked while a run is live OR an approval
  // interrupt is still pending (agent.pendingInterrupts,
  // web/node_modules/@ag-ui/client/dist/index.d.ts:545 — populated on RUN_FINISHED with
  // outcome.type==="interrupt", cleared by the next successful run). The observed defect
  // this closes: submitting during a mid-resume approval raced two runs and left the old
  // propose_decision chip stuck. aria-disabled + explanatory title (not a dead native
  // `disabled`) keeps the button focusable and screen-reader-visible with its reason.
  const interruptPending = agent.pendingInterrupts.length > 0;
  const running = busy || agent.isRunning;
  const blocked = !isReady || running || interruptPending;
  const blockedReason = !isReady
    ? "Connecting to the agent runtime…"
    : running
      ? "A review is already running — use Cancel to stop it"
      : interruptPending
        ? "Finish or cancel the current review first"
        : undefined;

  // Restore-once on mount (M1.1 continuity): a page navigation used to unmount this island and
  // with it the browser-side agent singleton, so the remount minted a fresh random threadId
  // (@ag-ui/client AbstractAgent constructor) and the reviewer lost their thread. We re-adopt
  // the persisted threadId — SAFE before any run (empty messages, not running) because the M0
  // backend owns history keyed by threadId, so continuing the same thread is exactly right —
  // and refill the unsent form fields. Writing threadId on the shared agent is deliberate here
  // (the useAgent doc-comment warns only about per-HOOK threadIds clobbering each other; every
  // island on this page intentionally shares one agent + one thread).
  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    const draft = loadDraft(reviewer);
    if (draft) {
      setPatientSummary(draft.patientSummary);
      setCpt(draft.cpt);
      setNotes(draft.notes);
      if (!agent.isRunning && agent.messages.length === 0) {
        agent.threadId = draft.threadId;
      }
    }
    setRestored(true); // even with no draft: unblocks the persist effect below
  }, [agent, reviewer]);

  // Persist every keystroke + the live threadId, keyed per signed-in reviewer (server-verified
  // name passed from the shell, so drafts never cross reviewers). Gate on `restored` so the
  // mount pass cannot clobber a stored draft with defaults before the restore has run.
  useEffect(() => {
    if (!restored || !isReady) return;
    saveDraft(reviewer, { threadId: agent.threadId, patientSummary, cpt, notes });
  }, [restored, isReady, reviewer, agent, patientSummary, cpt, notes]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (blocked) return; // guard (button is aria-disabled; Enter-in-field must not bypass)
    setError(null);
    setCancelState("idle");
    agent.addMessage({
      id: newId(), // LAN-IP (non-secure-context) safe: see lib/id.ts
      role: "user",
      content: JSON.stringify({ patient_summary: patientSummary, cpt, notes }),
    });
    setBusy(true);
    try {
      await copilotkit.runAgent({ agent });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (freshThreadPending.current) {
        // The cancelled stream has closed (this finally runs after its onFinalize), so the
        // wipe is safe now; the fresh threadId was already minted at cancel time.
        freshThreadPending.current = false;
        agent.setMessages([]);
        agent.setState({});
      }
    }
  }

  async function onCancel() {
    if (cancelState === "pending") return;
    setCancelState("pending");
    try {
      // BFF route (no direct browser→FastAPI): web/app/api/cancel/[threadId]/route.ts.
      const res = await fetch(`/api/cancel/${encodeURIComponent(agent.threadId)}`, {
        method: "POST",
        cache: "no-store",
      });
      if (res.ok) {
        setCancelState("cancelled");
        publishRunCancelled(); // freeze tool-activity chips + progress bar islands
        freshThreadPending.current = true;
        agent.threadId = newId(); // next submit = fresh run; backend history is per-thread
      } else if (res.status === 404) {
        // Backend registry already popped the token (run finished/interrupted first).
        setCancelState("not_found");
      } else {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? `Cancel failed (${res.status})`);
        setCancelState("idle");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCancelState("idle");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Prior authorization request"
      className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
        New coverage request
      </h2>
      <div className="mt-3 grid gap-3">
        <label className="block text-sm text-slate-700">
          <span className="font-medium">Patient summary</span>
          <textarea
            value={patientSummary}
            onChange={(e) => setPatientSummary(e.target.value)}
            rows={3}
            required
            className="mt-1 w-full rounded border border-slate-400 bg-white p-2 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
          />
        </label>
        <label className="block text-sm text-slate-700">
          <span className="font-medium">CPT / HCPCS code</span>
          <input
            value={cpt}
            onChange={(e) => setCpt(e.target.value)}
            required
            pattern="[0-9A-Z]{4,7}"
            title="4-7 alphanumeric code"
            className="mt-1 w-full rounded border border-slate-400 bg-white p-2 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
          />
        </label>
        <label className="block text-sm text-slate-700">
          <span className="font-medium">Clinical notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            required
            className="mt-1 w-full rounded border border-slate-400 bg-white p-2 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          aria-disabled={blocked ? "true" : undefined}
          title={blocked ? blockedReason : undefined}
          aria-describedby={blocked ? "submit-blocked-reason" : undefined}
          data-testid="submit-button"
          className={`mt-0 rounded px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
            blocked
              ? "cursor-not-allowed bg-blue-800/50"
              : "bg-blue-800 hover:bg-blue-900"
          }`}
        >
          {running ? "Review running…" : isReady ? "Submit for review" : "Connecting…"}
        </button>
        {running ? (
          // M3A Cancel: only reachable while a run is live. Real <button> (keyboard +
          // focus ring), AA contrast (white on red-800), announces via cancelState below.
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelState === "pending"}
            data-testid="cancel-button"
            className="rounded bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            {cancelState === "pending" ? "Cancelling…" : "Cancel run"}
          </button>
        ) : null}
      </div>
      {blocked && isReady && blockedReason ? (
        <p id="submit-blocked-reason" className="mt-2 text-xs text-slate-600">
          {blockedReason}
        </p>
      ) : null}
      {cancelState === "cancelled" ? (
        <p role="status" className="mt-3 rounded border border-green-300 bg-green-50 p-2 text-sm font-medium text-green-900">
          Run cancelled — history saved; you can start a new review
        </p>
      ) : null}
      {cancelState === "not_found" ? (
        <p role="status" className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm font-medium text-amber-900">
          No active run to cancel.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}
    </form>
  );
}
