import { toEnqueueOnlyOutbox } from "#src/contracts/core/events/index";
import type { NewsletterRouteDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";
import { createRouteDeps } from "./app.js";
import { createSqliteRouteDepsForWorkspace } from "./deps.js";

/**
 * @file The agent daemon's `RouteDeps` composition, moved out of `agent-daemon-server.ts` (a
 * top-level script no test can import) so its outbox rule is testable against the real factories.
 *
 * Rule: the daemon only ENQUEUES outbox events; it never drains them. The daemon shares the site's
 * `content.db` but not its bus. The site's subscribers are attached by `createApp` in the serving
 * process only, so a drain here marks rows delivered that no real subscriber ever saw (see
 * `contracts/core/events/enqueue-only-outbox.ts`). The serving process's background drainer
 * (`serving-app.ts`) is the one owner of delivery.
 */

/**
 * Builds the daemon's `RouteDeps`: in-memory when `env.TOVU_DB === "memory"`, otherwise SQLite bound
 * to `env.TOVU_WORKSPACE`.
 *
 * @param required.env the daemon's environment (`process.env` in production).
 * @param optional.dbPath content database path; defaults to `defaultContentDbPath()`. Tests only.
 * @returns the composed deps.
 * @throws whatever `createSqliteRouteDepsForWorkspace` throws for an unknown `TOVU_WORKSPACE`.
 * @complexity O(1) beyond the wrapped factory's own boot cost.
 */
export function createAgentDaemonRouteDeps(
  required: { env: NodeJS.ProcessEnv },
  optional: { dbPath?: string } = {}
): NewsletterRouteDeps {
  const { env } = required;
  const routeDeps =
    env.TOVU_DB === "memory" ? createRouteDeps() : createSqliteRouteDepsForWorkspace(env.TOVU_WORKSPACE, optional.dbPath);
  // Mutated, not spread into a copy: `createSiteApp` is closed over this exact object (see
  // `RouteDeps.exportSiteBound`'s doc in `routes/types.ts`), so a copy would leave the export app's
  // routes on the claiming outbox. Services the factory built earlier kept the raw outbox, which is
  // fine: they only enqueue. Every drain reads `routeDeps.outbox` at call time.
  routeDeps.outbox = toEnqueueOnlyOutbox(routeDeps.outbox);
  return routeDeps;
}
