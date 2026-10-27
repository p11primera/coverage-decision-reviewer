import { expect, test } from "@playwright/test";

import { LLM_TIMEOUT, signIn, submitRequest } from "./helpers";

test.describe("cancel mid-run", () => {
  test("cancel -> 'history saved' status + submit re-enabled", async ({ page }) => {
    await signIn(page, "E2E Canceller");
    const submit = await submitRequest(page);

    // Cancel is only rendered while a run is live (M3A RequestForm).
    const cancel = page.getByTestId("cancel-button");
    await expect(cancel).toBeVisible({ timeout: 30_000 });
    await cancel.click();

    // BFF cancel accepted; the run persists resumable history (on_cancelled).
    await expect(page.getByRole("status").filter({ hasText: "history saved" })).toBeVisible({
      timeout: 30_000,
    });

    // Submit re-enabled once the dying stream closed (busy cleared in finally).
    await expect(submit).not.toHaveAttribute("aria-disabled", "true", {
      timeout: LLM_TIMEOUT,
    });
    await expect(submit).toHaveText("Submit for review", { timeout: LLM_TIMEOUT });
  });
});
