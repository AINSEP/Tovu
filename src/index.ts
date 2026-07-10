import { createApp, createRouteDeps } from "./server/app";
import { createSqliteRouteDeps, defaultContentDbPath } from "./server/deps";
import { bootstrapStore } from "./features/plugins/store/store-plugin";

/**
 * @file Process entrypoint.
 *
 * Starts the HTTP server for the local runtime.
 *
 * Storage: SQLite content.db by default (persists across restarts). Set
 * `TOVU_DB=memory` for an ephemeral in-memory store (re-seeded every boot).
 * Override the db location with `TOVU_CONTENT_DB=/path/to/content.db`.
 *
 * SPIKE: on the SQLite runtime, the sample Tier-3 store plugin is activated at boot — it declares
 * its own table through the never-brick dataModule seam, seeds products, and surfaces them at /store.
 */
const port = Number(process.env.PORT ?? 3000);
const useMemory = process.env.TOVU_DB === "memory";

async function main(): Promise<void> {
  const deps = useMemory ? createRouteDeps() : createSqliteRouteDeps();

  if (!useMemory) {
    try {
      deps.store = await bootstrapStore(defaultContentDbPath());
    } catch (err) {
      // A plugin failure must never brick the site — boot without the store page.
      console.error("store plugin activation failed (site still boots):", (err as Error).message);
    }
  }

  const app = createApp(deps);
  app.listen(port, () => {
    const store = useMemory ? "in-memory" : `sqlite (${defaultContentDbPath()})`;
    console.log(`tovu server running on http://localhost:${port} — store: ${store}`);
  });
}

void main();
