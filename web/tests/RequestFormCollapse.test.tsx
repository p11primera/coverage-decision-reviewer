import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RequestForm } from "@/components/RequestForm";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(async () => undefined),
  addMessage: vi.fn(),
}));

// Thin mocks of the CopilotKit v2 headless surface (same shape the other component tests
// use): one shared agent, isReady=true so the submit guard is open, runAgent resolves
// immediately — enough to walk submit -> collapsed strip -> "New review" -> expanded form.
vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: {
    OnRunStatusChanged: "OnRunStatusChanged",
    OnStateChanged: "OnStateChanged",
    OnMessagesChanged: "OnMessagesChanged",
  },
  useAgent: () => ({
    agent: {
      messages: [],
      isRunning: false,
      pendingInterrupts: [],
      threadId: "thread-collapse-test",
      addMessage: mocks.addMessage,
      setMessages: () => undefined,
      setState: () => undefined,
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
    isReady: true,
  }),
  useCopilotKit: () => ({ copilotkit: { runAgent: mocks.runAgent } }),
}));

vi.mock("@/lib/draftStore", () => ({
  loadDraft: () => null,
  saveDraft: () => undefined,
}));

vi.mock("@/lib/cancelBus", () => ({ publishRunCancelled: () => undefined }));

beforeEach(() => {
  mocks.runAgent.mockClear();
  mocks.addMessage.mockClear();
});

describe("RequestForm collapse (M5)", () => {
  it("submit succeeds -> compact summary strip with CPT + 'New review' replaces the form", async () => {
    const user = userEvent.setup();
    render(<RequestForm reviewer="Dr. Collapse" />);
    expect(
      screen.getByRole("form", { name: "Prior authorization request" }),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("submit-button"));

    expect(mocks.runAgent).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("form", { name: "Prior authorization request" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New review" })).toBeInTheDocument();
    expect(screen.getByText(/72148/)).toBeInTheDocument(); // CPT code survives the collapse
    // Truncated patient summary on the strip (default text is far longer than ~60 chars).
    expect(screen.getByText(/^52-year-old male with 8 weeks/)).toBeInTheDocument();
  });

  it("'New review' expands an empty form with the original aria-label", async () => {
    const user = userEvent.setup();
    render(<RequestForm reviewer="Dr. Collapse" />);
    await user.click(screen.getByTestId("submit-button"));
    await user.click(screen.getByRole("button", { name: "New review" }));

    expect(
      screen.getByRole("form", { name: "Prior authorization request" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Patient summary/)).toHaveValue("");
    expect(screen.getByLabelText(/CPT/)).toHaveValue("");
    expect(screen.getByLabelText(/Clinical notes/)).toHaveValue("");
  });
});
