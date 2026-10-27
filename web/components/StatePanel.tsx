// WHY this is a client component: the panel renders STATE_SNAPSHOT/STATE_DELTA applied to
// the browser-side agent instance during a run; that state only exists in the browser
// until the run persists. WHY the boundary sits here: STATE_SNAPSHOT/STATE_DELTA is applied
// by @ag-ui/client (web/node_modules/@ag-ui/client/dist/index.d.ts:537 — AbstractAgent.state),
// which lives behind useAgent's React context, so only a client island can read it. The
// server shell renders the static frame; this island alone re-renders on state updates
// (UseAgentUpdate.OnStateChanged).

"use client";

import { UseAgentUpdate, useAgent } from "@copilotkit/react-core/v2";

interface RuleFinding {
  rule_id: string;
  cpt: string;
  criteria?: string;
  outcome_guidance?: string;
}

interface ReviewStateView {
  checked_count?: number;
  total_checks?: number;
  findings?: RuleFinding[];
  risk_score?: string | null;
  recommendation?: string | null;
  citations?: string[];
}

interface ReviewRequestView {
  patient_summary?: string;
  cpt?: string;
  notes?: string;
}

export function StatePanel() {
  const { agent } = useAgent({
    agentId: "reviewer",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnMessagesChanged],
  });
  const state = (agent.state ?? {}) as ReviewStateView;

  const request = [...agent.messages]
    .reverse()
    .find((m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith("{"))
    ?.content as string | undefined;
  let echo: ReviewRequestView | null = null;
  try {
    echo = request ? (JSON.parse(request) as ReviewRequestView) : null;
  } catch {
    echo = null;
  }

  return (
    <aside
      aria-label="Live reviewer state"
      aria-live="polite"
      className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Reviewer state
      </h2>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-800">
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">CPT</dt>
          <dd className="font-mono">{echo?.cpt ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Checks (done/total)</dt>
          <dd className="font-mono">
            {state.checked_count ?? 0}/{state.total_checks ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Risk score</dt>
          {/* M3B: an unavailable flaky scorer sets risk_score='unavailable' server-side;
              render that sentinel verbatim (not "—", which would misread as "no data yet"
              — the distinction reviewers must see, see README known limitations). */}
          <dd>{state.risk_score === "unavailable" ? "unavailable" : (state.risk_score ?? "—")}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Recommendation</dt>
          <dd className="font-semibold">{state.recommendation ?? "—"}</dd>
        </div>
      </dl>

      {echo?.patient_summary ? (
        <p className="mt-3 rounded bg-slate-100 p-2 text-xs text-slate-700">
          {echo.patient_summary}
        </p>
      ) : null}

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        Rule findings ({state.findings?.length ?? 0})
      </h3>
      <ul className="mt-1 space-y-1">
        {(state.findings ?? []).map((f) => (
          <li key={f.rule_id} className="text-xs text-slate-800">
            <span className="font-mono font-semibold">{f.rule_id}</span>{" "}
            <span className="text-slate-600">{f.outcome_guidance ?? f.criteria ?? ""}</span>
          </li>
        ))}
      </ul>

      {(state.citations?.length ?? 0) > 0 ? (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Cited policies
          </h3>
          <ul className="mt-1 flex flex-wrap gap-1">
            {(state.citations ?? []).map((c) => (
              <li
                key={c}
                className="rounded bg-purple-100 px-1.5 py-0.5 font-mono text-xs text-purple-900"
              >
                {c}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}
