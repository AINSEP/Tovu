import { startFakeComposio } from "./fake-composio-server.js";

/**
 * @file Boots {@link startFakeComposio} on a fixed port so Playwright's `webServer` can manage it
 * like any other process.
 *
 * `FAKE_COMPOSIO_PORT` and `FAKE_COMPOSIO_USER_ID` come from
 * `development/playwright.connectors.config.ts`. The user id must match
 * `composioUserIdFor(workspaceId)` in `src/connectors/composio-service.ts`, or the provider rejects
 * every account as belonging to someone else.
 */
const port = Number(process.env.FAKE_COMPOSIO_PORT ?? 6484);
const expectedUserId = process.env.FAKE_COMPOSIO_USER_ID ?? "tovu-workspace-workspace-local";

// Wrapped rather than top-level `await`: `tsx` transforms this file to CJS, where top-level await
// is a hard error.
async function main(): Promise<void> {
  const fake = await startFakeComposio({ expectedUserId, port });
  console.log(`fake composio listening on ${fake.url} (user ${expectedUserId})`);

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      void fake.close().then(() => process.exit(0));
    });
  }
}

void main();
