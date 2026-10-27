// WHY this is a client component: the human-in-the-loop approval card reacts to the AG-UI
// interrupt carried by RUN_FINISHED (outcome.type="interrupt") on the live stream, keeps
// local form state (rationale, edited args, validation), and POSTs the resume[] — all
// browser-session interactions with the browser-side agent. WHY the boundary sits here:
// resume semantics (payload → ToolApproved/ToolDenied against the ORIGINAL tool_call_id)
// must stay intact end-to-end, so this island only builds the ResumeEntry payload — the
// protocol handling stays in useInterrupt/HttpAgent above and pydantic-ai's
// resume_entry_to_approval below; the server component shell renders the frame only.
//
// Interrupt mechanism (installed-API verified): useInterrupt from the headless v2 surface
// (web/node_modules/@copilotkit/react-core/dist/v2/headless.d.mts:543-589) handles the
// standard AG-UI interrupt flow (RUN_FINISHED outcome.type==="interrupt") and resumes with
// a spec ResumeEntry {interruptId, status:"resolved", payload} — interruptId preserved.
// Payload contract mirrors pydantic-ai's _ResumePayload (backend
// .venv/.../pydantic_ai/ui/ag_ui/_interrupt.py:110-112): {approved: bool, reason?: string,
// editedArgs?: object}; approved+editedArgs → ToolApproved(override_args), !approved →
// ToolDenied(message=reason).

"use client";

import { useEffect, useRef, useState } from "react";

import {
  UseAgentUpdate,
  useAgent,
  useInterrupt,
  type Interrupt,
} from "@copilotkit/react-core/v2";

import { subscribeRunCancelled } from "@/lib/cancelBus";

import {
  groupConsecutiveAttempts,
  type ToolCallStatus,
  type ToolCallView,
} from "./toolActivityGroups";

interface ProposedArgs {
  decision?: string;
  rationale?: string;
  cited_policy_ids?: string[];
}

const STATUS_CHIP: Record<ToolCallStatus, string> = {
  running: "bg-amber-100 text-amber-900",
  ok: "bg-green-100 text-green-900",
  failed: "bg-red-100 text-red-900",
  // M3A: frozen at cancel time — slate = terminal/unknown, AA on slate-50 chip bg.
  stopped: "bg-slate-300 text-slate-800",
};

