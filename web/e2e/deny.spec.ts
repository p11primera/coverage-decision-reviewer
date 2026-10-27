import { expect, test } from "@playwright/test";

import { LLM_TIMEOUT, auditRows, signIn, submitRequest } from "./helpers";

// Unique per suite run so the audit poll can never match a historical row.
const RATIONALE = `E2E deny ${Date.now()}: documentation insufficient for CPT 72148`;

test.describe("deny requires rationale", () => {
  test("interrupt -> Deny gated on rationale -> audit row decision=deny with rationale", async ({
    page,
  }) => {
    await signIn(page, "E2E Denier");
    await submitRequest(page);

    await expect(page.getByText("Approval required — propose_decision")).toBeVisible({
      timeout: LLM_TIMEOUT,
    });

    // Structured rationale is REQUIRED before Deny enables (deny-gate).
    const deny = page.getByRole("button", { name: "Deny" });
    await expect(deny).toBeDisabled();
    await page.getByRole("textbox", { name: /Reviewer rationale/i }).fill(RATIONALE);
    await expect(deny).toBeEnabled();
    await deny.click();

    // Audit row: decision=deny + the reviewer's rationale text, persisted server-side.
    await expect
      .poll(
        async () =>
          (await auditRows(page)).some(
            (r) => r.actor === "E2E Denier" && r.decision === "deny" && r.rationale === RATIONALE,
          ),
        { timeout: LLM_TIMEOUT, message: "deny audit row with rationale persisted" },
      )
      .toBe(true);

    await page.getByRole("button", { name: "Audit trail" }).click();
    const dialog = page.getByRole("dialog", { name: "Audit trail" });
    await expect(dialog.getByText("E2E Denier").first()).toBeVisible();
    await expect(dialog.getByText("deny").first()).toBeVisible();
    await expect(dialog.getByText(RATIONALE)).toBeVisible();
  });
});
