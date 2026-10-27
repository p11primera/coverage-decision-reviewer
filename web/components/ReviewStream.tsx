// WHY this is a client component: it renders the live token stream — TEXT_MESSAGE_* deltas
// and RUN_ERROR events land on the browser-side agent instance held in CopilotKit's React
// context, so rendering has to happen where that subscription lives. WHY the boundary sits
// exactly here: the page shell above is static server HTML; only this transcript pane
// re-renders at token rate. Everything it shows is genuinely client state (mid-stream text
// that exists nowhere else until the run persists).

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { UseAgentUpdate, useAgent, useCopilotKit } from "@copilotkit/react-core/v2";

import { loadDraft } from "@/lib/draftStore";

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
        className="rounded bg-purple-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-purple-900 hover:bg-purple-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
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

/**
 * Inline-citation handling for the Markdown renderer: rewrites the model's bracketed
 * [POL-###] tokens into markdown links with a pol:// scheme BEFORE parsing, then the
 * `a` component override below renders those links as interactive CitationChips.
 * (Plain <p>{text}</p> showed raw markdown — the narrative is genuine LLM output and
 * the model emits markdown emphasis/lists; rendering it is the honest display.)
 */
function citeToLink(text: string) {
  return text.replace(/\[(POL-\d+)\]/g, "[$1](pol://$1)");
}

const MD_COMPONENTS = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mt-2 text-sm leading-6 text-slate-900 first:mt-0">{children}</p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em>{children}</em>,
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-900">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-900">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) =>
    href?.startsWith("pol://") ? (
      <CitationChip policyId={href.slice("pol://".length)} />
    ) : (
      <a className="text-brand underline hover:text-brand-dark" href={href}>
        {children}
      </a>
    ),
} as const;

export function ReviewStream({ reviewer }: { reviewer: string }) {
  const { copilotkit } = useCopilotKit();
  const { agent, isReady } = useAgent({
    agentId: "reviewer",
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const [streamError, setStreamError] = useState<string | null>(null);
  // M1.1 honesty rule: a remount re-adopts the persisted threadId (RequestForm) but must NOT
  // fake-restore the narrative — the streamed text lived only in the unmounted agent, and
  // re-reading it from history would prettify a state that is genuinely empty. So the pane
  // stays in its honest empty state and merely points at the audit trail for the prior run.
  const [restoredThreadId, setRestoredThreadId] = useState<string | null>(null);
  useEffect(() => {
    setRestoredThreadId(loadDraft(reviewer)?.threadId ?? null);
  }, [reviewer]);

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

  // M5 auto-anchor: follow the stream while the reviewer is at (or near) the bottom —
  // within 40px counts as following — and stop following the moment they scroll up. When
  // they are not following and new text arrives, a pill offers the jump back down.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const lastNarrativeLength = useRef(0);
  const narrativeLength = narrative?.length ?? 0;
  useEffect(() => {
    if (narrativeLength > lastNarrativeLength.current) {
      const el = viewportRef.current;
      if (el && following) el.scrollTop = el.scrollHeight;
    }
    lastNarrativeLength.current = narrativeLength;
  }, [narrativeLength, following]);

  function onViewportScroll() {
    const el = viewportRef.current;
    if (!el) return;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight <= 40);
  }

  function scrollToLatest() {
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setFollowing(true);
  }

  // M3A retry semantics (honest documentation): Retry calls copilotkit.runAgent again on
  // the SAME agent instance and SAME threadId. That is a NEW agent run, not a byte-level
  // resume of the dead SSE: HttpAgent.runAgent
  // (web/node_modules/@ag-ui/client/dist/index.d.ts:303-319) POSTs a fresh RunAgentInput,
  // and because the server owns history (M0 design), the backend replays this thread's
  // persisted ModelMessages from SQLite and the model continues from where the durable
  // history ends. Concretely: a stream that died before its last message was persisted
  // (connection refused / mid-run death — on_complete never ran, nothing was appended)
  // effectively resumes at the last persisted point; a stream that died after persistence
  // continues the conversation from there. There is no mid-tool-call replay: a partially
  // executed tool is re-run from scratch by the model. The user message that started the
  // failed run is still in agent.messages, so the BFF's last-user-message filter resends
  // exactly the original request.
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Review narrative {running ? <span className="animate-pulse">●</span> : null}
      </h2>
      {/* M5 fixed-height narrative viewport: the stream scrolls inside a clamped box so
          the decision rail beside it never jumps as tokens land (jsdom has no layout
          engine — tests/ReviewStreamLayout.test.tsx pins the clamp classes themselves). */}
      <div
        ref={viewportRef}
        onScroll={onViewportScroll}
        data-testid="narrative-viewport"
        className="mt-3 h-[45vh] min-h-[300px] max-h-[620px] overflow-y-auto pr-1"
      >
        {narrative ? (
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={MD_COMPONENTS}
            // react-markdown's default urlTransform blanks unknown protocols — ours is
            // pol:// (citation chips). Allowlist it plus http(s); everything else blanked.
            urlTransform={(url) =>
              url.startsWith("pol://") || /^https?:/i.test(url) ? url : ""
            }
          >
            {citeToLink(narrative)}
          </Markdown>
        ) : running ? (
          // M5: an in-flight run with no tokens yet shows skeleton lines, not "Streaming…".
          <div className="space-y-2 py-1">
            <div aria-hidden="true" className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
            <div aria-hidden="true" className="h-3 w-full animate-pulse rounded bg-slate-200" />
            <div aria-hidden="true" className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              No narrative yet — submit a request to start the review.
            </p>
            {restoredThreadId !== null && agent.messages.length === 0 ? (
              <p className="mt-2 text-xs italic text-slate-600">
                Previous run for this thread is in the audit trail.
              </p>
            ) : null}
          </>
        )}
      </div>
      {!following && narrative ? (
        <button
          type="button"
          onClick={scrollToLatest}
          className="mt-2 inline-flex items-center rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white shadow hover:bg-navy/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          ↓ New updates — jump to latest
        </button>
      ) : null}
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
