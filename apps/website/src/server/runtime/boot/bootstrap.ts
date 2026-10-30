import path from "node:path";

import { reconcileInterruptedMigrationOnBoot } from "#src/features/database/boot/reconcile-interrupted-migration";
import { seedBundledAgentPlugins } from "../../../features/agent-plugins/lifecycle.js";
import { importAgentPluginAccessToken, importAgentPluginAccessTokensFromEnv } from "#src/features/agent-plugins/import-access-token";
import { applyAgentPluginToolRenames } from "#src/features/agent-plugins/apply-tool-renames";
import { bindProviderFacePorts, syncProviderFaces } from "#src/features/agent-plugins/provider-plugin-link";
import { notifyExternalMcpRosterChanged } from "#src/assistant/index";
import type { BootModule, BootResult } from "../lifecycle/boot-lifecycle.js";
import { bundledAgentPluginsDir } from "../composition/site-paths.js";
import { applyPendingAgentPluginTokens, listPendingAgentPluginTokenIds } from "../composition/pending-agent-plugin-tokens.js";
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

/* eslint-disable no-console */
const tokenImportLog = { info: (message: string) => console.info(message), warn: (message: string) => console.warn(message) };
/* eslint-enable no-console */

/** One vendor, one switch (`provider-plugin-link.ts`): after seeding, each agent plugin that is a
 *  provider plugin's face follows that plugin's switch — so a face seeded inactive, or one whose mirror
 *  write failed, is right from this start. A failure is logged; the provider plugins still load. */
