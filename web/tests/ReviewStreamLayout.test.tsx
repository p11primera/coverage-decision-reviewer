import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReviewStream } from "@/components/ReviewStream";

// M5 layout contract for the narrative viewport. NOTE (documented deliberately): jsdom has
// no layout engine — no scrollHeight, no vh/max-h resolution — so asserting the CLASSES on
// the narrative container IS the contract test here; the runtime height/overflow behaviour
// is what Playwright's golden path exercises in a real viewport.
const agent = vi.hoisted(() => ({
  messages: [] as { role: string; content: string }[],
  isRunning: false,
  subscribe: () => ({ unsubscribe: () => undefined }),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: {
    OnRunStatusChanged: "OnRunStatusChanged",
    OnStateChanged: "OnStateChanged",
    OnMessagesChanged: "OnMessagesChanged",
  },
  useAgent: () => ({ agent, isReady: true }),
  useCopilotKit: () => ({ copilotkit: { runAgent: async () => undefined } }),
}));

vi.mock("@/lib/draftStore", () => ({ loadDraft: () => null }));

beforeEach(() => {
  agent.messages = [];
  agent.isRunning = false;
});

describe("ReviewStream narrative viewport", () => {
  it("running + narrative: the container carries the fixed-height clamp classes", () => {
    agent.isRunning = true;
    agent.messages = [
      {
        role: "assistant",
        content:
          "Clinical narrative: MRI lumbar spine is **medically necessary** per [POL-102].",
      },
    ];
    render(<ReviewStream reviewer="Dr. Layout" />);
    const box = screen.getByRole("region", { name: "Review narrative" });
    const viewport = box.querySelector("[data-testid='narrative-viewport']") as HTMLElement;
    expect(viewport).not.toBeNull();
    for (const cls of ["h-[45vh]", "min-h-[300px]", "max-h-[620px]", "overflow-y-auto"]) {
      expect(viewport.classList.contains(cls)).toBe(true);
    }
    // Narrative still renders inside the clamped box (markdown path untouched).
    expect(viewport.querySelector("strong")).not.toBeNull();
  });

  it("running + empty: three decorative skeleton blocks and no 'Streaming…' text", () => {
    agent.isRunning = true;
    agent.messages = [];
    render(<ReviewStream reviewer="Dr. Layout" />);
    const box = screen.getByRole("region", { name: "Review narrative" });
    expect(box.textContent).not.toMatch(/Streaming/);
    const skeletons = Array.from(
      box.querySelectorAll<HTMLElement>("div[aria-hidden='true'].animate-pulse"),
    ).filter((d) => d.classList.contains("bg-slate-200") && d.classList.contains("rounded"));
    expect(skeletons).toHaveLength(3);
  });
});
