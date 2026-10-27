import { describe, expect, it } from "vitest";

import {
  reviewerCookieValue,
  reviewerFromCookieHeader,
  isValidReviewerName,
  verifyReviewerCookieValue,
} from "@/lib/auth";

describe("lib/auth reviewer cookie (HMAC)", () => {
  it("sign/verify roundtrip", () => {
    const value = reviewerCookieValue("E2E Bot");
    expect(value.startsWith("E2E Bot.")).toBe(true);
    expect(verifyReviewerCookieValue(value)).toBe("E2E Bot");
  });

  it("roundtrips names containing dots (signature split is lastIndexOf)", () => {
    const value = reviewerCookieValue("Dr. Dana Reviewer");
    expect(verifyReviewerCookieValue(value)).toBe("Dr. Dana Reviewer");
  });

  it("rejects a tampered signature (one flipped hex char)", () => {
    const value = reviewerCookieValue("E2E Bot");
    const sep = value.lastIndexOf(".");
    const sig = value.slice(sep + 1);
    const flipped = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyReviewerCookieValue(`${value.slice(0, sep + 1)}${flipped}`)).toBeNull();
  });

  it("rejects a tampered name keeping the original signature", () => {
    const value = reviewerCookieValue("E2E Bot");
    expect(verifyReviewerCookieValue(value.replace("E2E Bot", "Mallory"))).toBeNull();
  });

  it("rejects malformed / empty values", () => {
    expect(verifyReviewerCookieValue(undefined)).toBeNull();
    expect(verifyReviewerCookieValue("")).toBeNull();
    expect(verifyReviewerCookieValue("no-dot-here")).toBeNull();
    expect(verifyReviewerCookieValue(".onlysig")).toBeNull();
  });

  it("rejects names outside the cookie-safe charset", () => {
    expect(isValidReviewerName("bad,name")).toBe(false);
    expect(isValidReviewerName("x".repeat(33))).toBe(false);
    expect(verifyReviewerCookieValue("bad,name.deadbeef")).toBeNull();
  });

  it("extracts the reviewer from a raw Cookie header", () => {
    const value = reviewerCookieValue("E2E Bot");
    expect(reviewerFromCookieHeader(`other=1; reviewer=${encodeURIComponent(value)}; x=2`)).toBe(
      "E2E Bot",
    );
    expect(reviewerFromCookieHeader("other=1")).toBeNull();
    expect(reviewerFromCookieHeader(null)).toBeNull();
  });
});
