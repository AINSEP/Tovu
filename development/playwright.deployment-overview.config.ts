import { defineConfig } from "@playwright/test";
import deploymentConfig from "./playwright.deployment-tabbar-scroll.config.js";

// Reuse the Deployment suite's isolated API/Vite harness and single login worker.
export default defineConfig({
  ...deploymentConfig,
  testMatch: /deployment-overview\.spec\.ts/,
});
