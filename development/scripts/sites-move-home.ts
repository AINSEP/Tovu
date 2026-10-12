/** Operator-invoked only. Dry-run performs no stop, mkdir, lock cleanup, registry write or move. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { moveSitesHome } from "../../apps/website/src/platform/site-dir/move-sites-home.js";
export { moveSitesHome, planSitesMove, inspectStoppedDatabase, assertDatabaseStopped } from "../../apps/website/src/platform/site-dir/move-sites-home.js";
export type { SitesMovePorts, MovePlan } from "../../apps/website/src/platform/site-dir/move-sites-home.js";
/** Parse this mover's flags without performing discovery or I/O.
 * @returns Dry-run/apply mode, help mode and repeatable checkout folder names (empty means all).
 * @throws TypeError for unknown flags, positional arguments or missing site values.
 * @example parseSitesMoveArgs({ argv: ["--site", "tovu-dev", "--site", "luvira"] });
 * @complexity O(a) time and space for a argument tokens.
 */
export function parseSitesMoveArgs({ argv }: { argv: string[] }, _options = {}): { apply: boolean; help: boolean; sites: string[] } {
  const { values } = parseArgs({ args: argv, options: {
    apply: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
    site: { type: "string", multiple: true, default: [] },
  } });
  return { apply: values.apply, help: values.help, sites: values.site };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseSitesMoveArgs({ argv: process.argv.slice(2) });
  if (args.help) {
    console.log(`Usage: npm run sites:move-home -- [--apply] [--site <name>]... [--help]

Move checkout and old Documents/Tovu/<site> folders to Documents/Tovu/sites/<site> (or the configured home).
Default: all sites, dry run only. Dot-folders and folders without config.json are skipped.

Flags:
  --apply         Move sites; refuses running sites and keeps database backups.
  --site <name>   Limit to this site folder name; repeat to include more sites.
  --help, -h      Show this usage without planning or moving sites.`);
  } else {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const plans = await moveSitesHome({ repoRoot }, { apply: args.apply, sites: args.sites,
      onSkipped: ({ dir }) => console.log(`${dir}: skipped (not a site)`),
    });
    for (const plan of plans) console.log(`${args.apply ? "Moved" : "Would move"}: ${plan.from} -> ${plan.to}`);
    if (!args.apply) console.log("Dry run only. Stop every site (including npm run dev) first; --apply refuses running sites and keeps database backups.");
  }
}
