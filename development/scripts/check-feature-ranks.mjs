// Node check for the feature rank table (`development/boundaries/feature-ranks.json`).
//
// The `feature-rank:<n>` rules in `.dependency-cruiser.mjs` judge import EDGES, so they cannot see a
// feature folder that has no edges: a new leaf feature, or imports into a folder the table does not
// name, would pass. This check compares the folder list with the table in both directions:
//   - a folder under features/ that holds production code and has no rank  -> error
//   - a rank for a folder that is gone or holds only tests                 -> error (the table cannot rot)
//   - a rank that is not a non-negative integer                            -> error
// A new feature that only imports `platform/` must still be added, at rank 0.
//
//   node development/scripts/check-feature-ranks.mjs <repoRoot> <feature-ranks.json> [--features <dir>]
// Exit 0 = table and tree agree; exit 1 = every difference is listed on stderr.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TEST = /(^|\/)__tests__\/|\.test\.tsx?$/;
const SOURCE = /\.tsx?$/;
const SKIPPED_DIRECTORIES = new Set(["__tests__", "node_modules"]);

function isProductionSource(required, _optional = {}) {
  const { name, relativePath } = required;
  return SOURCE.test(name) && !name.endsWith(".d.ts") && !TEST.test(relativePath);
}

/** True when the folder holds at least one production source file, at any depth. */
function hasProductionCode(required, _optional = {}) {
  const { dir, relativeDir } = required;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      if (hasProductionCode({ dir: path.join(dir, entry.name), relativeDir: relativePath })) return true;
    } else if (isProductionSource({ name: entry.name, relativePath })) return true;
  }
  return false;
}

function staleReason(required, _optional = {}) {
  return required.folders.includes(required.name) ? "folder holds no production code" : "folder does not exist";
}

/** Compares the feature folders that hold production code with the rank table. Returns every difference. */
export function checkFeatureRanks(required, _optional = {}) {
  const { featuresDir, ranks } = required;
  const folders = fs.readdirSync(featuresDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const production = folders.filter((name) => hasProductionCode({ dir: path.join(featuresDir, name), relativeDir: "" }));
  const problems = [];
  for (const name of production) {
    if (!Object.hasOwn(ranks, name)) problems.push(`unranked feature: ${name} (add it to ${required.tableName ?? "the rank table"})`);
  }
  for (const [name, rank] of Object.entries(ranks)) {
    if (!production.includes(name)) problems.push(`stale rank entry: ${name} (${staleReason({ folders, name })})`);
    if (!Number.isInteger(rank) || rank < 0) problems.push(`bad rank for ${name}: ${JSON.stringify(rank)} (a rank is a non-negative integer)`);
  }
  return { production: production.length, problems };
}

function main(required, _optional = {}) {
  const [repoRoot, ranksFile, ...rest] = required.argv;
  if (!repoRoot || !ranksFile) {
    console.error("usage: node check-feature-ranks.mjs <repoRoot> <feature-ranks.json> [--features <dir>]");
    return 2;
  }
  const featuresRelative = rest[0] === "--features" ? rest[1] : "apps/website/src/features";
  const ranks = JSON.parse(fs.readFileSync(ranksFile, "utf8"));
  const result = checkFeatureRanks({ featuresDir: path.join(repoRoot, featuresRelative), ranks, tableName: ranksFile });
  for (const problem of result.problems) console.error(problem);
  console.log(`${result.production} feature folders with production code; ${result.problems.length} problem(s)`);
  return result.problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main({ argv: process.argv.slice(2) }));
}
