import { toEnqueueOnlyOutbox } from "#src/contracts/core/events/index";
import type { NewsletterRouteDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";
import type { PluginActivationRepoPort } from "#src/features/plugin-runtime/activation";
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
 *
 * P0b fix (hooks v2 plan, 2026-09-23): the admin process and this daemon each build their OWN
 * `composePluginRuntime()` (via `createSqliteRouteDepsForWorkspace`/`createSqliteRouteDeps`), so
 * each has its own in-memory hook registry. Enabling/disabling a plugin through the admin HTTP
 * path updates only the admin process's registry — this daemon's registry is a snapshot from
 * whenever IT last booted (`pluginRuntimeReady`/P0a fixes THAT staleness at boot, not while
 * running). Rather than a new outbox event (the daemon shares `content.db` but not the bus, and is
 * enqueue-only — see the rule above), `startPluginActivationPolling` below periodically re-reads
 * the same durable `pluginActivationRepo` rows the admin process just wrote and reconciles this
 * process's registry to match — the "poll the activation repo row versions" option the plan left
 * as this lane's own sustainable-option call.
 */

/** The narrow slice `startPluginActivationPolling` needs — never the whole `RouteDeps`, so a
 * caller (or a test) can pass a hand-built fake without satisfying the full interface. */
export interface PluginActivationPollDeps {
  readonly workspaceId: string;
  readonly pluginActivationRepo: Pick<PluginActivationRepoPort, "listAll">;
  readonly onPluginEnabled: (pluginId: string) => Promise<void>;
  readonly onPluginDisabled: (pluginId: string) => void;
}

/**
 * One reconciliation pass: attaches any plugin durably `enabled` for `workspaceId` that isn't
 * already in `attachedIds` (mutated in place — the caller keeps this Set across ticks so an
 * already-attached plugin is never redundantly reloaded, which would needlessly re-run its
 * `setup()` and reset its quarantine failure count), and detaches any plugin `attachedIds` still
 * has that is no longer durably enabled. A single plugin's `onPluginEnabled` failure (its package
 * removed from disk, a tamper, …) is logged and skipped — it can never block reconciling the rest.
 */
export async function reconcilePluginActivationsOnce(deps: PluginActivationPollDeps, attachedIds: Set<string>): Promise<void> {
  const records = await deps.pluginActivationRepo.listAll();
  const enabledNow = new Set(
    records.filter((record) => record.workspaceId === deps.workspaceId && record.enabled).map((record) => record.pluginId)
  );

  for (const pluginId of enabledNow) {
    if (attachedIds.has(pluginId)) continue;
    try {
      await deps.onPluginEnabled(pluginId);
      attachedIds.add(pluginId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[plugin-runtime] plugin activation poll failed to attach '${pluginId}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  for (const pluginId of attachedIds) {
    if (enabledNow.has(pluginId)) continue;
    deps.onPluginDisabled(pluginId);
    attachedIds.delete(pluginId);
  }
}

/**
 * Starts this process's periodic reconciliation against the durable activation table (P0b).
 * Seeds `attachedIds` from the SAME rows `pluginRuntimeReady`'s boot attach already used, so the
 * first tick reconciles only what changed since boot rather than redundantly re-attaching
 * everything. Returns a `stop()` the caller invokes on shutdown; the timer is `unref()`'d so it
 * never holds the process open on its own.
 */
export function startPluginActivationPolling(
  deps: PluginActivationPollDeps & { readonly pluginRuntimeReady: Promise<void> },
  options: { intervalMs?: number } = {}
): { stop: () => void } {
  const intervalMs = options.intervalMs ?? 5000;
  const attachedIds = new Set<string>();
  let stopped = false;

  const seeded = deps.pluginRuntimeReady.then(async () => {
    const records = await deps.pluginActivationRepo.listAll();
    for (const record of records) {
      if (record.workspaceId === deps.workspaceId && record.enabled) attachedIds.add(record.pluginId);
    }
  });

  const timer = setInterval(() => {
    if (stopped) return;
    void seeded
      .then(() => reconcilePluginActivationsOnce(deps, attachedIds))
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(`[plugin-runtime] plugin activation poll failed: ${error instanceof Error ? error.message : String(error)}`);
      });
  }, intervalMs);
  timer.unref();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

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
