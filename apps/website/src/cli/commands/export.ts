import path from "node:path";

import { createSqliteRouteDeps } from "../../server/runtime/composition/deps.js";
import { exportSite, type ExportReport } from "../../platform/export/index.js";
import { bootSiteDir } from "../../platform/site-dir/boot-site-dir.js";
import { resolveInstallDirTarget } from "../../platform/site-dir/resolve-install-dir-target.js";
import { registerPluginSdkResolver } from "../../server/runtime/boot/plugin-sdk-resolver.js";
import { reconcileInterruptedMigrationOnBoot } from "#src/features/database/boot/reconcile-interrupted-migration";
import { ExportIncompleteError, ExportBlockedPendingRecoveryError } from "../errors.js";

/**
 * @file `tovu export <dir>` — wires a commander action's parsed arguments to the exporter engine
 * (`export/site-exporter.ts`'s `exportSite`), mirroring `cli/commands/serve.ts`'s own shape: same
 * `bootSiteDir` → `createSqliteRouteDeps` composition, minus the `app.listen` half (the exporter
 * boots its OWN short-lived in-process listener and closes it before this function returns).
 *
 * Purpose:
 * Resolves the export output directory (BR-EXPORT-01 below), boots the real site the same way
 * `serve` would, runs the export, prints the honest report (route/asset counts, every failure
 * named), and closes the db handle. Never renders anything itself — `exportSite` owns that.
 *
 * Architectural role:
 * `cli` layer. Never maps errors to exit codes itself (`cli/errors.ts`'s job) — lets `bootSiteDir`
 * errors, `ExportOutputNotEmptyError`, and this file's own `ExportIncompleteError` propagate
 * uncaught to `cli/main.ts`.
 *
 * Plugin SDK resolver (2026-09-05 dispatch, CIC U-002/ADR-005, ESCALATE_SECURITY): same gap as
 * `serve.ts` had, same fix — this command builds the SAME `createSqliteRouteDeps()` composition
 * root (always wiring a real plugin installDir) and `exportSite()`'s own internal listener runs the
 * SAME `createApp()`-equivalent (`routeDeps.createSiteApp()`), so its crawl is served by a process
 * that mounts the `plugins` module with `registerPluginSdkResolver()` never registered. `tovu export`
 * doesn't itself call the `PLUGIN_SET_ENABLED` route, but the resolver hook is a process-wide,
 * one-time registration (CIC U-002-B1: "before any code path that could reach `loadPlugin()` is
 * wired into the running process") — this process is one such path the instant `createSqliteRouteDeps()`
 * wires a real `installDir`, independent of whether this specific command happens to exercise it.
 * Fixed the same way as `serve.ts`: `registerPluginSdkResolver()` called first, before any other
 * boot step, with no `await` ahead of it.
 *
 * Crash-interrupted-migration scan (2026-09-06 composition-root fix): this command built the SAME
 * `createSqliteRouteDeps()` composition root `serve.ts` does, and `exportSite()`'s own internal
 * listener runs the real `createApp()`-equivalent (`routeDeps.createSiteApp()`) to crawl it — but
 * unlike `serve.ts`, this command never ran `runBootLifecycle`/`buildBootModules` at all, so the
 * `database-migration-reconciliation` scan (`reconcile-interrupted-migration.ts` — detects a
 * crash-interrupted migration and flips `siteStatusRepo` to `BLOCKED_PENDING_RECOVERY`) never ran
 * before an export. A site left mid-migration by a crash could be exported from possibly-inconsistent
 * data with no warning at all. Fixed by calling that same scan directly (not the full
 * `buildBootModules` bundle — that also seeds bundled agent plugins and other optional boot modules
 * with no relationship to exporting, which this command has never done and should not start doing as
 * a side effect of this fix) right after `createSqliteRouteDeps()`, refusing outright
 * (`ExportBlockedPendingRecoveryError`, exit 7) rather than letting the crawl surface the same
 * problem indirectly as N confusing per-route failures.
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
 * BR-EXPORT-01: `--out` flag, then `TOVU_EXPORT_DIR` env, then `<cwd>/infra/export` — first
 * PRESENT value wins, same precedence shape `serve.ts`'s `resolveServePort` already uses for
 * `--port`. Deliberately NOT `<installDir>/infra/export`: the default mirrors `server/deps.ts`'s
 * `mediaUploadsDir()` (`<cwd>/infra/uploads`) because both anchor to the SAME `infra/` Docker
 * volume (`development/docs/deployment/deployment-constraints.md` — `infra/` survives a container
 * restart and is what an operator copies out), not to wherever the install dir happens to live.
 *
 * `exportOutputRootDir` is `RouteDeps.exportOutputRootDir` — this command's own composition root
 * (`createSqliteRouteDeps`, below) resolves the `TOVU_EXPORT_DIR`-env-then-default half of this
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
export async function runExportCommand(input: RunExportCommandInput): Promise<void> {
  // CIC U-002/ADR-005 (ESCALATE_SECURITY) — see this file's header. Placed first, before any other
  // boot step and with no `await` ahead of it, mirroring `index.ts`'s and `serve.ts`'s own ordering.
  registerPluginSdkResolver();

  const target = resolveInstallDirTarget(input.dir);
  const bootResult = bootSiteDir({ dir: target }, { workspaceId: input.workspaceId });

  const dbPath = path.join(target, "content.db");
  const routeDeps = createSqliteRouteDeps(dbPath, {
    db: bootResult.db,
    workspaceId: bootResult.workspaceId,
    uploadsDir: path.join(target, "uploads"),
    // Same install-dir-relative reasoning as `uploadsDir` right above (CR-R01): the default themes
    // root is `process.cwd()`-relative, so without this a `<dir>` run would seed and serve a
    // `sites/tovu-com/themes` beside the operator's shell instead of the site it was given.
    themesDir: path.join(target, "themes"),
  });
  const outputDir = resolveExportOutputDir(input, routeDeps.exportOutputRootDir);

  try {
    // See this file's header. The same CRITICAL check `tovu serve`'s boot lifecycle runs first,
    // before this command ever crawls a route — a site left mid-migration by a crash must never be
    // exported from possibly-inconsistent data.
    const reconciliation = await reconcileInterruptedMigrationOnBoot({
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

    const report = await exportSite({ routeDeps, outputDir, clean: input.clean ?? false, basePath: input.basePath });
    printExportReport(report);
    if (report.routes.failed.length > 0) {
      throw new ExportIncompleteError(
        `export finished with ${report.routes.failed.length} failed route(s) — see stderr above`
      );
    }
  } finally {
    bootResult.db.$client.close();
  }
}
