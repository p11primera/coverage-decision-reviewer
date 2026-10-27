// Server Component shell (route page): auth gate + static layout only. Every interactive
// piece is its own "use client" island in web/components — see each file's header comment
// for why its boundary sits there. The shell renders on the server per request: no JS
// unless an island hydrates.

import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ApprovalCard } from "@/components/ApprovalCard";
import { AuditDrawer } from "@/components/AuditDrawer";
import { ProgressBar } from "@/components/ProgressBar";
import { RequestForm } from "@/components/RequestForm";
import { ReviewerProvider } from "@/components/ReviewerProvider";
import { ReviewStream } from "@/components/ReviewStream";
import { StatePanel } from "@/components/StatePanel";
import { reviewerFromCookieHeader } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReviewerPage() {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const reviewer = reviewerFromCookieHeader(cookieHeader);
  if (!reviewer) redirect("/login");

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="flex items-baseline justify-between border-b border-slate-300 pb-3">
        <h1 className="text-xl font-bold text-slate-900">Coverage Decision Reviewer</h1>
        <nav className="flex items-center gap-4 text-sm" aria-label="Primary">
          <span className="text-slate-700">
            Signed in as <span className="font-semibold">{reviewer}</span>
          </span>
          {/* M1.1: the drawer (client island) replaces the old <Link href="/audit"> — a page
              navigation here used to unmount every island below and kill the live agent
              instance. /audit remains reachable as a server-rendered deep link by URL. */}
          <AuditDrawer />
          <Link
            href="/login?switch=1"
            className="text-blue-800 underline hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
          >
            Switch reviewer
          </Link>
        </nav>
      </header>
      {/* One CopilotKit provider for the whole island set: all islands share the same
          browser-side agent instance (same agentId) so the stream/state/progress/approval
          views stay coherent during a run. */}
      <ReviewerProvider>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <RequestForm reviewer={reviewer} />
            <ReviewStream reviewer={reviewer} />
            <ApprovalCard />
          </div>
          <div className="space-y-4">
            <ProgressBar />
            <StatePanel />
          </div>
        </div>
      </ReviewerProvider>
    </main>
  );
}
