import fs from "node:fs";
import path from "node:path";

import { stripComments } from "#src/platform/db/kernel/__tests__/raw-sqlite-scan";

/**
 * @file The scanner behind `no-deploy-vendor-in-core.boundary.test.ts`: which core files still
 * name a static-hosting vendor, how many times per vendor, with comments blanked out first.
 *
 * Hosting-vendor knowledge lives in the `deploy` Agent Plugin (`content/agent-plugins/deploy/`,
 * plan `ADS-memory/reports/2026-09-29-deploy-agent-plugin-plan.md` T7/T8). Core reads target ids
 * from the plugin's descriptors, so a vendor id, host name or API origin spelled in core is a
 * branch the plugin did not absorb.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../../..");
export const BASELINE_PATH = path.join(import.meta.dirname, "deploy-vendor-baseline.json");

/** The core surfaces the plan's T7 boundary names. Directory entries end in `/`. */
const SCAN_ROOTS: readonly string[] = [
  "apps/website/src/features/deployments/",
  "apps/website/src/features/site-export/",
  "apps/website/src/features/vendor-credentials/",
  "apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts",
  "apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts",
  "apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts",
  "apps/admin/src/features/deployment/",
  "apps/admin/src/lib/api.ts",
];

/** One rule per vendor, matched case-insensitively on code and string text only. */
const RULES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "netlify", pattern: /netlify/gi },
  { id: "vercel", pattern: /vercel/gi },
  { id: "cloudflare", pattern: /cloudflare|pages\.dev/gi },
  { id: "github-pages", pattern: /github[-_ ]?pages|github\.io/gi },
  { id: "s3-compatible", pattern: /s3[-_ ]?compatible|amazonaws|backblaze|wasabi|digitaloceanspaces/gi },
];

/** Cheap pre-filter: a file with no raw match cannot have one after comments are removed. */
const ANY_RULE = new RegExp(RULES.map((rule) => rule.pattern.source).join("|"), "i");

export type Counts = Record<string, Record<string, number>>;

function listSourceFiles(entry: string): string[] {
  const full = path.join(REPO_ROOT, entry);
  if (!fs.existsSync(full)) return [];
  if (!entry.endsWith("/")) return [full];
  const out: string[] = [];
  for (const child of fs.readdirSync(full, { withFileTypes: true })) {
    if (["node_modules", "dist", "__tests__", "__fixtures__"].includes(child.name)) continue;
    if (child.isDirectory()) {
      out.push(...listSourceFiles(`${entry}${child.name}/`));
      continue;
    }
    if (!/\.(ts|tsx|mts|cts)$/.test(child.name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(child.name) || child.name.endsWith(".d.ts")) continue;
    out.push(path.join(full, child.name));
  }
  return out;
}

/** Per-vendor hit counts in already comment-stripped text; vendors with no hit are omitted. */
export function countDeployVendors(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rule of RULES) {
    const hits = text.match(rule.pattern)?.length ?? 0;
    if (hits > 0) counts[rule.id] = hits;
  }
  return counts;
}

/** Every scanned file that names a vendor outside comments, keyed by repo-relative path. */
export function scanDeployVendors(): Counts {
  const found: Counts = {};
  for (const root of SCAN_ROOTS) {
    for (const file of listSourceFiles(root)) {
      const text = fs.readFileSync(file, "utf8");
      if (!ANY_RULE.test(text)) continue;
      const counts = countDeployVendors(stripComments(file, text));
      if (Object.keys(counts).length > 0) found[path.relative(REPO_ROOT, file).split(path.sep).join("/")] = counts;
    }
  }
  return found;
}

export function sortedCounts(counts: Counts): Counts {
  const out: Counts = {};
  for (const file of Object.keys(counts).sort()) {
    out[file] = {};
    for (const rule of Object.keys(counts[file]!).sort()) out[file]![rule] = counts[file]![rule]!;
  }
  return out;
}
