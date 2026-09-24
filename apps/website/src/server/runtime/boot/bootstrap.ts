import { bootstrapStore } from "#src/features/plugins/store/store-plugin";
import { reconcileInterruptedMigrationOnBoot } from "#src/features/database/boot/reconcile-interrupted-migration";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { seedBundledAgentPlugins } from "#src/features/agent-plugins/seed-bundled";
import type { BootModule, BootResult } from "../lifecycle/boot-lifecycle.js";
import { bundledAgentPluginsDir } from "../composition/deps.js";
import { startPluginActivationPolling } from "../composition/agent-daemon-deps.js";
import type { NewsletterRouteDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";

/**
 * @file ADR-046 Phase 3 (SPEC-031) — composes the boot modules `index.ts` runs through
 * `runBootLifecycle()` (ADR-046 Phase 2). Pulled out of `index.ts` so this composition logic is
 * unit-testable (`index.ts` itself is deliberately never imported by a test — see that file's own
 * header note on why boot-only logic lives there). `index.ts` becomes a thin wrapper: build deps,
 * call `buildBootModules`, run the lifecycle, `listen()`.
 *
 * `logCriticalBootFailures` below (2026-09-06 composition-root fix) was, until this fix, hand-copied
 * verbatim between `index.ts` and `cli/commands/serve.ts` — both files' own comments claimed this
 * class of boot-only logic is "never shared via import," which this very file's existence already
 * contradicted (it has been the shared, imported, `buildBootModules` composition for both boot paths
 * since ADR-046 Phase 3). Both call sites now import this one copy instead.
 */

const noop = async (): Promise<void> => {};

export interface BuildBootModulesOptions {
  useMemory: boolean;
  defaultContentDbPath: () => string;
  /** Test seam for the `plugin-runtime-attach` module's activation poll; defaults to the poll's own 5 s. */
  pluginActivationPollIntervalMs?: number;
}

/**
 * `database-migration-reconciliation` (ADR-041/043/044/045 re-audit, 2026-07-16,
 * TM-adr041-043-044-045-audit-001, Finding 2 fix) is CRITICAL and runs FIRST — ADR-041 §3's own
 * "never boot into a half-migrated schema" guarantee only holds if this scan actually runs;
 * before this fix, `reconcile-interrupted-migration.ts`'s fully-built, fully-unit-tested scanner
 * was never invoked by any composition root, so `deps.siteStatusRepo` (and therefore the Recovery
 * screen's degraded-banner precedence chain and the `PENDING_MIGRATION` deep-link guard) could
 * never reflect a real crash-interrupted migration. A failure to even RUN this scan (not what it
 * finds — finding an interrupted migration is a successful detection, not a module failure) is
 * critical: boot must not proceed not knowing its own migration-safety state.
 *
 * `settings`/`seo` are ALSO CRITICAL: their promises have no `.catch()` anywhere in their chain
 * (an unhandled-rejection risk before ADR-046 Phase 2), so a failure here must abort boot cleanly.
 * `newsletter`/`comments`/`store-plugin` are OPTIONAL, matching their pre-existing log-and-continue
 * behavior. `store-plugin` is omitted entirely in memory mode — it was never invoked there before
 * either.
 */
export function buildBootModules(deps: NewsletterRouteDeps, options: BuildBootModulesOptions): BootModule[] {
  let pluginActivationPoll: { stop: () => void } | undefined;
  const modules: BootModule[] = [
    {
      name: "database-migration-reconciliation",
      owner: "features/database",
      criticality: "critical",
      prepare: async () => {
        await reconcileInterruptedMigrationOnBoot({
          siteId: deps.workspaceId,
          migrationRuns: deps.migrationRunsRepo,
          ledger: deps.databaseLedgerRepo,
          siteStatus: deps.siteStatusRepo,
        });
      },
      start: noop,
      stop: noop,
    },
    { name: "settings", owner: "features/settings", criticality: "critical", prepare: () => deps.settingsReady, start: noop, stop: noop },
    { name: "seo", owner: "seo", criticality: "critical", prepare: () => deps.seoReady, start: noop, stop: noop },
    { name: "newsletter", owner: "newsletter", criticality: "optional", prepare: () => deps.newsletterReady, start: noop, stop: noop },
    { name: "comments", owner: "comments", criticality: "optional", prepare: () => deps.commentsReady, start: noop, stop: noop },
    {
      // P0a fix (2026-09-23): re-attaches every durably-enabled plugin to this process's (fresh,
      // empty) hook registry before the server starts serving — see `deps.pluginRuntimeReady`'s own
      // doc. OPTIONAL: `attachEnabledPluginsAtBoot()` already isolates per-plugin failures itself
      // (logs and continues), so this module's own promise realistically never rejects; optional
      // criticality is a defensive floor, not the primary safety net.
      //
      // `start` keeps this process's registry reconciled with the durable activation table after
      // boot. `plugins_set_enabled` runs in the AGENT DAEMON process, so a chat-driven disable
      // detached the hook only there; without this poll, every save served here kept running the
      // disabled plugin's beforeSave hook until restart. Same poll the daemon runs for the reverse
      // direction (`agent-daemon-deps.ts`).
      name: "plugin-runtime-attach",
      owner: "features/plugin-runtime",
      criticality: "optional",
      prepare: () => deps.pluginRuntimeReady,
      start: async () => {
        pluginActivationPoll?.stop();
        pluginActivationPoll = startPluginActivationPolling(
          deps,
          options.pluginActivationPollIntervalMs === undefined ? {} : { intervalMs: options.pluginActivationPollIntervalMs },
        );
      },
      stop: async () => {
        pluginActivationPoll?.stop();
        pluginActivationPoll = undefined;
      },
    },
    {
      // Installs the Agent Plugins that ship with Tovu into this workspace's own package store and
      // records each INACTIVE until an operator enables it (see
      // `features/agent-plugins/seed-bundled.ts` for why it re-runs every boot rather than once).
      //
      // OPTIONAL, not critical, and deliberately so: a bundled plugin that fails to seed costs the
      // operator one dormant, disabled capability. Refusing to boot a whole CMS over that would be a
      // wildly disproportionate failure mode for a feature that is switched off by default anyway.
      // Per-plugin failures are captured in the returned report and logged here rather than thrown,
      // so one bad package cannot hide the others.
      name: "bundled-agent-plugins",
      owner: "features/agent-plugins",
      criticality: "optional",
      prepare: async () => {
        const result = await seedBundledAgentPlugins({
          layout: resolveAgentPluginLayout(),
          workspaceId: deps.workspaceId,
          sourceRoot: bundledAgentPluginsDir(),
        });
        for (const outcome of result.outcomes) {
          if (outcome.status === "failed") {
            // eslint-disable-next-line no-console
            console.warn(`[bundled-agent-plugins] '${outcome.pluginId}' could not be seeded: ${outcome.reason}`);
          }
        }
        if (result.ledgerFailure !== undefined) {
          // Not a seed failure: every package is installed and every activation decision intact.
          // What is lost is this boot's record of WHICH digest the build published, so a bundled
          // plugin that was upgraded in place falls back to being refused as ambiguous until a
          // later boot writes the ledger (`features/agent-plugins/bundled-digests.ts`).
          // eslint-disable-next-line no-console
          console.warn(`[bundled-agent-plugins] the bundled-digest ledger could not be written: ${result.ledgerFailure}`);
        }
      },
      start: noop,
      stop: noop,
    },
  ];
  if (!options.useMemory) {
    modules.push({
      name: "store-plugin",
      owner: "features/plugins/store",
      criticality: "optional",
      prepare: async () => {
        deps.store = await bootstrapStore(options.defaultContentDbPath());
      },
      start: noop,
      stop: noop,
    });
  }
  return modules;
}

/** Logs one line per critical, not-ready module from a failed boot. Called only when
 *  `bootResult.ok` is false — both `index.ts`'s and `cli/commands/serve.ts`'s own `!ok` branches. */
export function logCriticalBootFailures(bootResult: BootResult): void {
  for (const module of bootResult.modules) {
    if (module.criticality === "critical" && module.lifecycle.status !== "ready") {
      console.error(`[boot-lifecycle] critical module "${module.name}" (${module.owner}) is ${module.lifecycle.status}: ${module.lifecycle.reasonCode}`);
    }
  }
}
