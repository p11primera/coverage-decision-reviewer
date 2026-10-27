import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApprovalCard } from "@/components/ApprovalCard";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(async () => ({})),
  interrupt: {
    id: "int-call-1",
    toolCallId: "call-1",
    reason: "tool_call",
    message: "Approve propose_decision(...)?",
  } as unknown,
  subscribe: vi.fn(() => ({ unsubscribe: () => undefined })),
  pending: [{ id: "int-call-1" }] as unknown[],
}));

// Thin mocks of the CopilotKit v2 headless surface: ApprovalCard only needs one shared
// agent instance (tool-chip subscription is a no-op here — chip logic is covered by
// toolActivityGroups.test.ts) and useInterrupt wired to invoke the component's render
// callback with a fixed interrupt + a resolve spy (the actual payload contract under test).
vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: {
    OnRunStatusChanged: "OnRunStatusChanged",
    OnStateChanged: "OnStateChanged",
    OnMessagesChanged: "OnMessagesChanged",
  },
  useAgent: () => ({
    agent: { subscribe: mocks.subscribe, pendingInterrupts: mocks.pending },
    isReady: true,
  }),
  useInterrupt: (opts: {
    render: (args: { interrupt: unknown; resolve: unknown }) => ReactElement;
  }) => opts.render({ interrupt: mocks.interrupt, resolve: mocks.resolve }),
}));

vi.mock("@/lib/cancelBus", () => ({
  subscribeRunCancelled: () => () => undefined,
}));

function rationaleBox() {
  return screen.getByRole("textbox", { name: /Reviewer rationale/i });
}

beforeEach(() => {
  mocks.resolve.mockClear();
});

describe("ApprovalCard (interrupt card)", () => {
  it("renders the card region with accessible labels", () => {
    render(<ApprovalCard />);
    expect(screen.getByRole("region", { name: "Approval and tool activity" })).toBeInTheDocument();
    expect(rationaleBox()).toBeInTheDocument();
    expect(rationaleBox()).toHaveAttribute("aria-required", "true");
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("keeps Deny disabled until a non-empty rationale is typed (whitespace does not count)", async () => {
    const user = userEvent.setup();
    render(<ApprovalCard />);
    const deny = screen.getByRole("button", { name: "Deny" });
    expect(deny).toBeDisabled();
    expect(deny).toHaveAttribute("title", "A rationale is required to deny");

    await user.type(rationaleBox(), "   ");
    expect(deny).toBeDisabled();

    await user.type(rationaleBox(), "Records missing per POL-102");
    expect(deny).toBeEnabled();
  });

  it("approves with payload {approved:true} and preserves the interrupt id", async () => {
    const user = userEvent.setup();
    render(<ApprovalCard />);
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(1));
    const [payload, interruptId] = mocks.resolve.mock.calls[0];
    expect(payload).toMatchObject({ approved: true });
    expect(interruptId).toBe("int-call-1");
  });

  it("includes editedArgs in the approve payload when edited args were saved as valid JSON", async () => {
    const user = userEvent.setup();
    render(<ApprovalCard />);
    await user.click(screen.getByRole("button", { name: "Edit args" }));
    const argsBox = screen.getByRole("textbox", { name: /Proposed args \(JSON\)/i });
    // Controlled textarea: set the value through a native change event (JSON braces
    // would also collide with userEvent's key-descriptor syntax).
    fireEvent.change(argsBox, { target: { value: '{"decision": "deny", "rationale": "edited"}' } });
    await user.click(screen.getByRole("button", { name: "Save edited args" }));
    expect(screen.getByText("Edited args staged for approve.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(1));
    const [payload] = mocks.resolve.mock.calls[0];
    expect(payload).toMatchObject({
      approved: true,
      editedArgs: { decision: "deny", rationale: "edited" },
    });
  });

  it("does not save invalid JSON (save button disabled + role=alert)", async () => {
    const user = userEvent.setup();
    render(<ApprovalCard />);
    await user.click(screen.getByRole("button", { name: "Edit args" }));
    const argsBox = screen.getByRole("textbox", { name: /Proposed args \(JSON\)/i });
    // Two change events: the component validates the just-committed argsText on the
    // NEXT change (onChange parses state, not the event value), mirroring real typing.
    fireEvent.change(argsBox, { target: { value: "{not " } });
    fireEvent.change(argsBox, { target: { value: "{not json" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/Invalid JSON/);
    expect(argsBox).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save edited args" })).toBeDisabled();
  });

  it("denies with payload {approved:false, reason:<rationale>}", async () => {
    const user = userEvent.setup();
    render(<ApprovalCard />);
    await user.type(rationaleBox(), "Insufficient documentation for CPT 72148");
    await user.click(screen.getByRole("button", { name: "Deny" }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(1));
    const [payload] = mocks.resolve.mock.calls[0];
    expect(payload).toMatchObject({
      approved: false,
      reason: "Insufficient documentation for CPT 72148",
    });
  });

  it("announces the outcome via an aria-live region after approving", async () => {
    const user = userEvent.setup();
    render(<ApprovalCard />);
    await user.click(screen.getByRole("button", { name: "Approve" }));
    const live = document.querySelector('[aria-live="assertive"]');
    expect(live).not.toBeNull();
    await waitFor(() =>
      expect(live).toHaveTextContent(/approved/i),
    );
  });
});
