import { describe, expect, it } from "vitest";

import {
  groupConsecutiveAttempts,
  type ToolCallEntry,
} from "@/components/toolActivityGroups";

function entry(id: string, name: string, status: ToolCallEntry["status"] = "ok"): ToolCallEntry {
  return { id, name, status };
}

describe("groupConsecutiveAttempts", () => {
  it("groups adjacent same-name calls into one attempt group", () => {
    const groups = groupConsecutiveAttempts([
      entry("a", "score_claim_risk", "failed"),
      entry("b", "score_claim_risk", "ok"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("score_claim_risk");
    expect(groups[0].attempts.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("does NOT group same-name calls separated by a different tool", () => {
    const groups = groupConsecutiveAttempts([
      entry("a", "score_claim_risk", "ok"),
      entry("b", "run_claim_checks", "ok"),
      entry("c", "score_claim_risk", "ok"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.name)).toEqual([
      "score_claim_risk",
      "run_claim_checks",
      "score_claim_risk",
    ]);
    expect(groups[0].attempts).toHaveLength(1);
    expect(groups[2].attempts).toHaveLength(1);
  });

  it("keeps a lone call as its own single-attempt group", () => {
    const groups = groupConsecutiveAttempts([entry("a", "lookup_coverage_rule")]);
    expect(groups).toEqual([
      { name: "lookup_coverage_rule", attempts: [entry("a", "lookup_coverage_rule")] },
    ]);
  });

  it("returns no groups for no calls", () => {
    expect(groupConsecutiveAttempts([])).toEqual([]);
  });

  it("propagates per-attempt status untouched inside groups", () => {
    const groups = groupConsecutiveAttempts([
      entry("a", "score_claim_risk", "failed"),
      entry("b", "score_claim_risk", "running"),
      entry("c", "score_claim_risk", "stopped"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].attempts.map((a) => a.status)).toEqual(["failed", "running", "stopped"]);
  });
});
