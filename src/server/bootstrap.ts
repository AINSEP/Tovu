import { bootstrapStore } from "../features/plugins/store/store-plugin";
import { reconcileInterruptedMigrationOnBoot } from "../features/storage/boot/reconcile-interrupted-migration";
import type { BootModule } from "./boot-lifecycle";
import type { NewsletterRouteDeps } from "./routes/admin/newsletter/deps";

/**
 * @file ADR-046 Phase 3 (SPEC-031) — composes the boot modules `index.ts` runs through
 * `runBootLifecycle()` (ADR-046 Phase 2). Pulled out of `index.ts` so this composition logic is
 * unit-testable (`index.ts` itself is deliberately never imported by a test — see that file's own
 * header note on why boot-only logic lives there). `index.ts` becomes a thin wrapper: build deps,
 * call `buildBootModules`, run the lifecycle, `listen()`.
 */

const noop = async (): Promise<void> => {};

export interface BuildBootModulesOptions {
  useMemory: boolean;
  defaultContentDbPath: () => string;
}

/**
 * `storage-migration-reconciliation` (ADR-041/043/044/045 re-audit, 2026-07-16,
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
  const modules: BootModule[] = [
    {
      name: "storage-migration-reconciliation",
      owner: "features/storage",
      criticality: "critical",
      prepare: async () => {
        await reconcileInterruptedMigrationOnBoot({
          siteId: deps.workspaceId,
          migrationRuns: deps.migrationRunsRepo,
          ledger: deps.storageLedgerRepo,
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
