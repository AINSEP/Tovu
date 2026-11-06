// Release gate (owner 2026-11-04, Thursday item 21): desktop 0.1.27 shipped with only the FIRST running
// site able to start its assistant — the shared agent daemon keyed site scopes by workspace id, and every
// site is `workspace-local`, so the second site's run was refused ("the assistant could not start").
// Two real sites with DEFAULT ids must each get a run accepted and their own CLI child started. No API
// key is needed: the proof is the run's own status event carrying a live CLI process, not a reply.
import { test } from "@playwright/test";
import { checkAssistantSites } from "./_assistant-release-gate.js";

test("two running sites with default workspace ids each start their assistant", async () => {
  test.setTimeout(600_000);
  await checkAssistantSites({ names: ["two-sites-a", "two-sites-b"] }, {});
});
