// Server-side session-cookie helpers for the BFF (dev-mode fake login, see SPEC-M1).
// This module uses node:crypto and is imported ONLY from route handlers and server
// components — never from "use client" code. The HMAC secret (SESSION_SECRET) and the
// signing logic must stay server-side: the cookie value is unforgeable only while the
// secret stays here.

import crypto from "node:crypto";

export const REVIEWER_COOKIE = "reviewer";

// Reviewer names land in a cookie value and in the SQLite audit `actor` column: keep the
// charset boring (no commas, semicolons, whitespace-pairs or dots before the signature).
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/;

export function isValidReviewerName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

function secret(): string {
  return process.env.SESSION_SECRET ?? "dev-insecure-session-secret";
}

function signature(name: string): string {
  return crypto.createHmac("sha256", secret()).update(name).digest("hex");
}

/** Cookie value format: `<name>.<hmac-sig>` (see SPEC-M1 §BFF). */
export function reviewerCookieValue(name: string): string {
  return `${name}.${signature(name)}`;
}

/** Returns the reviewer name when the cookie value's HMAC checks out, else null. */
export function verifyReviewerCookieValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const sep = value.lastIndexOf(".");
  if (sep <= 0) return null;
  const name = value.slice(0, sep);
  const sig = value.slice(sep + 1);
  if (!isValidReviewerName(name)) return null;
  const expected = Buffer.from(signature(name));
  const candidate = Buffer.from(sig);
  if (expected.length !== candidate.length || !crypto.timingSafeEqual(expected, candidate)) {
    return null;
  }
  return name;
}

/** Extract + verify the reviewer cookie from a raw `Cookie` request header. */
export function reviewerFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== REVIEWER_COOKIE) continue;
    return verifyReviewerCookieValue(decodeURIComponent(part.slice(eq + 1).trim()));
  }
  return null;
}
