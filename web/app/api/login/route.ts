// Dev-mode fake login endpoint (SPEC-M1 §BFF): POST {name} sets the signed reviewer
// session cookie. httpOnly + sameSite=lax so page JavaScript can never read or forge it;
// the signature (HMAC-SHA256, SESSION_SECRET) is computed server-side in lib/auth.ts.

import { NextRequest, NextResponse } from "next/server";

import { isValidReviewerName, REVIEWER_COOKIE, reviewerCookieValue } from "@/lib/auth";

export const runtime = "nodejs"; // nodejs (not edge): crypto.createHmac + portable containers on AKS

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = (body as { name?: unknown })?.name;
  if (typeof name !== "string" || !isValidReviewerName(name)) {
    return NextResponse.json(
      { error: "name must match ^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$" },
      { status: 400 },
    );
  }
  const response = NextResponse.json({ ok: true, name });
  response.cookies.set({
    name: REVIEWER_COOKIE,
    value: reviewerCookieValue(name),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
