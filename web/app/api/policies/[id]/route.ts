// Policy detail for citation chips in the streamed narrative. Served by the BFF from the
// repo's own fixture JSON (backend/app/fixtures/policies.json) — the browser still never
// talks to FastAPI; this is a plain Next server route reading local data.

import { NextRequest, NextResponse } from "next/server";

import { readFileSync } from "node:fs";
import path from "node:path";

import { reviewerFromCookieHeader } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Policy {
  id: string;
  title: string;
  body: string;
  applies_to: string[];
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!reviewerFromCookieHeader(_request.headers.get("cookie"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!/^POL-\d+$/.test(id)) {
    return NextResponse.json({ error: "invalid policy id" }, { status: 400 });
  }
  const fixtures = path.resolve(process.cwd(), "..", "backend", "app", "fixtures", "policies.json");
  let policies: Policy[];
  try {
    policies = JSON.parse(readFileSync(fixtures, "utf8")) as Policy[];
  } catch {
    return NextResponse.json({ error: "policy corpus unavailable" }, { status: 500 });
  }
  const policy = policies.find((p) => p.id === id);
  if (!policy) return NextResponse.json({ error: `unknown policy ${id}` }, { status: 404 });
  return NextResponse.json(policy);
}
