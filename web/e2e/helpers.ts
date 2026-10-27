import { expect, type Page } from "@playwright/test";

// The vLLM-backed agent is slow by design (local inference); every wait that crosses a
// model round-trip uses this budget. Selector-only waits keep the config's 15s default
// so a broken selector still fails fast.
export const LLM_TIMEOUT = 240_000;

export async function signIn(page: Page, name: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Reviewer name").fill(name);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Landed on the reviewer shell only when the header drawer trigger hydrated.
  await expect(page.getByRole("button", { name: "Audit trail" })).toBeVisible();
}

export async function submitRequest(page: Page) {
  const submit = page.getByTestId("submit-button");
  await expect(submit, "agent runtime ready").toHaveText("Submit for review", {
    timeout: LLM_TIMEOUT,
  });
  await expect(submit).not.toHaveAttribute("aria-disabled");
  await submit.click();
  return submit;
}

/** Read the audit table through the BFF (same door the drawer uses), with cookies. */
export async function auditRows(page: Page): Promise<Record<string, unknown>[]> {
  const res = await page.request.get("/api/audit", { headers: { "Cache-Control": "no-store" } });
  if (!res.ok()) return [];
  const body = (await res.json()) as { rows: Record<string, unknown>[] };
  return body.rows;
}