async function syncProviderFacesAtBoot(deps: NewsletterRouteDeps): Promise<void> {
  try {
    await syncProviderFaces({
      ports: bindProviderFacePorts({ workspaceRoot: () => deps.agentPluginLayout.forWorkspace(deps.workspaceId).root }),
      providerEnabled: async ({ pluginId }) => (await deps.pluginActivationRepo.getActivation({ workspaceId: deps.workspaceId, pluginId }))?.enabled === true,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[bundled-agent-plugins] provider plugin faces could not be synced; the next start retries: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The three steps of {@link importAgentPluginTokensAtBoot}, injectable for tests. */
export interface AgentPluginTokenBootSteps {
  /** Plugin ids with a create-site onboarding token waiting in `siteDir`. */
  readonly pendingPluginIds: (siteDir: string) => ReadonlySet<string>;
  readonly applyPending: (siteDir: string) => Promise<void>;
  readonly importFromEnv: (skipPluginIds: ReadonlySet<string>) => Promise<void>;
}

function defaultAgentPluginTokenBootSteps(deps: NewsletterRouteDeps): AgentPluginTokenBootSteps {
  return {
    pendingPluginIds: listPendingAgentPluginTokenIds,
    applyPending: (siteDir) =>
      applyPendingAgentPluginTokens(
        { siteDir, sealer: deps.siteAssistantSecretSealer, importToken: (pluginId, token) => importAgentPluginAccessToken(deps, { pluginId, token }) },
        tokenImportLog,
      ),
    importFromEnv: (skipPluginIds) => importAgentPluginAccessTokensFromEnv(deps, process.env, tokenImportLog, { skipPluginIds }),
  };
}

/**
 * After the bundled plugins are seeded (a token needs its plugin installed): connects plugins from
 * tokens typed into create-site onboarding for this site, then from an old env token
 * (`tovuTokenAuth.importFromEnv`, e.g. the retired `TOVU_SUPABASE_MCP_ACCESS_TOKEN`). The onboarding
 * token goes first and the env import skips every plugin that had one: the person chose that token
 * for this site, and an ambient env token (possibly another account's) saved first would make the
 * pending import find the row connected and drop it. Neither overwrites a connection the site
 * already has, and neither can fail boot.
 */
export async function importAgentPluginTokensAtBoot(
  deps: NewsletterRouteDeps,
  options: BuildBootModulesOptions,
  steps: AgentPluginTokenBootSteps = defaultAgentPluginTokenBootSteps(deps),
): Promise<void> {
  let pending: ReadonlySet<string> = new Set();
  if (!options.useMemory) {
    const siteDir = path.dirname(options.defaultContentDbPath());
    pending = steps.pendingPluginIds(siteDir);
    try {
      await steps.applyPending(siteDir);
    } catch (err) {
      tokenImportLog.warn(`[agent-plugins] could not apply this site's pending access tokens: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await steps.importFromEnv(pending);
}

function logBundledPluginRetirements(
  { retirements }: { retirements: Awaited<ReturnType<typeof seedBundledAgentPlugins>>["retirements"] },
  _options = {},
): void {
  // Retired bundled plugins (`features/agent-plugins/retire-bundled.ts`). A retirement that
  // happened is logged once — the next boot finds nothing and says nothing — and one case is a
  // warning even though it succeeded: the retired plugin was on, and its successor stayed off
  // because an operator had turned it off.
  for (const retirement of retirements) {
    if (retirement.status === "failed") {
      // eslint-disable-next-line no-console
      console.warn(`[bundled-agent-plugins] retired '${retirement.pluginId}' could not be removed: ${retirement.reason}`);
    }
    if (retirement.status === "retired") {
      // eslint-disable-next-line no-console
      console.info(`[bundled-agent-plugins] retired '${retirement.pluginId}' (moved into '${retirement.successorId}'; successor: ${retirement.successor})`);
      if (retirement.successor === "left-disabled-by-operator") {
        // eslint-disable-next-line no-console
        console.warn(
          `[bundled-agent-plugins] '${retirement.pluginId}' was enabled but its successor '${retirement.successorId}' is turned off by an operator and was left off — turn it on in Agent Plugins to keep that capability`,
        );
      }
    }
  }
}

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
 * `newsletter`/`comments` are OPTIONAL, matching their pre-existing log-and-continue behavior.
 * Commerce is off: no store/payment declaration or seeding module is constructed in any mode.
 */
export function buildBootModules(deps: NewsletterRouteDeps, options: BuildBootModulesOptions): BootModule[] {
  let pluginActivationPoll: { stop: () => void } | undefined;
  return [
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
      // Finishes or rolls back an Agent Plugin update a crash interrupted, then removes retained
      // rollback bytes. It runs here, in array order: before the bundled seed touches any package and
      // before the listener serves a run, since no run can hold those paths yet.
      //
      // OPTIONAL, like the seed below: one bad plugin must not stop the server. An unrecovered plugin
      // is switched OFF (the update transaction switches it off before moving any bytes; recovery of
      // an unreadable journal switches it off and rethrows; a restored revision whose MCP servers
      // could not be re-provisioned stays off with an event), and its retained journal refuses any
      // change to it (`PLUGIN_UPDATE_PENDING`, 409) until a later boot recovers it. Refusing to boot
      // the whole site would also lock the operator out of the admin that could fix it. The composed
      // lifecycle binds the real MCP port (`createDeferredAgentPluginUpdateEffects`), so recovery
      // re-provisions a restored revision's servers.
      name: "agent-plugin-update-recovery",
      owner: "features/agent-plugins",
      criticality: "optional",
      prepare: async () => {
        try {
          await deps.agentPluginLifecycle.reconcileAgentPluginUpdates({ workspaceId: deps.workspaceId });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`[agent-plugin-update-recovery] an interrupted Agent Plugin update could not be recovered; it is retried next boot: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      },
      start: noop,
      stop: noop,
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
          layout: deps.agentPluginLayout,
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
        logBundledPluginRetirements({ retirements: result.retirements });
        await syncProviderFacesAtBoot(deps);
        await importAgentPluginTokensAtBoot(deps, options);
        // A vendor's tool rename (`tovuRenamedTools` in a plugin's `mcp.json`) follows onto the rows
        // that plugin provisioned, so a saved selection never names a tool the server stopped offering.
        await applyAgentPluginToolRenames(
          {
            workspaceId: deps.workspaceId,
            agentPluginLayout: deps.agentPluginLayout,
            externalMcpServerRepo: deps.externalMcpServerRepo,
            clock: deps.clock,
            notifyRosterChanged: () => notifyExternalMcpRosterChanged(),
          },
          tokenImportLog,
        );
      },
      start: noop,
      stop: noop,
    },
  ];
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
