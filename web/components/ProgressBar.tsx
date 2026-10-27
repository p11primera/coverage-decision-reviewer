// WHY this is a client component: it renders CUSTOM(review_progress) events as they arrive
// on the live SSE connection — the values exist only in the browser mid-run. WHY the
// boundary sits here: same reasoning as the other islands — the agent subscription lives
// in client React context; the server shell stays static.
//
// CUSTOM-event mechanism (investigated in the installed packages, not guessed):
// CopilotKit 1.80 does NOT surface CUSTOM events on its public core subscriber —
// `CopilotKitCoreSubscriber` has run/tool/agent/context hooks but no custom-event hook
// (web/node_modules/@copilotkit/core/dist/index.d.mts:2189-2260). The real mechanism is
// the AG-UI `AgentSubscriber.onCustomEvent` callback
// (web/node_modules/@ag-ui/client/dist/index.d.ts:258-260), registered on the agent
// instance returned by the public headless hook `useAgent`
// (web/node_modules/@copilotkit/react-core/dist/v2/headless.d.mts:250-257, exposing
// `AbstractAgent.subscribe` — web/node_modules/@ag-ui/client/dist/index.d.ts:580-582).
// Backend: agent.py's run_claim_checks emits ReviewProgressEvent → SSE `CUSTOM`
// events (name "review_progress", value {checked,total,check}) which the client agent
// replays to every registered subscriber.

"use client";

import { useEffect, useState } from "react";

import { UseAgentUpdate, useAgent } from "@copilotkit/react-core/v2";

interface ProgressValue {
  checked?: number;
  total?: number;
  check?: string;
}

export function ProgressBar() {
  const { agent, isReady } = useAgent({
    agentId: "reviewer",
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  const [progress, setProgress] = useState<ProgressValue | null>(null);

  useEffect(() => {
    if (!isReady) return;
    const sub = agent.subscribe({
      onRunStartedEvent: () => setProgress(null),
      onCustomEvent: ({ event }) => {
        if (event.name === "review_progress") {
          setProgress(event.value as ProgressValue);
        }
      },
    });
    return () => sub.unsubscribe();
  }, [agent, isReady]);

  const checked = progress?.checked ?? 0;
  const total = progress?.total ?? 0;
  const percent = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <section
      aria-label="Claim checks progress"
      className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
        Claim checks
      </h2>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total || 100}
        aria-valuenow={checked}
        aria-valuetext={progress ? `${checked} of ${total}: ${progress.check}` : "idle"}
        className="mt-3 h-3 w-full overflow-hidden rounded bg-slate-200"
      >
        <div
          className="h-full bg-blue-800 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-700" aria-live="polite">
        {progress
          ? `Checked ${checked}/${total} — ${progress.check ?? ""}`
          : total === 0
            ? "Waiting for the check sweep to start."
            : ""}
      </p>
    </section>
  );
}
