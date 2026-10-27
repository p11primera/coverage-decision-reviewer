import { describe, expect, it, vi } from "vitest";

import { publishReviewReset, subscribeReviewReset } from "@/lib/reviewResetBus";

// The bus is the instant-clear channel for "New review": RequestForm publishes, the
// progress/chip islands subscribe. Contract is plain pub/sub with unsubscribe.
describe("reviewResetBus", () => {
  it("delivers publish to every listener", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unA = subscribeReviewReset(a);
    const unB = subscribeReviewReset(b);
    publishReviewReset();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unA();
    unB();
  });

  it("stops delivering after unsubscribe", () => {
    const fn = vi.fn();
    const un = subscribeReviewReset(fn);
    un();
    publishReviewReset();
    expect(fn).not.toHaveBeenCalled();
  });

  it("survives a listener that unsubscribes during publish (snapshot iteration)", () => {
    const second = vi.fn();
    const unSecond = subscribeReviewReset(() => {});
    const unSelf = subscribeReviewReset(() => unSecond());
    subscribeReviewReset(second);
    expect(() => publishReviewReset()).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1); // snapshot taken before unSubscribes ran
    unSelf();
    unSecond();
  });
});
