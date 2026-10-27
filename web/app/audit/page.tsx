// /audit — Server Component showcase: zero client JS. The table is rendered on the server
// straight from the append-only SQLite audit table (read-only via node:sqlite — see
// lib/audit.ts for the driver rationale). No "use client" anywhere in this tree: the page
// is static HTML per request, which is the point of the Server/Client split in this app.
//
// M1.1 drawer-vs-page split (Server/Client boundary decision): the header "Audit trail"
// control on / no longer navigates here — it opens the client-side AuditDrawer (components/
// AuditDrawer.tsx) whose rows come from the authenticated BFF route app/api/audit, because a
// full navigation unmounts every client island and with them the live CopilotKit agent
// instance (ReviewerProvider/ReviewStream/ApprovalCard/StatePanel/ProgressBar) mid-review.
// This page is kept EXACTLY as-is as the server-rendered, zero-JS, deep-linkable showcase —
// it is now reached only by direct URL (e.g. sharing a permalink or auditing from another
// tab), which is precisely where a fresh server render is the right tool and no client state
// exists to lose. The two surfaces share one read path (lib/audit.ts) so rows never diverge;
// the "Back to review" link stays for direct-URL visitors.

import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { readAuditRows } from "@/lib/audit";
import { reviewerFromCookieHeader } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // node:sqlite — Node runtime, portable-container target

export default async function AuditPage() {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!reviewerFromCookieHeader(cookieHeader)) redirect("/login");

  const rows = readAuditRows();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="flex items-baseline justify-between border-b border-slate-300 pb-3">
        <h1 className="text-xl font-bold text-slate-900">Audit trail</h1>
        <Link
          href="/"
          className="text-sm text-blue-800 underline hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          Back to review
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">No audit rows yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-slate-900">
            <caption className="sr-only">Append-only reviewer audit trail</caption>
            <thead>
              <tr className="border-b-2 border-slate-400 text-xs uppercase tracking-wide text-slate-600">
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
                <tr key={row.id} className="border-b border-slate-200 align-top">
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
    </main>
  );
}
