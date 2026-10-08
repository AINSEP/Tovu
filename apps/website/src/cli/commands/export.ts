import path from "node:path";

import { createSiteRouteDeps } from "../../server/runtime/composition/deps.js";
import { exportSite, type ExportReport } from "../../features/site-export/index.js";
import { bootSiteDir, closeSiteDirBoot } from "../../platform/site-dir/boot-site-dir.js";
import type { SiteStore } from "../../server/runtime/composition/open-site-store.js";
import { resolveInstallDirTarget } from "../../platform/site-dir/resolve-install-dir-target.js";
import { registerPluginSdkResolver } from "../../server/runtime/boot/plugin-sdk-resolver.js";
import { awaitBootWorkWithinBound } from "../../server/runtime/lifecycle/await-boot-work.js";
import { reconcileInterruptedMigrationOnBoot } from "#src/features/database/boot/reconcile-interrupted-migration";
import { ExportIncompleteError, ExportBlockedPendingRecoveryError } from "../errors.js";

/**
 * @file `tovu export <dir>` — boot the real site and call the export engine.
 * The engine owns rendering and its short-lived crawl listener; this command resolves
 * output, prints every route/asset failure honestly and closes the store.
 * Errors propagate to `cli/main.ts`; `cli/errors.ts` owns exit-code mapping.
 *
 * CIC U-002-B1/ADR-005 require the synchronous plugin SDK resolver before composition,
 * with no preceding await, because a real plugin install dir makes imports reachable.
 * See `runtime/boot/plugin-sdk-resolver.ts` for the security boundary.
 *
 * Run interrupted-migration reconciliation immediately after composition, before crawling
 * potentially inconsistent data. Refuse with `ExportBlockedPendingRecoveryError` (exit 7)
 * rather than producing confusing per-route failures. The full boot-module bundle also
 * seeds optional agent plugins unrelated to export, so only the required scan runs here.
 */

export interface RunExportCommandInput {
  dir: string;
  out?: string;
  workspaceId?: string;
  clean?: boolean;
  /** Passed straight through to `exportSite`'s own option of the same name — see that option's doc
   *  (`site-exporter.ts`) for exactly what gets rewritten and what a base path must look like. */
  basePath?: string;
}

/**
 * BR-EXPORT-01: `--out` flag, then `TOVU_EXPORT_DIR` env, then `<dir>/out/export` — first
 * PRESENT value wins, same precedence shape `serve.ts`'s `resolveServePort` already uses for
 * `--port`. The default is under the install dir this command was given, because the composition
 * below is handed that dir as its `siteBinding`; a cwd-relative default could target another site.
 *
 * `exportOutputRootDir` is `RouteDeps.exportOutputRootDir` — this command's own composition root
 * (`createSiteRouteDeps`, below) resolves the `TOVU_EXPORT_DIR`-env-then-default half of this
 * precedence chain exactly once (`server/deps.ts`'s `resolveExportOutputRootDir`); only the
 * CLI-only `--out` flag is decided here. This function never reads `process.env` itself.
 */
function resolveExportOutputDir(input: RunExportCommandInput, exportOutputRootDir: string): string {
  if (input.out !== undefined) return path.resolve(input.out);
  return exportOutputRootDir;
}

/** Formats the honest-reporting contract the brief for this feature requires: route/asset counts
 *  written to stdout, every failure (never silently absent) written to stderr. */
function printExportReport(report: ExportReport): void {
  const routeTotal = report.routes.succeeded.length + report.routes.failed.length;
  const assetTotal = report.assets.succeeded.length + report.assets.failed.length;
  process.stdout.write(
    `tovu export: wrote ${report.routes.succeeded.length}/${routeTotal} routes and ${report.assets.succeeded.length}/${assetTotal} assets to ${report.outputDir}\n`
  );

  for (const skip of report.skippedManifestEntries) {
    process.stderr.write(`tovu export: skipped (${skip.reason}): ${skip.detail}\n`);
  }
  for (const failure of report.routes.failed) {
    process.stderr.write(`tovu export: FAILED route ${failure.path} (${failure.kind}): ${failure.reason}\n`);
  }
  for (const failure of report.assets.failed) {
    process.stderr.write(`tovu export: FAILED asset ${failure.url}: ${failure.reason}\n`);
  }
  if (report.unreferencedThemeFiles.length > 0) {
    process.stderr.write(
      `tovu export: warning: ${report.unreferencedThemeFiles.length} theme file(s) were never referenced by a rendered page and were not exported ` +
        "(template shells, build/preview artifacts, and anything a theme's own JS builds a path to at runtime all look identical from here):\n"
    );
    for (const file of report.unreferencedThemeFiles) {
      process.stderr.write(`  - ${file}\n`);
    }
  }
  if (report.basePath) {
    process.stdout.write(`tovu export: rewrote root-relative links/assets for base path '${report.basePath}'\n`);
  }
  if (report.basePathRewriteWarning) {
    process.stderr.write(`tovu export: warning: ${report.basePathRewriteWarning}\n`);
  }
}

