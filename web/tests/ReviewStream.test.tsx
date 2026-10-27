import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReviewStream } from "@/components/ReviewStream";

// The narrative is genuine LLM output (TEXT_MESSAGE_CONTENT deltas from the model) and
// the model emits markdown: it must RENDER as markdown (**bold** -> <strong>, lists ->
// <ul>), not print raw syntax — while [POL-###] tokens still become CitationChip buttons.
vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: {
    OnRunStatusChanged: "OnRunStatusChanged",
    OnStateChanged: "OnStateChanged",
    OnMessagesChanged: "OnMessagesChanged",
  },
  useAgent: () => ({
    agent: {
      messages: [
        {
          role: "assistant",
          content:
            "The patient has **red flags** consistent with cauda equina syndrome.\n\n- MRI is medically necessary per [POL-102]\n- Conservative therapy was exhausted\n\nRecommendation: approve imaging.",
        },
      ],
      isRunning: false,
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
    isReady: true,
  }),
  useCopilotKit: () => ({ copilotkit: {} }),
}));

vi.mock("@/lib/draftStore", () => ({
  loadDraft: () => null,
}));

describe("ReviewStream markdown rendering", () => {
  it("renders emphasis and lists as HTML, not raw markdown syntax", () => {
    render(<ReviewStream reviewer="Dr. Test" />);
    const strong = screen.getByText("red flags");
    expect(strong.tagName).toBe("STRONG");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^- MRI/)).not.toBeInTheDocument();
  });

  it("keeps [POL-102] citations as interactive chip buttons", () => {
    render(<ReviewStream reviewer="Dr. Test" />);
    const chip = screen.getByRole("button", { name: "POL-102" });
    expect(chip).toBeInTheDocument();
  });
});
