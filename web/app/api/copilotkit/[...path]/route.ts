// The BFF: the browser's only door to the agent. CopilotKit's client provider posts here
// (/api/copilotkit/agent/<id>/run); we verify the HMAC session cookie, attach the reviewer
// identity SERVER-SIDE (X-Reviewer-Id on the runtime's HttpAgent), and pipe FastAPI's SSE
// back unbuffered. The FastAPI URL and SESSION_SECRET never reach the browser.
//
// Nodejs runtime (NOT edge): @copilotkit/runtime and node:crypto are Node libraries, and
// the target deployment is portable containers on AKS — no Vercel-specific features.

import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  type AgentsConfig,
} from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";

import { reviewerFromCookieHeader } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side only: exists in .env.local / container env, never NEXT_PUBLIC_*.
const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8100/agent";

// Per-request agent factory: identity is resolved from the verified cookie on the
// INBOUND request, so X-Reviewer-Id can never be spoofed by the browser.
// The cast papers over a packaging wart, not an API guess: @ag-ui/client ships BOTH
// dist/index.d.ts and dist/index.d.mts, and TS treats the same class declared in both
// (nominal private `_debug`) as two unrelated types across the @copilotkit/runtime dts
// boundary. Runtime shape is exactly the AgentsFactory the docs describe
// (web/node_modules/@copilotkit/runtime/dist/v2/runtime/core/runtime.d.mts:58-73).
const agents = (({ request }: { request: Request }) => {
  const reviewerId = reviewerFromCookieHeader(request.headers.get("cookie")) ?? "reviewer";
  return {
    reviewer: new HttpAgent({
      url: AGENT_URL,
      headers: { "X-Reviewer-Id": reviewerId },
    }),
  };
}) as unknown as AgentsConfig;

const copilotHandler = createCopilotRuntimeHandler({
  runtime: new CopilotRuntime({ agents }),
  basePath: "/api/copilotkit",
  mode: "multi-route", // POST /api/copilotkit/agent/:agentId/run, GET /api/copilotkit/info
});

async function handle(request: Request): Promise<Response> {
  const reviewer = reviewerFromCookieHeader(request.headers.get("cookie"));
  if (!reviewer) {
    return Response.json(
      { error: "unauthorized", message: "Missing or invalid reviewer session cookie — sign in at /login" },
      { status: 401 },
    );
  }

  let upstream = request;
  if (request.method === "POST" && new URL(request.url).pathname.endsWith("/run")) {
    const body = await request.json();
    // Server owns history (M0 design): the backend replays persisted ModelMessages from
    // SQLite keyed by threadId, so the client thread is payload waste and double-counts
    // input messages. Mirror the scripted-run contract: resume → [], initial → last user turn.
    if (Array.isArray(body?.resume) && body.resume.length > 0) {
      body.messages = [];
    } else if (Array.isArray(body?.messages)) {
      body.messages = body.messages.filter((m: { role?: string }) => m?.role === "user").slice(-1);
    }
    upstream = new Request(request, { body: JSON.stringify(body) });
  }

  const response = await copilotHandler(upstream);

  // Unbuffered SSE through ingress/proxies (X-Accel-Buffering is honoured by nginx-style
  // proxies; no-transform stops intermediate caches from coalescing chunks).
  const headers = new Headers(response.headers);
  headers.set("X-Accel-Buffering", "no");
  headers.set("Cache-Control", "no-cache, no-transform");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
