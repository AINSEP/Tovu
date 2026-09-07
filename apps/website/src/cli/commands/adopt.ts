import fs from "node:fs";
import path from "node:path";

import { SiteDirInvalidError } from "../../platform/site-dir/index.js";
import { readSiteDir } from "../../platform/site-dir/read-site-dir.js";
import {
  classifySiteMarkers,
  planRepairSite,
  repairSite,
  SiteRepairRefusedError,
  CONTENT_DB_FILE_NAME,
  type SiteMarkerClassification,
  type SiteRepairPlan,
} from "../../platform/site-dir/repair-site.js";
import { resolveInstallDirTarget } from "../../platform/site-dir/resolve-install-dir-target.js";

/**
 * @file `CLI_ADOPT` — `tovu adopt <dir>`: give an EXISTING, working-but-marker-less site directory
 * the `config.json` + `.site-meta.json` pair `tovu serve` requires, without touching its database.
 *
 * WHY A SEPARATE VERB RATHER THAN AN EXTENSION OF `init`. `tovu init` is empty-folder-only by
 * contract (`initSite`'s `validateInitTarget`, AC-04/EC-01/EC-02) and its whole cleanup discipline
 * (`cleanupAndRethrow`, which `fs.rmSync`s the entire target) is built on the assumption that it
 * created that directory itself. Teaching `init` to accept a populated directory would silently
 * change what an existing command does to an operator's real data — the one thing this repo's own
 * rules forbid. A separate verb is discoverable (`--help`, `introspect`), independently testable,
 * and cannot regress `init`.
 *
 * WHY THE COMMAND EXISTS AT ALL. `tovu serve` -> `bootSiteDir` calls `readSiteDir` unconditionally
 * and throws `SiteDirInvalidError` when either marker is missing — BEFORE `content.db` is opened.
 * That is load-bearing, not an oversight: `.site-meta.json` carries `{schemaVersion, schemaTag}`,
 * which `compareSchemaVersion` uses to refuse a site whose schema is newer than or divergent from
 * this runtime's. The other boot path (`npm run dev` -> `src/index.ts`) never calls `bootSiteDir` at
 * all and opens `content.db` by path, which is exactly why a directory can serve fine in dev and
 * still be rejected by the CLI/desktop path. The fix belongs here, in the CLI — never in the
 * classifier.
 *
 * DERIVE, NEVER GUESS. Every value stamped into `.site-meta.json` that a guard later trusts is read
 * out of the database's own `__drizzle_migrations` history (`readAppliedSchemaIdentity`, via
 * `repair-site.ts`), matched back to this runtime's bundled journal. If it cannot be derived, this
 * command REFUSES: a wrong `schemaVersion` would make `serve` skip a migration the database still
 * needs, silently, so a bad adopt is strictly worse than no adopt. `templateId`/`templateVersion`
 * are the only fields not derived, and they are stamped honestly as unknown rather than guessed at
 * `"starter"` — `bootSiteDir`'s own EC-07 already treats an unrecognized `templateId` as
 * provenance-only.
 *
 * Architectural role:
 * `cli` layer. Formats stdout and classifies the marker pair; every write and every derivation is
 * `site-dir`'s (`repairSite`/`planRepairSite`). Like `serve.ts`/`init.ts` it never maps errors to
 * exit codes itself — that is `cli/errors.ts`'s job, which is where `SiteRepairRefusedError`'s
 * reason-to-exit-code mapping lives.
 */

export interface RunAdoptCommandInput {
  dir: string;
  name?: string;
  dryRun?: boolean;
}

/**
 * The refusal text for a half-adopted directory. `planRepairSite` collapses this case into its
 * `MARKER_ALREADY_EXISTS` refusal together with the fully-adopted one; the two need OPPOSITE
 * outcomes at the CLI (a complete pair is an idempotent no-op, a partial pair is a hard refusal),
 * so this command tells them apart itself and raises the more specific error for the partial case.
 *
 * `SiteDirInvalidError` (exit 3) is the right class, not a new one: a directory carrying one marker
 * and not the other IS an invalid site dir, and it is the exact error `serve` already answers with
 * for the same directory.
 */
function partiallyAdoptedError(target: string, markers: SiteMarkerClassification): SiteDirInvalidError {
  return new SiteDirInvalidError(
    `adopt: refusing — ${target} is partially adopted: ${markers.present.join(" and ")} is present but ${markers.missing.join(" and ")} is missing. ` +
      `Adopt never completes or overwrites a partial marker set — the present marker may carry a schema stamp this command cannot verify. ` +
      `Restore the missing file from backup, or remove the present one and re-run 'tovu adopt'.`
  );
}

