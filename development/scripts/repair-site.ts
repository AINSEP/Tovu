/**
 * @file Operator tool: writes correct `config.json` + `.site-meta.json` marker files into an
 * EXISTING site directory that predates that convention (e.g. this repo's own
 * `apps/website/sites/tovu-com/`), so `listSites`/`tovu serve` recognize it exactly as they would a
 * freshly `tovu init`'d site (`site-registry.ts`'s own header names this exact gap).
 *
 * All real logic lives in `apps/website/src/platform/site-dir/repair-site.ts` — this file is a thin
 * argv/stdout wrapper, same shape as the `backfill-*.ts` family (`backfill-custom-credential-
 * usernames.ts`'s own header is the template for the dry-run/`--apply` split below).
 *
 * ## Why this never guesses the schema stamp
 *
 * `.site-meta.json`'s `{schemaVersion, schemaTag}` is compared against this runtime's bundled
 * migration identity BEFORE `tovu serve` ever opens the database — stamping the wrong version is
 * worse than no stamp at all, since a wrong "compatible" stamp would make `serve` silently skip a
 * migration the database still needs. `repairSite` derives the stamp from the database's OWN applied
 * `__drizzle_migrations` history instead (`read-applied-schema-identity.ts`), and REFUSES outright —
 * see `repair-site.ts`'s own header — when that history is missing, absent, or diverges from what
 * this runtime bundles.
 *
 * ## Safety
 *
 * Read-only with respect to `content.db` end to end (`repairSite`/`planRepairSite` only ever open it
 * via `openContentDbReadOnly`). Never overwrites an existing marker file. Dry-run by default — prints
 * the plan `repairSite` would execute without writing anything; `--apply` is required to actually
 * write the two marker files.
 *
 * ## Usage
 *
 *   npx tsx development/scripts/repair-site.ts --dir apps/website/sites/tovu-com               (dry run)
 *   npx tsx development/scripts/repair-site.ts --dir apps/website/sites/tovu-com --apply
 *   npx tsx development/scripts/repair-site.ts --dir apps/website/sites/tovu-com --name "Tovu" --apply
 *
 * `--dir` is resolved relative to the repo root when not absolute. `--name` is optional (defaults to
 * the target directory's basename, same default `tovu init` itself uses).
 *
 * Exit codes: `0` on success, including a dry run; `1` if the repair is refused, or any other error.
 */
import path from "node:path";

import { planRepairSite, repairSite, SiteRepairRefusedError } from "../../apps/website/src/platform/site-dir/repair-site.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

interface Args {
  readonly dir: string;
  readonly name: string | undefined;
  readonly apply: boolean;
}

/**
 * @throws `Error` when `--dir` is missing — a script with no target directory has nothing to do,
 *   and silently defaulting to some path (the way `backfill-db-path.ts`'s own header describes as a
 *   past defect for a DIFFERENT script) is exactly the failure mode this repo's backfill scripts
 *   already learned not to repeat.
 */
function parseArgs(argv: readonly string[]): Args {
  const dirFlag = argv.indexOf("--dir");
  if (dirFlag === -1 || argv[dirFlag + 1] === undefined) {
    throw new Error("repair-site: --dir <site-dir> is required (e.g. --dir apps/website/sites/tovu-com)");
  }
  const nameFlag = argv.indexOf("--name");
  if (nameFlag !== -1 && argv[nameFlag + 1] === undefined) {
    throw new Error("repair-site: --name requires a value");
  }
  return {
    dir: path.resolve(REPO_ROOT, argv[dirFlag + 1]),
    name: nameFlag === -1 ? undefined : argv[nameFlag + 1],
    apply: argv.includes("--apply"),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args.apply) {
    const plan = planRepairSite({ dir: args.dir, name: args.name });
    console.log(`DRY RUN — repairSite would write into ${plan.dir}:`);
    console.log(`  config.json      -> ${JSON.stringify(plan.config)}`);
    console.log(`  .site-meta.json  -> ${JSON.stringify(plan.meta)}`);
    console.log("Re-run with --apply to actually write these two files. Nothing was written.");
    return;
  }

  const result = repairSite({ dir: args.dir, name: args.name });
  console.log(`Repaired site at ${result.dir}`);
  console.log(`  siteId=${result.siteId} schemaVersion=${result.schemaVersion} schemaTag=${result.schemaTag}`);
  console.log("config.json and .site-meta.json are now written — listSites()/tovu serve will recognize this directory.");
}

try {
  main();
} catch (err) {
  if (err instanceof SiteRepairRefusedError) {
    console.error(`REFUSED (${err.reason}): ${err.message}`);
  } else {
    console.error(err instanceof Error ? err.message : String(err));
  }
  process.exitCode = 1;
}
