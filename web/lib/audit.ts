// Read-only audit reader for the /audit Server Component. Driver choice: node:sqlite
// (built into the Node 26 runtime the container already ships) — zero new npm deps,
// synchronous reads are fine for a small append-only table inside a server component, and
// readOnly:true guarantees the web tier can never mutate the backend's database.

import { DatabaseSync } from "node:sqlite";
import path from "node:path";

export interface AuditRow {
  id: number;
  thread_id: string;
  at: string;
  actor: string;
  action: string;
  decision: string | null;
  rationale: string | null;
  tool_call_id: string | null;
  agent_recommendation: string | null;
}

function dbPath(): string {
  return path.resolve(process.cwd(), process.env.AUDIT_DB_PATH ?? "../data/reviewer.db");
}

interface ProposedDecision {
  decision?: string;
}

/**
 * The agent's recommendation is not duplicated into the audit table (M0 owns that schema
 * and we must not touch backend behavior); it is recovered read-only from the persisted
 * ModelMessages history: the args of the propose_decision tool call for the thread.
 */
function latestRecommendation(db: DatabaseSync, threadId: string): string | null {
  const rows = db
    .prepare('SELECT message_json FROM history WHERE thread_id = ? ORDER BY seq DESC')
    .all(threadId) as Array<{ message_json: string }>;
  for (const row of rows) {
    let messages: unknown;
    try {
      messages = JSON.parse(row.message_json);
    } catch {
      continue;
    }
    const list = Array.isArray(messages) ? messages : [messages];
    for (const message of list) {
      const parts = (message as { parts?: unknown[] })?.parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        const p = part as { tool_name?: string; args?: string | Record<string, unknown> };
        if (p.tool_name === "propose_decision" && p.args !== undefined) {
          try {
            const args = (typeof p.args === "string"
              ? (JSON.parse(p.args) as ProposedDecision)
              : (p.args as ProposedDecision));
            if (args.decision) return args.decision;
          } catch {
            /* skip malformed */
          }
        }
      }
    }
  }
  return null;
}

export function readAuditRows(limit = 200): AuditRow[] {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath(), { readOnly: true });
  } catch {
    return [];
  }
  try {
    const rows = db
      .prepare(
        `SELECT id, thread_id, at, actor, action, decision, rationale, tool_call_id
         FROM audit ORDER BY id DESC LIMIT ?`,
      )
      .all(limit) as Array<Omit<AuditRow, "agent_recommendation">>;
    const recommendationCache = new Map<string, string | null>();
    return rows.map((row) => {
      // The decision_* rows carry the reviewer's decision; the agent's own recommendation
      // comes from the propose_decision tool call persisted in the message history.
      let agentRecommendation: string | null = null;
      if (row.decision || row.action === "decision_proposed") {
        if (!recommendationCache.has(row.thread_id)) {
          recommendationCache.set(row.thread_id, latestRecommendation(db, row.thread_id));
        }
        agentRecommendation = recommendationCache.get(row.thread_id) ?? null;
      }
      return { ...row, agent_recommendation: agentRecommendation };
    });
  } finally {
    db.close();
  }
}
