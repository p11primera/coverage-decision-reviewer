// Tiny browser-side pub/sub that announces "the reviewer cancelled the active run" to
// every island that must freeze (client-side) state — ApprovalCard's tool-activity chips
// and ProgressBar.
//
// WHY a module singleton instead of React context or an agent event: the cancel is
// initiated by RequestForm's fetch to /api/cancel/<threadId>, but the backend signals
// cancellation to the stream only as a BARE RUN_FINISHED — pydantic-ai's AG-UI adapter
// has no cancelled outcome yet (see the spec-gap comment in
// .venv/lib/python3.12/site-packages/pydantic_ai/ui/ag_ui/_event_stream.py:231-238), so
// AgentSubscriber.onRunFinishedEvent cannot distinguish "cancelled" from "succeeded"
// (web/node_modules/@ag-ui/client/dist/index.d.ts:177-192). The one component that KNOWS
// a cancel was accepted is the one whose fetch returned {status:"cancelled"} — so it
// publishes here and the read-only islands subscribe. Module scope is per browser tab
// (the same bundle), which is exactly the blast radius we want; nothing crosses the
// server boundary.

type CancelListener = () => void;

const listeners = new Set<CancelListener>();

export function publishRunCancelled(): void {
  for (const listener of [...listeners]) listener();
}

export function subscribeRunCancelled(listener: CancelListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