export interface RunExportCommandOptional {
  /** Command effects stay injectable so cleanup can be exercised without replacing modules. */
  bootSiteDir?: typeof bootSiteDir;
  closeSiteDirBoot?: typeof closeSiteDirBoot;
  createSiteRouteDeps?: typeof createSiteRouteDeps;
  registerPluginSdkResolver?: typeof registerPluginSdkResolver;
  reconcileInterruptedMigrationOnBoot?: typeof reconcileInterruptedMigrationOnBoot;
  exportSite?: typeof exportSite;
}

/**
 * Run `tovu export <dir> [--out] [--workspace] [--clean] [--base-path]`: validate/migrate/stamp the
 * install dir exactly like `serve` does, then export its public site to a folder of static files.
 *
 * @throws whatever `bootSiteDir` throws (`SiteDirInvalidError`, `SiteNewerThanRuntimeError`,
 *   `SiteCorruptError`), `ExportOutputNotEmptyError` (non-empty `--out` without `--clean`), or
 *   `ExportIncompleteError` (the export ran but at least one route failed to render) —
 *   `cli/main.ts` maps each to the correct exit code.
 * @complexity O(1) beyond `bootSiteDir`'s and `exportSite`'s own bounded costs.
 */
export async function runExportCommand(input: RunExportCommandInput, optional: RunExportCommandOptional = {}): Promise<void> {
  // CIC U-002/ADR-005 (ESCALATE_SECURITY) — see this file's header. Placed first, before any other
  // boot step and with no `await` ahead of it, mirroring `index.ts`'s and `serve.ts`'s own ordering.
  (optional.registerPluginSdkResolver ?? registerPluginSdkResolver)();

  const target = resolveInstallDirTarget(input.dir);
  const bootResult = await (optional.bootSiteDir ?? bootSiteDir)({ dir: target }, { workspaceId: input.workspaceId });
  // The composition's store (`onStoreOpened`): closing it stops its guest-chat sweep, then the store.
  let composedStore: SiteStore | undefined;
  // Boot passes the composition (and the crawl's `createSiteApp()`) started and never awaited, which
  // read the store: the cleanup below waits for them, bounded, the way `tovu serve`'s does.
  let routeDepsForCleanup: { legacyPublishCredentialsReady?: Promise<void>; siteAppBootWork?: ReadonlySet<Promise<void>> } = {};

  // Opened right after `bootSiteDir`, so a composition failure closes the store too (a PGlite owner
  // socket left open would keep this process from exiting).
  try {
    const dbPath = path.join(target, "content.db");
    const routeDeps = await (optional.createSiteRouteDeps ?? createSiteRouteDeps)(dbPath, {
      db: bootResult.db,
      store: bootResult.store,
      workspaceId: bootResult.workspaceId,
      uploadsDir: path.join(target, "uploads"),
      // Same install-dir-relative reasoning as `uploadsDir` right above (CR-R01): the default themes
      // root is `process.cwd()`-relative, so without this a `<dir>` run would seed and serve a
      // `sites/tovu-dev/themes` beside the operator's shell instead of the site it was given.
      themesDir: path.join(target, "themes"),
      // The site this command exports. Without it the binding falls back to `describeSiteBinding()`,
      // `<cwd>/sites/<name>`, and every `<site>/...` default the composition derives from it (the
      // export root above all) lands in that unrelated site. Same values as `serve.ts`'s binding,
      // for the same reasons; this command does not pin `TOVU_SITE_DIR` the way `serve` does.
      siteBinding: { dir: target, name: path.basename(target), dirOverridden: true, switcherCompatible: false },
      onStoreOpened: (store) => (composedStore = store),
    });
    routeDepsForCleanup = routeDeps;
    const outputDir = resolveExportOutputDir(input, routeDeps.exportOutputRootDir);

    // See this file's header. The same CRITICAL check `tovu serve`'s boot lifecycle runs first,
    // before this command ever crawls a route — a site left mid-migration by a crash must never be
    // exported from possibly-inconsistent data.
    const reconciliation = await (optional.reconcileInterruptedMigrationOnBoot ?? reconcileInterruptedMigrationOnBoot)({
      siteId: routeDeps.workspaceId,
      migrationRuns: routeDeps.migrationRunsRepo,
      ledger: routeDeps.databaseLedgerRepo,
      siteStatus: routeDeps.siteStatusRepo,
    });
    if (reconciliation.blocked) {
      throw new ExportBlockedPendingRecoveryError(
        `refusing to export ${target} — a crash-interrupted migration was detected and this site is now BLOCKED_PENDING_RECOVERY; resolve it via Recovery before exporting.`
      );
    }

    const report = await (optional.exportSite ?? exportSite)({ routeDeps, outputDir, clean: input.clean ?? false, basePath: input.basePath });
    printExportReport(report);
    if (report.routes.failed.length > 0) {
      throw new ExportIncompleteError(
        `export finished with ${report.routes.failed.length} failed route(s) — see stderr above`
      );
    }
  } finally {
    const { legacyPublishCredentialsReady, siteAppBootWork } = routeDepsForCleanup;
    await awaitBootWorkWithinBound({
      work: [...(legacyPublishCredentialsReady ? [legacyPublishCredentialsReady] : []), ...(siteAppBootWork ?? [])],
    });
    await (optional.closeSiteDirBoot ?? closeSiteDirBoot)(bootResult, composedStore);
  }
}
