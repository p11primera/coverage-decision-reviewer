// M3A cancel BFF route: the browser's only door to FastAPI's POST /cancel/{thread_id}.
// Same BFF rules as /api/copilotkit: no direct browser→FastAPI calls, HMAC session cookie
// verified server-side with the exact lib/auth.ts helper the agent route uses (401 JSON
// otherwise), and the AGENT_URL secret never reaches the client. Nodejs runtime (Node
// crypto + portable AKS containers — same rationale as app/api/copilotkit/[...path]).
//
// Semantics of the backend endpoint are untouched: {status:"cancelled"} 200 when a live
// CancellationToken is registered for the thread, {status:"not_found"} 404 when not (e.g.
// the run already finished or interrupted — on_complete/on_cancelled pop the token). We
// forward the upstream status code AND JSON body verbatim so the UI can tell the two apart.

import { reviewerFromCookieHeader } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side only (see copilotkit route): AGENT_URL points at .../agent; the cancel
// endpoint is a sibling on the same origin, so derive the origin instead of a second env.
const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8100/agent";

// threadIds are UUIDs minted client-side; anything else is a probe or a malformed agent
// instance — refuse before touching the URL builder (no path traversal into the proxy).
const THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<Response> {
  const reviewer = reviewerFromCookieHeader(_request.headers.get("cookie"));
  if (!reviewer) {
    return Response.json(
      { error: "unauthorized", message: "Missing or invalid reviewer session cookie — sign in at /login" },
      { status: 401 },
    );
  }

  const { threadId } = await params;
  if (!THREAD_ID_PATTERN.test(threadId)) {
    return Response.json({ error: "bad_request", message: "Invalid thread id" }, { status: 400 });
  }

  let cancelUrl: URL;
  try {
    cancelUrl = new URL(AGENT_URL);
  } catch {
    return Response.json({ error: "bad_config", message: "AGENT_URL is not a valid URL" }, { status: 500 });
  }
  cancelUrl.pathname = `${cancelUrl.pathname.replace(/\/+$/, "").replace(/\/agent$/, "")}/cancel/${threadId}`;

  let upstream: Response;
  try {
    // Identity is NOT forwarded here: the cancel endpoint records the audit row with
    // actor='system' (M0 semantics, deliberately unchanged); the cookie check above is
    // purely the authorization gate for who may cancel.
    upstream = await fetch(cancelUrl, { method: "POST", cache: "no-store" });
  } catch (err) {
    // Backend unreachable — surface as a clear 502 rather than an opaque route crash.
    return Response.json(
      { error: "upstream_unreachable", message: `Agent backend unreachable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const body = await upstream.text();
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Cache-Control", "no-store");
  return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers });
}
