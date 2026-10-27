// Per-reviewer draft persistence (localStorage).
//
// WHY: a full page navigation unmounts every client island, including the browser-side agent
// singleton — the AG-UI threadId (a randomUUID minted in AbstractAgent's constructor,
// web/node_modules/@ag-ui/client/dist/index.d.ts:535 + `threadId ?? randomUUID()` in the
// constructor) dies with it and the remount starts a fresh, unrelated thread. Persisting the
// active threadId plus the in-progress form fields under a per-signed-in-reviewer key lets a
// remount re-adopt the SAME backend thread (the M0 backend owns history keyed by threadId)
// and hands the reviewer back their unsent text. Storage lives browser-side only: it is
// per-device convenience state, not an audit record — the durable truth stays in SQLite.

export interface ReviewDraft {
  threadId: string;
  patientSummary: string;
  cpt: string;
  notes: string;
}

function storageKey(reviewer: string): string {
  // Keyed by the server-verified reviewer name the page shell passes down, so switching
  // reviewers (separate sign-in) never leaks one reviewer's draft into another's form.
  return `coverage-reviewer:draft:${reviewer}`;
}

export function loadDraft(reviewer: string): ReviewDraft | null {
  if (typeof window === "undefined") return null; // SSR-safe: no window during server render
  try {
    const raw = window.localStorage.getItem(storageKey(reviewer));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<keyof ReviewDraft, unknown>>;
    if (
      typeof parsed?.threadId !== "string" ||
      typeof parsed.patientSummary !== "string" ||
      typeof parsed.cpt !== "string" ||
      typeof parsed.notes !== "string"
    ) {
      return null; // shape drift (older schema) → start clean rather than half-restore
    }
    return {
      threadId: parsed.threadId,
      patientSummary: parsed.patientSummary,
      cpt: parsed.cpt,
      notes: parsed.notes,
    };
  } catch {
    return null; // disabled/full/corrupt storage must never break the page
  }
}

export function saveDraft(reviewer: string, draft: ReviewDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(reviewer), JSON.stringify(draft));
  } catch {
    // Quota/private-mode failures are cosmetic here: worst case the next remount starts fresh.
  }
}
