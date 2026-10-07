import { test as base, expect } from "../journeys/_fixtures.js";
import { assistantJourneyApi, captureAssistantArtifacts, cleanupAssistantArtifacts, CODEX_JOURNEY, configureCodexJourney } from "./assistant-journey-state.js";

/** Teardown applies even when a test fails after creating a row or while a live run is pending.
 * These tests use the config-owned isolated site and never create additional sites. */
export const test = base.extend<{ assistantArtifacts: void }>({
  assistantArtifacts: [async ({ page }, use, testInfo) => {
    await page.goto("/admin/posts");
    const api = assistantJourneyApi({ page });
    const before = await captureAssistantArtifacts({ api });
    const liveStarts: string[] = [];
    page.on("request", (request) => {
      if (!CODEX_JOURNEY || request.method() !== "POST" || new URL(request.url()).pathname !== "/api/runs") return;
      liveStarts.push(request.postDataJSON().agentId);
    });
    let restore: (() => Promise<void>) | undefined;
    try {
      if (CODEX_JOURNEY) restore = await configureCodexJourney({ api });
      await use();
      if (CODEX_JOURNEY && testInfo.status === "passed") expect(liveStarts.length, "A live Codex Local CLI run was started").toBeGreaterThan(0);
      for (const agentId of liveStarts) expect(agentId, "Every live Local CLI run selects Codex").toBe("codex");
    } finally {
      // An inert same-origin JSON document unmounts the dock and its debounced persistence before
      // deleting chats. Otherwise a late browser save could recreate the row after teardown.
      await page.goto("/api/assistant/chats");
      try { await cleanupAssistantArtifacts({ api, before }); }
      finally { await restore?.(); }
    }
  }, { auto: true, timeout: 90_000 }],
});
export { expect };
