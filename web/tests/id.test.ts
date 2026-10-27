import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { newId } from "@/lib/id";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const cryptoObj = globalThis.crypto;
const cleanup: Array<() => void> = [];

function redefine(target: object, key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  cleanup.push(() => {
    if (desc) Object.defineProperty(target, key, desc);
    else delete (target as Record<string, unknown>)[key];
  });
}

afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

describe("lib/id newId()", () => {
  it("uses crypto.randomUUID when available (secure contexts)", () => {
    const fixed = "6f1a2b3c-4d5e-4f60-8123-456789abcdef";
    redefine(cryptoObj, "randomUUID", () => fixed);
    expect(newId()).toBe(fixed);
  });

  it("falls back to getRandomValues when randomUUID is absent (LAN-IP non-secure context)", () => {
    // This is the exact regression the M1 LAN-IP bug taught: crypto.randomUUID is
    // undefined on http://<lan-ip>:3000 and the submit handler crashed. Force the
    // fallback path by deleting the method from the object.
    redefine(cryptoObj, "randomUUID", undefined);
    if (typeof cryptoObj.getRandomValues !== "function") {
      redefine(cryptoObj, "getRandomValues", (a: Uint8Array) =>
        webcrypto.getRandomValues(a),
      );
    }
    const id = newId();
    expect(id).toMatch(V4); // v4 shape: version nibble 4, variant 10xx
    expect(newId()).not.toBe(id); // two draws differ (randomness sanity)
  });
});
