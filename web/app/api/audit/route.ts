// WHY this route exists: the header "Audit trail" now opens an IN-PAGE drawer so the CopilotKit
// islands (and the live agent instance) are never unmounted by a page navigation. The drawer is
// a client component, so its rows must come over HTTP instead of a server render — this is the
// BFF door for that data. It mirrors /api/copilotkit's contract: verify the HMAC session cookie
// with lib/auth (401 JSON otherwise — audit rows carry who/when/decision, never public), then
// read data/reviewer.db READ-ONLY through the exact same lib/audit helper the /audit server page
// uses (one SQL path, zero duplication). nodejs runtime: lib/audit is node:sqlite, and the
// deployment target is portable containers on AKS — no edge, no Vercel-specific features.

import { readAuditRows } from "@/lib/audit";
import { reviewerFromCookieHeader } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const reviewer = reviewerFromCookieHeader(request.headers.get("cookie"));
  if (!reviewer) {
    return Response.json(
      {
        error: "unauthorized",
        message: "Missing or invalid reviewer session cookie — sign in at /login",
      },
      { status: 401 },
    );
  }
  return Response.json({ reviewer, rows: readAuditRows() });
}
