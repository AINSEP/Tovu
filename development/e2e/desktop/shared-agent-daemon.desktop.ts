// Real sites, default workspace ids and a scripted no-key CLI: no paid model or installed CLI.
// Acceptance alone also covers preparation and runs that fail before any CLI starts. Require
// each CLI's own init/status with child PID, then five live children in the same process sample.
import { test } from "@playwright/test";
import { checkAssistantSites } from "./_assistant-release-gate.js";

test("five chatting sites use one daemon", async () => {
  test.setTimeout(600_000);
  await checkAssistantSites({ names: Array.from({ length: 5 }, (_, index) => `shared-daemon-site-${index}`) }, {});
});
