import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL's auto-cleanup relies on a global afterEach (vitest globals are off here), so
// unmount explicitly between tests.
afterEach(() => {
  cleanup();
});
