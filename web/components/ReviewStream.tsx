// WHY this is a client component: it renders the live token stream — TEXT_MESSAGE_* deltas
// and RUN_ERROR events land on the browser-side agent instance held in CopilotKit's React
// context, so rendering has to happen where that subscription lives. WHY the boundary sits
// exactly here: the page shell above is static server HTML; only this transcript pane
// re-renders at token rate. Everything it shows is genuinely client state (mid-stream text
// that exists nowhere else until the run persists).

"use client";

import { useEffect, useState } from "react";

import { UseAgentUpdate, useAgent, useCopilotKit } from "@copilotkit/react-core/v2";

interface PolicyDetail {
  id: string;
  title: string;
  body: string;
  applies_to: string[];
}

/** One [POL-###] citation chip; a <button> so it is tab-reachable and Enter/Space operable. */
function CitationChip({ policyId }: { policyId: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail && !failed) {
      try {
        const res = await fetch(`/api/policies/${policyId}`);
        if (!res.ok) throw new Error(String(res.status));
        setDetail((await res.json()) as PolicyDetail);
      } catch {
        setFailed(true);
      }
    }
  }

  return (
    <span className="relative mx-0.5 inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-indigo-900 hover:bg-indigo-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
      >
        {policyId}
      </button>
      {open ? (
        <span
          role="dialog"
          aria-label={`Policy ${policyId} details`}
          className="absolute left-0 top-full z-10 mt-1 block w-72 rounded border border-slate-400 bg-white p-3 text-left text-xs text-slate-800 shadow-lg"
        >
          {detail ? (
            <>
              <span className="block font-semibold">{detail.title}</span>
              <span className="mt-1 block">{detail.body}</span>
              <span className="mt-1 block font-mono text-slate-500">
                Applies to: {detail.applies_to.join(", ")}
              </span>
            </>
          ) : failed ? (
            <span className="block text-red-800">Policy text unavailable.</span>
          ) : (
            <span className="block">Loading…</span>
          )}
        </span>
      ) : null}
    </span>
  );
}

/** Inline-citation renderer: splits on [POL-###] tokens and swaps them for chips. */
function withCitations(text: string) {
  return text.split(/(\[POL-\d+\])/g).map((part, i) =>
    /^\[POL-\d+\]$/.test(part) ? (
      <CitationChip key={i} policyId={part.slice(1, -1)} />
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function ReviewStream() {
  const { copilotkit } = useCopilotKit();
  const { agent, isReady } = useAgent({
    agentId: "reviewer",
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    // AgentSubscriber hooks (onRunFailed/onRunErrorEvent) per @ag-ui/client
    // (web/node_modules/@ag-ui/client/dist/index.d.ts:162,191) — surfaced via useAgent.
    const sub = agent.subscribe({
      onRunStartedEvent: () => setStreamError(null),
      onRunFailed: ({ error }) => setStreamError(error.message || "Stream failed"),
      onRunErrorEvent: ({ event }) => setStreamError(event.message || "Agent run failed"),
    });
    return () => sub.unsubscribe();
  }, [agent, isReady]);

  const narrative = [...agent.messages]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string" && m.content.length > 0)
    ?.content as string | undefined;
  const running = agent.isRunning;

  async function retry() {
    setStreamError(null);
    try {
      await copilotkit.runAgent({ agent });
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section
      aria-label="Review narrative"
      aria-busy={running}
      className="min-h-40 rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
        Review narrative {running ? <span className="animate-pulse">●</span> : null}
      </h2>
      {narrative ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-900">
          {withCitations(narrative)}
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          {running ? "Streaming…" : "No narrative yet — submit a request to start the review."}
        </p>
      )}
      {streamError ? (
        <div
          role="alert"
          className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <p className="font-semibold">Stream interrupted</p>
          <p className="mt-1">{streamError}</p>
          <button
            type="button"
            onClick={retry}
            disabled={!isReady || running}
            className="mt-2 rounded bg-red-800 px-3 py-1.5 font-semibold text-white hover:bg-red-900 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Retry
          </button>
        </div>
      ) : null}
    </section>
  );
}
