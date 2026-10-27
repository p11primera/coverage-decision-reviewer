// Pure render-layer grouping for ApprovalCard's TOOL ACTIVITY list.
//
// WHY per-call rows are deliberate (this file does NOT change the data model): the
// toolCallId-keyed state map in ApprovalCard is a one-entry-per-real-tool-call trace,
// kept isomorphic with the server-side run history so every attempt a model made is
// visible and auditable. When a model retries a flaky tool (e.g. score_claim_risk
// fails then succeeds) that invariant surfaces N identical labels with different
// statuses and no signal they are attempts of ONE logical tool.
//
// This helper is purely COSMETIC: it derives consecutive same-name runs from the
// existing per-call state at render time so the UI can collapse them under a single
// "<name> (N attempts)" header with "attempt i · status" sub-rows. It never mutates
// map keys or merges state — grouping is computed from the already-recorded entries
// and is the sole source for the resume/approval code paths staying untouched.
//
// "Consecutive" = adjacent in call order; non-adjacent same-name calls (separated by
// a different tool) are NOT grouped across unrelated phases.

export type ToolCallStatus = "running" | "ok" | "failed";

export interface ToolCallView {
  name: string;
  argsText: string;
  status: ToolCallStatus;
}

// One entry as recorded in the toolCallId-keyed state, in call order.
export interface ToolCallEntry {
  id: string;
  name: string;
  status: ToolCallStatus;
}

// A maximal run of consecutive same-name tool calls.
export interface AttemptGroup {
  name: string;
  attempts: ToolCallEntry[];
}

export function groupConsecutiveAttempts(entries: ToolCallEntry[]): AttemptGroup[] {
  const groups: AttemptGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.name === entry.name) {
      last.attempts.push(entry);
    } else {
      groups.push({ name: entry.name, attempts: [entry] });
    }
  }
  return groups;
}
