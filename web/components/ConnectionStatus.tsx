// WHY this is a client component: "connected / streaming / failed" is observable only from
// the live browser-side agent (agent.isRunning + AgentSubscriber run-lifecycle callbacks —
// web/node_modules/@ag-ui/client/dist/index.d.ts:162-192, 541); the server has no view of
// this tab's SSE connection. WHY the boundary sits here: the header itself stays server
// HTML — this island is the single status pill next to the reviewer name and nothing else;
// it renders inside ReviewerProvider so it shares the same agent instance as the islands.

"use client";

import { useEffect, useState } from "react";

import { UseAgentUpdate, useAgent } from "@copilotkit/react-core/v2";

type ConnState = "connecting" | "connected" | "streaming" | "failed";

// AA-safe pill palettes (>=4.5:1 fg on bg, slate-adjacent like the rest of the app).
const PILL: Record<ConnState, string> = {
  connecting: "bg-slate-200 text-slate-800",
  connected: "bg-green-100 text-green-900",
  streaming: "bg-amber-100 text-amber-900",
  failed: "bg-red-100 text-red-900",
};

const LABEL: Record<ConnState, string> = {
  connecting: "connecting",
  connected: "connected",
  streaming: "streaming",
  failed: "failed",
};

export function ConnectionStatus() {
  const { agent, isReady } = useAgent({
    agentId: "reviewer",
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    // Failed = last run attempt errored (transport death or RUN_ERROR); any later run
    // start clears it, so a successful retry flips the pill back to streaming/connected.
    const sub = agent.subscribe({
      onRunStartedEvent: () => setFailed(false),
      onRunFailed: () => setFailed(true),
      onRunErrorEvent: () => setFailed(true),
    });
    return () => sub.unsubscribe();
  }, [agent, isReady]);

  const state: ConnState = !isReady
    ? "connecting"
    : agent.isRunning
      ? "streaming"
      : failed
        ? "failed"
        : "connected";

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="connection-status"
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[state]}`}
    >
      Status: {LABEL[state]}
    </span>
  );
}