function DecisionCard({
  interrupt,
  proposed,
  resolve,
}: {
  interrupt: Interrupt;
  proposed: ProposedArgs | null;
  resolve: (payload?: unknown, interruptId?: string) => Promise<unknown>;
}) {
  const [rationale, setRationale] = useState("");
  const [editing, setEditing] = useState(false);
  const [argsText, setArgsText] = useState(() => JSON.stringify(proposed ?? {}, null, 2));
  const [argsValid, setArgsValid] = useState(true);
  const [editedArgs, setEditedArgs] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const toolCallId = interrupt.toolCallId ?? interrupt.id.replace(/^int-/, "");
  const denyEnabled = rationale.trim().length > 0 && !submitting;
  const approveEnabled = !submitting;

  function validateArgs() {
    try {
      const parsed = JSON.parse(argsText) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("must be a JSON object");
      }
      setArgsValid(true);
      return true;
    } catch {
      setArgsValid(false);
      return false;
    }
  }

  async function respond(approve: boolean) {
    if (!interrupt.id) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { approved: approve };
      if (rationale.trim()) payload.reason = rationale.trim();
      if (approve && editedArgs) payload.editedArgs = editedArgs;
      try {
        await resolve(payload, interrupt.id);
      } catch (err) {
        setAnnouncement(err instanceof Error ? err.message : "Resume failed");
        return;
      }
      setAnnouncement(
        approve
          ? `Decision "${proposed?.decision ?? "?"}" approved${editedArgs ? " with edited args" : ""}.`
          : `Decision denied. Rationale recorded.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4">
      <h3 className="text-sm font-bold text-slate-900">Approval required — propose_decision</h3>
      <p className="mt-1 text-xs text-slate-700">
        Tool call <span className="font-mono">{toolCallId}</span>
      </p>

      <dl className="mt-3 space-y-2 text-sm text-slate-900">
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-600">Proposed decision</dt>
          <dd className="font-semibold">{proposed?.decision ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-600">Agent rationale</dt>
          <dd>{proposed?.rationale ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-600">Cited policy IDs</dt>
          <dd className="flex flex-wrap gap-1">
            {(proposed?.cited_policy_ids ?? []).map((id) => (
              <span
                key={id}
                className="rounded bg-purple-100 px-1.5 py-0.5 font-mono text-xs text-purple-900"
              >
                {id}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      <label className="mt-4 block text-sm text-slate-900">
        <span className="font-medium">
          Reviewer rationale{" "}
          <span className="text-xs text-slate-600">(required to deny, recorded in the audit)</span>
        </span>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={2}
          required={!denyEnabled}
          aria-required="true"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          {editing ? "Hide args editor" : "Edit args"}
        </button>
      </div>
      {editing ? (
        <div className="mt-2">
          <label className="block text-sm text-slate-900">
            <span className="font-medium">Proposed args (JSON)</span>
            <textarea
              value={argsText}
              onChange={(e) => {
                setArgsText(e.target.value);
                validateArgs();
              }}
              rows={6}
              aria-invalid={!argsValid}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            />
          </label>
          {!argsValid ? (
            <p role="alert" className="mt-1 text-xs text-red-800">
              Invalid JSON — fix before saving.
            </p>
          ) : null}
          <button
            type="button"
            disabled={!argsValid}
            onClick={() => {
              if (validateArgs()) {
                setEditedArgs(JSON.parse(argsText) as Record<string, unknown>);
                setAnnouncement("Edited arguments will be sent with approval.");
              }
            }}
            className="mt-1 rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
          >
            Save edited args
          </button>
          {editedArgs ? (
            <p className="mt-1 text-xs text-green-900">Edited args staged for approve.</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!approveEnabled}
          onClick={() => respond(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={!denyEnabled}
          onClick={() => respond(false)}
          title={denyEnabled ? undefined : "A rationale is required to deny"}
          className="rounded-lg border-2 border-brand bg-transparent px-4 py-2 text-sm font-medium text-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Deny
        </button>
      </div>
      <p aria-live="assertive" className="mt-2 text-sm font-medium text-slate-900">
        {announcement}
      </p>
    </div>
  );
}

export function ApprovalCard() {
  const { agent, isReady } = useAgent({
    agentId: "reviewer",
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  const [toolCalls, setToolCalls] = useState<Record<string, ToolCallView>>({});
  // M3A freeze latch: once the reviewer's cancel is accepted, chip state stops tracking
  // the dying stream — a cancelled run may still flush trailing TOOL_CALL_* frames, and
  // letting them land would keep chips mutating (or leave "running" chips hanging, which
  // is the hung-spinner defect the spec forbids). Cleared when the NEXT run starts.
  // WHY the cancel comes from lib/cancelBus rather than a subscriber hook: the backend
  // emits a bare RUN_FINISHED on cancel (pydantic-ai _event_stream.py:231-238 has no
  // cancelled outcome), so no agent event can distinguish cancel from success here.
  const frozen = useRef(false);

  useEffect(() => subscribeRunCancelled(() => {
    frozen.current = true;
    setToolCalls((prev) => {
      const next: Record<string, ToolCallView> = {};
      for (const [id, t] of Object.entries(prev)) {
        next[id] = t.status === "running" ? { ...t, status: "stopped" } : t;
      }
      return next;
    });
  }), []);

  // TOOL_CALL_* → status chips (running → ok/failed), per @ag-ui/client AgentSubscriber
  // (web/node_modules/@ag-ui/client/dist/index.d.ts:220-233).
  useEffect(() => {
    if (!isReady) return;
    const sub = agent.subscribe({
      onRunStartedEvent: () => {
        frozen.current = false;
      },
      onToolCallStartEvent: ({ event }) => {
        if (frozen.current) return;
        setToolCalls((prev) => ({
          ...prev,
          [event.toolCallId]: { name: event.toolCallName, argsText: "", status: "running" },
        }));
      },
      onToolCallArgsEvent: ({ event }) => {
        if (frozen.current) return;
        setToolCalls((prev) => {
          const entry = prev[event.toolCallId];
          if (!entry) return prev;
          return {
            ...prev,
            [event.toolCallId]: { ...entry, argsText: entry.argsText + (event.delta ?? "") },
          };
        });
      },
      onToolCallResultEvent: ({ event }) => {
        if (frozen.current) return;
        setToolCalls((prev) => {
          const entry = prev[event.toolCallId];
          if (!entry) return prev;
          // Status MUST come from a structured marker, never free-text matching: the
          // propose_decision result content embeds the model's own clinical rationale,
          // which legitimately contains words like "conservative therapy has failed"
          // — a /fail/i content sniff rendered successful approvals as "failed".
          // agent.py prefixes genuine ToolFailed results with TOOL_FAILED: (the AG-UI
          // ToolCallResultEvent has no error field — content is the only channel).
          const failed = /^\s*TOOL_FAILED:/.test(String(event.content ?? ""));
          return { ...prev, [event.toolCallId]: { ...entry, status: failed ? "failed" : "ok" } };
        });
      },
    });
    return () => sub.unsubscribe();
  }, [agent, isReady]);

  const interruptElement = useInterrupt({
    renderInChat: false,
    render: ({ interrupt, resolve }) => {
      if (!interrupt) return <></>;
      const toolCallId = interrupt.toolCallId ?? interrupt.id.replace(/^int-/, "");
      const recorded = toolCalls[toolCallId];
      let proposed: ProposedArgs | null = null;
      try {
        proposed = recorded ? (JSON.parse(recorded.argsText) as ProposedArgs) : null;
      } catch {
        proposed = null;
      }
      return <DecisionCard interrupt={interrupt} proposed={proposed} resolve={resolve} />;
    },
  });

  // M5 mobile bottom sheet: below lg, a pending interrupt pins the card to the viewport
  // bottom (sheet semantics); at lg+ the wrapper is byte-identical to before (in the rail).
  const interruptActive = agent.pendingInterrupts.length > 0;

  return (
    <section
      aria-label="Approval and tool activity"
      className={`rounded-lg border border-slate-300 bg-white p-4 shadow-sm ${
        interruptActive
          ? "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:rounded-none max-lg:border-t-2 max-lg:border-amber-500 max-lg:shadow-2xl"
          : ""
      }`}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Tool activity
      </h2>
      {/* WHY per-call rows are preserved (not merged): the toolCallId-keyed map is a
          trace-isomorphic record of every real tool call against the server history, so
          retry attempts stay individually auditable. Grouping consecutive same-name calls
          below is purely cosmetic (derived at render via groupConsecutiveAttempts); the
          state map and every resume/approval code path are untouched. */}
      <ul className="mt-2 flex flex-wrap gap-2">
        {groupConsecutiveAttempts(
          Object.entries(toolCalls).map(([id, t]) => ({ id, name: t.name, status: t.status })),
        ).flatMap((group) =>
          group.attempts.length === 1 ? (
            <li
              key={group.attempts[0].id}
              className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-800"
            >
              <span className="font-mono font-semibold">{group.attempts[0].name}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS_CHIP[group.attempts[0].status]}`}
              >
                {group.attempts[0].status}
              </span>
            </li>
          ) : (
            <li
              key={`group-${group.attempts[0].id}`}
              className="flex flex-col gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-800"
            >
              <span className="font-semibold">
                <span className="font-mono">{group.name}</span>
                <span className="ml-1 font-normal text-slate-600">
                  ({group.attempts.length} attempts)
                </span>
              </span>
              <ul className="flex flex-col gap-0.5">
                {group.attempts.map((attempt, i) => (
                  <li key={attempt.id} className="flex items-center gap-1.5">
                    <span className="text-slate-600">attempt {i + 1} ·</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS_CHIP[attempt.status]}`}
                    >
                      {attempt.status}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ),
        )}
        {Object.keys(toolCalls).length === 0 ? (
          <li className="text-xs text-slate-500">No tool calls yet this run.</li>
        ) : null}
      </ul>
      <div className="mt-4">
        {agent.pendingInterrupts.length === 0 ? (
          <p className="text-sm text-slate-500">No pending approval.</p>
        ) : (
          interruptElement
        )}
      </div>
    </section>
  );
}