/**
 * Sibling `*.db` files, named in the "no content.db here" refusal so an operator can see exactly
 * what adopt found and that it declined to pick one. Adopt does not guess which database is the
 * site's: `bootSiteDir` opens `content.db` by that literal name, so adopting any other file would
 * produce a directory that passes adopt and then fails to serve.
 *
 * @complexity O(n) in the target directory's entry count — one `readdirSync`.
 */
function describeDatabaseCandidates(target: string): string {
  const candidates = fs
    .readdirSync(target)
    .filter((name) => name.endsWith(".db") && name !== CONTENT_DB_FILE_NAME)
    .sort();
  if (candidates.length === 0) return "";
  return ` — this directory does contain ${candidates.join(", ")}, which adopt will not guess at: rename the right one to ${CONTENT_DB_FILE_NAME} and re-run.`;
}

/**
 * Run `site-dir`'s refusal-checked planning/writing, re-labelling its `repairSite:` message prefix
 * as `adopt:` (the name the operator actually typed) and, for the "no database" refusal only,
 * appending {@link describeDatabaseCandidates}'s list. The reason code is carried through unchanged
 * so `cli/errors.ts` still maps the exit code from the reason, never from the message text.
 */
function asAdoptRefusal<T>(target: string, run: () => T): T {
  try {
    return run();
  } catch (err) {
    if (!(err instanceof SiteRepairRefusedError)) throw err;
    const relabelled = err.message.replace(/^repairSite: /, "adopt: ");
    const suffix = err.reason === "CONTENT_DB_MISSING" ? describeDatabaseCandidates(target) : "";
    throw new SiteRepairRefusedError(`${relabelled}${suffix}`, err.reason);
  }
}

/** The two derived-stamp lines both the dry run and the real run print, so the preview an operator
 *  approves and the result they get are rendered by one formatter and cannot drift apart. */
function markerLines(name: string, schemaVersion: number, schemaTag: string): string {
  return `  config.json      name='${name}'\n  .site-meta.json  schemaVersion=${schemaVersion} schemaTag=${schemaTag}\n`;
}

/**
 * `--dry-run`: print exactly what would be written and write nothing. Deliberately does NOT print a
 * `siteId` — `.site-meta.json`'s `siteId` is a fresh `randomUUID()` generated at write time, so any
 * value shown here would differ from the one the real run writes, and a preview that shows a value
 * the operator will never see on disk is worse than one that omits it.
 */
function printDryRun(plan: SiteRepairPlan): void {
  process.stdout.write(`dry run — nothing was written\n`);
  process.stdout.write(`would adopt site '${plan.config.name}' at ${plan.dir}\n`);
  process.stdout.write(markerLines(plan.config.name, plan.meta.schemaVersion, plan.meta.schemaTag));
  process.stdout.write(`run again without --dry-run to write these two files\n`);
}

/**
 * Run `tovu adopt <dir> [--name] [--dry-run]`.
 *
 * Three outcomes beyond the refusals: a directory with NEITHER marker is adopted (or previewed);
 * a directory with BOTH is an idempotent no-op that exits 0 without rewriting either file (so a
 * re-run never churns `siteId`/`createdAt`); a directory with exactly one is refused.
 *
 * @throws {SiteDirInvalidError} the directory is partially adopted.
 * @throws {SiteRepairRefusedError} `site-dir` refused to derive a stamp — not a directory, no
 *   `content.db`, a `content.db` that was never migrated, or a divergent lineage. `cli/errors.ts`
 *   maps each reason to its exit code.
 * @throws {ValidationError} an invalid `--name`.
 * @complexity O(1) beyond `repairSite`/`planRepairSite`'s own bounded cost.
 */
export async function runAdoptCommand(input: RunAdoptCommandInput): Promise<void> {
  const target = resolveInstallDirTarget(input.dir);
  const markers = classifySiteMarkers(target);

  if (markers.state === "complete") {
    process.stdout.write(`already adopted: ${target} already has ${markers.present.join(" and ")} — nothing to do\n`);
    return;
  }
  if (markers.state === "partial") {
    throw partiallyAdoptedError(target, markers);
  }

  if (input.dryRun === true) {
    printDryRun(asAdoptRefusal(target, () => planRepairSite({ dir: target, name: input.name })));
    return;
  }

  const result = asAdoptRefusal(target, () => repairSite({ dir: target, name: input.name }));
  // Read the ACTUAL written config.json back rather than re-deriving the name here, so the printed
  // name can never drift from what was really written (same discipline `runInitCommand` uses).
  const { config } = readSiteDir({ dir: result.dir });
  process.stdout.write(`adopted site '${config.name}' at ${result.dir}\n`);
  process.stdout.write(markerLines(config.name, result.schemaVersion, result.schemaTag));
  process.stdout.write(`  siteId=${result.siteId}\n`);
  process.stdout.write(`the database at ${path.join(result.dir, CONTENT_DB_FILE_NAME)} was not modified\n`);
  process.stdout.write(`next: tovu serve ${result.dir}\n`);
}
