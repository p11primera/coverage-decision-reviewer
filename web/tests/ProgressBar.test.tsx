import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";

import { ProgressBar } from "@/components/ProgressBar";

interface SubscriberLike {
  onRunStartedEvent?: () => void;
  onCustomEvent?: (args: { event: { name: string; value?: unknown } }) => void;
}

const mocks = vi.hoisted(() => ({
  subscribers: [] as unknown[],
  subscribe: vi.fn((sub: unknown) => {
    mocks.subscribers.push(sub);
    return { unsubscribe: () => undefined };
  }),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: { OnRunStatusChanged: "OnRunStatusChanged" },
  useAgent: () => ({ agent: { subscribe: mocks.subscribe }, isReady: true }),
}));

vi.mock("@/lib/cancelBus", () => ({
  subscribeRunCancelled: () => () => undefined,
}));

function lastSubscriber(): SubscriberLike {
  const sub = mocks.subscribers[mocks.subscribers.length - 1];
  if (!sub) throw new Error("component did not subscribe to the agent");
  return sub as SubscriberLike;
}

function bar() {
  // The bar div itself carries no accessible name; scope through the labelled region.
  return within(screen.getByRole("region", { name: "Claim checks progress" })).getByRole(
    "progressbar",
  );
}

beforeEach(() => {
  mocks.subscribers.length = 0;
  mocks.subscribe.mockClear();
});

describe("ProgressBar (CUSTOM review_progress events)", () => {
  it("handles a missing initial state gracefully (delta-before-snapshot guard)", () => {
    render(<ProgressBar />);
    // No CUSTOM event ever received: must render an idle bar, not crash.
    expect(bar()).toHaveAttribute("aria-valuenow", "0");
    expect(bar()).toHaveAttribute("aria-valuetext", "idle");
    expect(screen.getByText(/Waiting for the check sweep to start\./i)).toBeInTheDocument();
  });

  it("renders CUSTOM review_progress events (checked/total/check)", () => {
    render(<ProgressBar />);
    act(() => {
      lastSubscriber().onCustomEvent?.({
        event: {
          name: "review_progress",
          value: { checked: 3, total: 4, check: "coding validity" },
        },
      });
    });
    expect(bar()).toHaveAttribute("aria-valuenow", "3");
    expect(bar()).toHaveAttribute("aria-valuemax", "4");
    expect(bar()).toHaveAttribute("aria-valuetext", "3 of 4: coding validity");
    expect(screen.getByText(/Checked 3\/4 — coding validity/)).toBeInTheDocument();
  });

  it("ignores CUSTOM events with other names", () => {
    render(<ProgressBar />);
    act(() => {
      lastSubscriber().onCustomEvent?.({
        event: { name: "something_else", value: { checked: 9, total: 9 } },
      });
    });
    expect(bar()).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText(/Waiting for the check sweep to start\./i)).toBeInTheDocument();
  });

  it("resets to idle on the next run start", () => {
    render(<ProgressBar />);
    act(() => {
      lastSubscriber().onCustomEvent?.({
        event: { name: "review_progress", value: { checked: 1, total: 4, check: "a" } },
      });
    });
    expect(bar()).toHaveAttribute("aria-valuenow", "1");
    act(() => {
      lastSubscriber().onRunStartedEvent?.();
    });
    expect(bar()).toHaveAttribute("aria-valuenow", "0");
    expect(bar()).toHaveAttribute("aria-valuetext", "idle");
  });
});
