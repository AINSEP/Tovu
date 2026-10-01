import { defineConfig } from "@playwright/test";
import adminConfig from "./playwright.admin.config";

export default defineConfig({
  ...adminConfig,
  testMatch: "test-audit-browser.spec.ts",
  retries: 0,
});
