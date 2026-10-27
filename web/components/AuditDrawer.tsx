// WHY this is a client component: it is a modal dialog — open/close state, a focus trap, Esc
// handling and a fetch of /api/audit all require browser APIs, and (the actual point of M1.1)
// it must open OVER the live review page so the CopilotKit islands and their browser-side agent
// instance are never unmounted the way a navigation to /audit used to do. WHY the boundary sits
// exactly here: page.tsx stays a Server Component shell and only this header trigger + overlay
// crosses into client land; the data still comes from the BFF (app/api/audit) rather than being
// imported server-side, because importing lib/audit here would drag node:sqlite into the client
// bundle — the Server/Client split is enforced by the fetch, not by a directive. The /audit page
// remains the zero-JS server-rendered deep link; this drawer is the same rows, same columns.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Type-only import: erased at compile time, so lib/audit's node:sqlite never reaches the
// browser bundle while the drawer's columns stay pinned to the server page's row shape.
import type { AuditRow } from "@/lib/audit";

export function AuditDrawer() {
  const [open, setOpen] = useState(false);
  // Slide-in flag: flip one frame AFTER mount so the CSS transform transition actually runs.
  const [shown, setShown] = useState(false);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit", { cache: "no-store" });
      if (!res.ok) throw new Error(`Audit request failed (HTTP ${res.status})`);
      const body = (await res.json()) as { rows: AuditRow[] };
      setRows(body.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    void load();
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open, load]);

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the trigger that opened the dialog (WAI-ARIA dialog pattern).
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      // Focus trap: cycle Tab/Shift+Tab among the focusables inside the panel (the panel
      // itself is tabindex=-1, so it is excluded from the list by the selector).
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus(); // move focus into the dialog when it opens
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-white underline hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        Audit trail
      </button>
      {open ? (
        <div className="fixed inset-0 z-50">
          {/* Dimmed backdrop; click dismisses. Decorative — the dialog carries the semantics. */}
          <div
            className="absolute inset-0 bg-slate-900/60"
            aria-hidden="true"
            onClick={close}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-drawer-title"
            tabIndex={-1}
            className={`absolute inset-y-0 right-0 flex w-full max-w-3xl transform flex-col bg-white shadow-xl transition-transform duration-200 ease-out focus:outline-none ${
              shown ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <header className="flex items-baseline justify-between bg-navy p-6 pb-3 text-white">
              <h2 id="audit-drawer-title" className="text-lg font-bold text-white">
                Audit trail
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close audit trail"
                className="rounded px-2 py-1 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                Close ✕
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-6 pt-4">
              {loading ? (
                <p role="status" className="text-sm text-slate-600">
                  Loading audit trail…
                </p>
              ) : error ? (
                <div
                  role="alert"
                  className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
                >
                  <p className="font-semibold">Could not load the audit trail</p>
                  <p className="mt-1">{error}</p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-2 rounded bg-red-800 px-3 py-1.5 font-semibold text-white hover:bg-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                  >
                    Retry
                  </button>
                </div>
              ) : rows === null || rows.length === 0 ? (
                <p className="text-sm text-slate-600">No audit rows yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm text-slate-900">
                    <caption className="sr-only">Append-only reviewer audit trail</caption>
                    <thead>
                      <tr className="bg-navy text-xs uppercase tracking-wide text-white">
                        <th scope="col" className="p-2">When (UTC)</th>
                        <th scope="col" className="p-2">Who (actor)</th>
                        <th scope="col" className="p-2">Action</th>
                        <th scope="col" className="p-2">Decision</th>
                        <th scope="col" className="p-2">Rationale</th>
                        <th scope="col" className="p-2">Tool call id</th>
                        <th scope="col" className="p-2">Agent recommendation</th>
                        <th scope="col" className="p-2">Thread</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-200 bg-white align-top odd:bg-slate-50">
                          <td className="whitespace-nowrap p-2 font-mono text-xs">{row.at}</td>
                          <td className="p-2 font-semibold">{row.actor}</td>
                          <td className="p-2">{row.action}</td>
                          <td className="p-2">{row.decision ?? "—"}</td>
                          <td className="max-w-80 p-2 text-xs">{row.rationale ?? "—"}</td>
                          <td className="p-2 font-mono text-xs">{row.tool_call_id ?? "—"}</td>
                          <td className="p-2">{row.agent_recommendation ?? "—"}</td>
                          <td className="p-2 font-mono text-xs">{row.thread_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
