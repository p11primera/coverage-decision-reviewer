/**
 * RFC-4122 v4 id generator that works in NON-secure contexts.
 *
 * WHY: crypto.randomUUID() exists only in secure contexts (https, localhost).
 * The demo scenario is a LAN-IP http:// URL on the interview laptop, where
 * randomUUID is undefined and the submit handler threw a TypeError before any
 * fetch — the classic "button does nothing" bug. crypto.getRandomValues IS
 * available in non-secure contexts, so it is the safe primitive here.
 * Production (AKS) terminates TLS upstream, but the fallback keeps any http
 * deployment working too.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
