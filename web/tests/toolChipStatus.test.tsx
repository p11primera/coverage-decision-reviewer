import "@testing-library/jest-dom/vitest";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { ApprovalCard } from "@/components/ApprovalCard";

// Regression tests for the tool-chip status mapping. BUG: the old implementation
// sniffed TOOL_CALL_RESULT content with /timed out|error|fail/i — and the
// propose_decision result embeds the model's own clinical rationale, which
// legitimately says "conservative therapy has failed", so successful approvals
// rendered a red "failed" chip. Status must key off the structured TOOL_FAILED:
// marker that agent.py prefixes genuine ToolFailed results with.
type Subscriber = {
  onToolCallStartEvent?: (a: { event: Record<string, unknown> }) => void;
  onToolCallResultEvent?: (a: { event: Record<string, unknown> }) => void;
};

const captured: { sub?: Subscriber } = {};

const mocks = vi.hoisted(() => ({
  interrupt: {
    id: "int-call-1",
    toolCallId: "call-1",
    reason: "tool_call",
    message: "Approve propose_decision(...)?",
  } as unknown,
  pending: [] as unknown[],
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: {
    OnRunStatusChanged: "OnRunStatusChanged",
    OnStateChanged: "OnStateChanged",
    OnMessagesChanged: "OnMessagesChanged",
  },
  useAgent: () => ({
    agent: {
      subscribe: (sub: Subscriber) => {
        captured.sub = sub;
        return { unsubscribe: () => undefined };
      },
      pendingInterrupts: mocks.pending,
    },
    isReady: true,
  }),
  useInterrupt: (opts: {
    render: (args: { interrupt: unknown; resolve: unknown }) => ReactElement;
  }) => opts.render({ interrupt: mocks.interrupt, resolve: vi.fn() }),
}));

vi.mock("@/lib/cancelBus", () => ({
  subscribeRunCancelled: () => () => undefined,
}));

function chipFor(name: string): HTMLElement {
  const region = screen.getByRole("region", { name: "Approval and tool activity" });
  // Single-attempt rows are <li><span mono>name</span><span>status</span></li> (no
  // per-row aria-label today) — last span of the matching li is the status chip.
  const li = [...region.querySelectorAll("li")].find((el) =>
    el.textContent?.includes(name),
  );
  const chip = li?.querySelector("span:last-of-type");
  if (!chip) throw new Error(`no chip rendered for ${name}`);
  return chip as HTMLElement;
}

function drive(toolCallId: string, toolName: string, content: string) {
  act(() => {
    captured.sub?.onToolCallStartEvent?.({
      event: { toolCallId, toolCallName: toolName },
    });
    captured.sub?.onToolCallResultEvent?.({
      event: { toolCallId, content },
    });
  });
}

describe("tool chip status (structured TOOL_FAILED: marker only)", () => {
  it("marks a genuine failure (TOOL_FAILED: prefix) as failed", () => {
    render(<ApprovalCard />);
    drive(
      "t-fail",
      "score_claim_risk",
      "TOOL_FAILED: Risk scoring service timed out. Report that risk scoring is unavailable and continue.",
    );
    expect(chipFor("score_claim_risk")).toHaveTextContent("failed");
  });

  it("keeps propose_decision ok when the model's rationale contains the word 'failed' (smoke-test regression)", () => {
    render(<ApprovalCard />);
    drive(
      "t-prop",
      "propose_decision",
      'Decision "approve" proposed with rationale: The patient meets all criteria under CR-004/POL-102; conservative therapy (NSAIDs, physical therapy) has failed. All checks passed and risk scoring returned low risk.',
    );
    expect(chipFor("propose_decision")).toHaveTextContent("ok");
  });

  it("treats JSON tool returns and error-free prose as ok", () => {
    render(<ApprovalCard />);
    drive("t-json", "lookup_coverage_rule", '{"rule_id":"CR-004","met":true}');
    drive("t-prose", "run_claim_checks", "All four claim checks passed.");
    expect(chipFor("lookup_coverage_rule")).toHaveTextContent("ok");
    expect(chipFor("run_claim_checks")).toHaveTextContent("ok");
  });
});
