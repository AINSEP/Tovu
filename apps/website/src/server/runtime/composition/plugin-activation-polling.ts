import type { PluginActivationRepoPort } from "@jini-ai/plugins/host";

/** Server-owned hook activation polling. The registry is process-local, while durable row
 * revisions can be changed by another server/client. Polling reuses those revisions instead
 * of claiming outbox events on a bus whose subscribers belong to another process.
 *
 * P0b's original failure was two composePluginRuntime registries: an admin enable/disable updated
 * only its own registry, while the daemon kept its boot snapshot. Boot readiness fixed initial
 * staleness, not later changes. Polling durable activation row versions was chosen because sharing
 * content.db did not share either bus or hook registry; an enqueue-only daemon could not consume
 * an outbox notification safely. ADR-070 removes that daemon registry, while the serving process
 * retains this reconciliation against changes from another process. Never remove the server's
 * poll merely because the daemon no longer has one. */
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

