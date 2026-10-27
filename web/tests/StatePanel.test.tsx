import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatePanel } from "@/components/StatePanel";

const mocks = vi.hoisted(() => ({
  agent: { state: {} as unknown, messages: [] as unknown[] },
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: { OnStateChanged: "OnStateChanged", OnMessagesChanged: "OnMessagesChanged" },
  useAgent: () => ({ agent: mocks.agent, isReady: true }),
}));

function panel() {
  return screen.getByRole("complementary", { name: /Live reviewer state/i });
}

beforeEach(() => {
  mocks.agent = { state: {}, messages: [] };
});

describe("StatePanel", () => {
  it("handles missing initial state gracefully (no crash, em-dash placeholders)", () => {
    mocks.agent = { state: null, messages: [] } as unknown as typeof mocks.agent;
    render(<StatePanel />);
    expect(panel()).toBeInTheDocument();
    expect(panel()).toHaveTextContent("0/0");
    expect(panel()).toHaveTextContent("Rule findings (0)");
  });

  it("renders live state values pushed by STATE_SNAPSHOT", () => {
    mocks.agent = {
      state: {
        checked_count: 2,
        total_checks: 4,
        findings: [{ rule_id: "CR-004", cpt: "72148", outcome_guidance: "meets criteria" }],
        risk_score: "low",
        recommendation: "approve",
        citations: ["POL-102"],
      },
      messages: [],
    } as unknown as typeof mocks.agent;
    render(<StatePanel />);
    expect(panel()).toHaveTextContent("2/4");
    expect(panel()).toHaveTextContent("low");
    expect(panel()).toHaveTextContent("approve");
    expect(panel()).toHaveTextContent("CR-004");
    expect(panel()).toHaveTextContent("POL-102");
  });

  it("renders the literal 'unavailable' risk score when the flaky scorer failed", () => {
    mocks.agent = {
      state: { risk_score: "unavailable" },
      messages: [],
    } as unknown as typeof mocks.agent;
    render(<StatePanel />);
    expect(panel()).toHaveTextContent("unavailable");
  });
});
