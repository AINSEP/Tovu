import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import { toEnqueueOnlyOutbox } from "#src/contracts/core/events/index";
import type { NewsletterRouteDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";
import type { PluginActivationRepoPort } from "@jini-ai/plugins/host";
import { createRouteDeps } from "./app.js";
import { createSiteRouteDepsForWorkspace } from "./deps.js";
import type { SiteStore } from "./open-site-store.js";

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
 * `composePluginRuntime()` (via `createSiteRouteDepsForWorkspace`/`createSiteRouteDeps`), so
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
  readonly pluginLoadedVersion?: (required: { id: string }, optional?: Record<string, never>) => string | undefined;
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
  const enabledVersions = new Map(records.filter(record => record.workspaceId === deps.workspaceId && record.enabled).map(record => [record.pluginId, record.version]));

  for (const [pluginId, activeVersion] of enabledVersions) {
    const loadedVersion = deps.pluginLoadedVersion?.({ id: pluginId }, {});
    if (attachedIds.has(pluginId) && (!deps.pluginLoadedVersion || loadedVersion === activeVersion)) continue;
    await attachActivatedPlugin({ deps, attachedIds, pluginId });
  }

  for (const pluginId of attachedIds) {
    if (enabledVersions.has(pluginId)) continue;
    deps.onPluginDisabled(pluginId);
    attachedIds.delete(pluginId);
  }
}

/** An attach failure is local to this plugin; later attachments and detachments still run. */
async function attachActivatedPlugin(
  required: { deps: PluginActivationPollDeps; attachedIds: Set<string>; pluginId: string },
  _optional: Record<string, never> = {}
): Promise<void> {
  const { deps, attachedIds, pluginId } = required;
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
  // A pass can already be awaiting readiness or a durable read when stop() clears the timer.
  // Check again at each registry boundary so that settling that pass cannot change hooks.
  const pollingDeps: PluginActivationPollDeps = {
    ...deps,
    onPluginEnabled: async (pluginId) => { if (!stopped) await deps.onPluginEnabled(pluginId); },
    onPluginDisabled: (pluginId) => { if (!stopped) deps.onPluginDisabled(pluginId); },
  };

  const seeded = deps.pluginRuntimeReady.then(async () => {
    const records = await deps.pluginActivationRepo.listAll();
    for (const record of records) {
      if (record.workspaceId === deps.workspaceId && record.enabled) attachedIds.add(record.pluginId);
    }
  });

  const timer = setInterval(() => {
    if (stopped) return;
    void seeded
      .then(() => stopped ? undefined : reconcilePluginActivationsOnce(pollingDeps, attachedIds))
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
 * @param optional.onStoreOpened receives the owned composition store for daemon teardown.
 * @returns the composed deps.
 * @throws (rejects) whatever `createSiteRouteDepsForWorkspace` rejects with for an unknown `TOVU_WORKSPACE`.
 * @complexity O(1) beyond the wrapped factory's own boot cost.
 */
export async function createAgentDaemonRouteDeps(
  required: { env: NodeJS.ProcessEnv },
  optional: { dbPath?: string; onStoreOpened?: (store: SiteStore) => void } = {}
): Promise<NewsletterRouteDeps & ByokToolSurfaceDeps> {
  const { env } = required;
  const routeDeps =
    env.TOVU_DB === "memory" ? createRouteDeps() : await createSiteRouteDepsForWorkspace(
      { workspaceIdOverride: env.TOVU_WORKSPACE },
      { dbPath: optional.dbPath, storeRole: "client", onStoreOpened: optional.onStoreOpened }
    );
  // Mutated, not spread into a copy: `createSiteApp` is closed over this exact object (see
  // `RouteDeps.exportSiteBound`'s doc in `routes/types.ts`), so a copy would leave the export app's
  // routes on the claiming outbox. Services the factory built earlier kept the raw outbox, which is
  // fine: they only enqueue. Every drain reads `routeDeps.outbox` at call time.
  routeDeps.outbox = toEnqueueOnlyOutbox(routeDeps.outbox);
  return routeDeps;
}
