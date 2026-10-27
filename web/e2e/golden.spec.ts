import { expect, test } from "@playwright/test";

import { LLM_TIMEOUT, auditRows, signIn, submitRequest } from "./helpers";

test.describe("golden path", () => {
  test("submit -> narrative -> tool chips ok -> interrupt -> approve -> RECOMMENDATION approve -> audit row", async ({
    page,
  }) => {
    await signIn(page, "E2E Bot");

    // Prefilled 72148 request (fixtures/coverage_rules.json has rules for it).
    await expect(page.getByLabel(/Patient summary/)).not.toHaveValue("");
    await expect(page.getByLabel(/CPT/)).toHaveValue("72148");
    await submitRequest(page);

    // Narrative: real streamed text (not the honest-empty placeholder).
    const narrative = page.getByRole("region", { name: "Review narrative" });
    await expect
      .poll(
        async () => {
          const text = (await narrative.textContent()) ?? "";
          return text.replace("Review narrative", "").replace(/●/g, "").trim().length;
        },
        { timeout: LLM_TIMEOUT, message: "narrative streams non-empty text" },
      )
      .toBeGreaterThan(40);

    // Tool chips: at least the lookup + claim-checks calls reach "ok" (the flaky risk
    // tool may legitimately end "failed" — that is the M3 resilience path, not this one).
    const activity = page.getByRole("region", { name: "Approval and tool activity" });
    await expect
      .poll(() => activity.getByText("ok", { exact: true }).count(), {
        timeout: LLM_TIMEOUT,
        message: "tool status chips reach ok",
      })
      .toBeGreaterThanOrEqual(2);

    // Real AG-UI interrupt (RUN_FINISHED outcome.type === "interrupt" -> card).
    await expect(page.getByText("Approval required — propose_decision")).toBeVisible({
      timeout: LLM_TIMEOUT,
    });

    await page.getByRole("button", { name: "Approve" }).click();

    // Resumed run executes propose_decision against the ORIGINAL tool_call_id and
    // snapshots state: the reviewer panel shows the agent recommendation 'approve'.
    const panel = page.getByRole("complementary", { name: "Live reviewer state" });
    await expect(panel.getByText("approve", { exact: true })).toBeVisible({
      timeout: LLM_TIMEOUT,
    });

    // Append-only audit row persisted server-side by the resume[] handler (main.py),
    // with the server-attached identity — then visible in the drawer.
    await expect
      .poll(
        async () =>
          (await auditRows(page)).some(
            (r) =>
              r.actor === "E2E Bot" &&
              r.action === "decision_resolved" &&
              r.decision === "approve" &&
              typeof r.tool_call_id === "string" &&
              (r.tool_call_id as string).length > 0,
          ),
        { timeout: LLM_TIMEOUT, message: "audit row for E2E Bot persisted" },
      )
      .toBe(true);

    await page.getByRole("button", { name: "Audit trail" }).click();
    const dialog = page.getByRole("dialog", { name: "Audit trail" });
    await expect(dialog.getByText("E2E Bot").first()).toBeVisible();
    await expect(dialog.getByText("decision_resolved").first()).toBeVisible();
  });
});
