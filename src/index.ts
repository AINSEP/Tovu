import { createApp, createRouteDeps } from "./server/app";
import { createSqliteRouteDeps, defaultContentDbPath } from "./server/deps";

/**
 * @file Process entrypoint.
 *
 * Starts the HTTP server for the local runtime.
 *
 * Storage: SQLite content.db by default (persists across restarts). Set
 * `TOVU_DB=memory` for an ephemeral in-memory store (re-seeded every boot).
 * Override the db location with `TOVU_CONTENT_DB=/path/to/content.db`.
 */
const port = Number(process.env.PORT ?? 3000);
const useMemory = process.env.TOVU_DB === "memory";

const deps = useMemory ? createRouteDeps() : createSqliteRouteDeps();
const app = createApp(deps);

app.listen(port, () => {
  const store = useMemory ? "in-memory" : `sqlite (${defaultContentDbPath()})`;
  console.log(`tovu server running on http://localhost:${port} — store: ${store}`);
});
