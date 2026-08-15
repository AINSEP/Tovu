import path from "node:path";

import { createSqliteRouteDeps } from "../../server/deps";
import { exportSite, type ExportReport } from "../../export";
import { bootSiteDir } from "../../site-dir/boot-site-dir";
import { resolveInstallDirTarget } from "../../site-dir/resolve-install-dir-target";
import { ExportIncompleteError } from "../errors";

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
 */

export interface RunExportCommandInput {
  dir: string;
  out?: string;
  workspaceId?: string;
  clean?: boolean;
}

/**
 * BR-EXPORT-01: `--out` flag, then `TOVU_EXPORT_DIR` env, then `<cwd>/infra/export` — first
 * PRESENT value wins, same precedence shape `serve.ts`'s `resolveServePort` already uses for
 * `--port`. Deliberately NOT `<installDir>/infra/export`: the default mirrors `server/deps.ts`'s
 * `mediaUploadsDir()` (`<cwd>/infra/uploads`) because both anchor to the SAME `infra/` Docker
 * volume (`development/docs/deployment/deployment-constraints.md` — `infra/` survives a container
 * restart and is what an operator copies out), not to wherever the install dir happens to live.
 */
function resolveExportOutputDir(input: RunExportCommandInput): string {
  if (input.out !== undefined) return path.resolve(input.out);
  if (process.env.TOVU_EXPORT_DIR !== undefined) return path.resolve(process.env.TOVU_EXPORT_DIR);
  return path.resolve(process.cwd(), "infra", "export");
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
}

/**
 * Run `tovu export <dir> [--out] [--workspace] [--clean]`: validate/migrate/stamp the install dir
 * exactly like `serve` does, then export its public site to a folder of static files.
 *
 * @throws whatever `bootSiteDir` throws (`SiteDirInvalidError`, `SiteNewerThanRuntimeError`,
 *   `SiteCorruptError`), `ExportOutputNotEmptyError` (non-empty `--out` without `--clean`), or
 *   `ExportIncompleteError` (the export ran but at least one route failed to render) —
 *   `cli/main.ts` maps each to the correct exit code.
 * @complexity O(1) beyond `bootSiteDir`'s and `exportSite`'s own bounded costs.
 */
export async function runExportCommand(input: RunExportCommandInput): Promise<void> {
  const target = resolveInstallDirTarget(input.dir);
  const bootResult = bootSiteDir({ dir: target }, { workspaceId: input.workspaceId });
  const outputDir = resolveExportOutputDir(input);

  const dbPath = path.join(target, "content.db");
  const routeDeps = createSqliteRouteDeps(dbPath, {
    db: bootResult.db,
    workspaceId: bootResult.workspaceId,
    uploadsDir: path.join(target, "uploads"),
  });

  try {
    const report = await exportSite({ routeDeps, outputDir, clean: input.clean ?? false });
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
