/**
 * `npm run unlink:jini` — reverse `link-jini.mjs`. Removes every symlink `link-jini.mjs` can have
 * made — the direct `@jini-ai/*` dependencies AND the transitive ones — from each consumer's
 * `node_modules/@jini-ai` (root, `apps/admin`, `apps/site-chat`), then runs `npm install` in each
 * so the registry-published version pinned in that consumer's `package.json`/lockfile is
 * reinstalled in its place.
 *
 * The package set comes from `jini-links.mjs`, the same function `link-jini.mjs` uses, re-derived
 * fresh on every run rather than read from `.jini-link-state.json` — that marker can go stale (a
 * manual `npm link` afterward, or a `git clean` that leaves it behind). Any symlink in that set is
 * removed wherever it points, dangling ones included; a registry install is a real directory and
 * is never touched. The marker is still deleted at the end, as cleanup.
 *
 * Deletes the symlink directly rather than running `npm unlink <pkg>`: `npm unlink` run inside a
 * consuming project is an alias for `npm uninstall`, which would drop the dependency from
 * `package.json` entirely — the opposite of what "restore the published version" means here.
 *
 * `--dry-run` prints, per location, what it would remove and changes nothing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readlinkSync, rmSync, unlinkSync } from "node:fs";
import * as path from "node:path";

import { jiniConsumers, repoRoot, stateFile } from "./jini-links.mjs";

const dryRun = process.argv.includes("--dry-run");

function isSymlink(linkPath) {
  try {
    return lstatSync(linkPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function run(cmd, args, cwd) {
  console.log(`$ (${path.relative(repoRoot, cwd) || "."}) ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

let removed = 0;
for (const consumer of jiniConsumers()) {
  const where = path.relative(repoRoot, consumer.dir) || ".";
  console.log(`\n${where}:`);
  for (const name of consumer.names) {
    const linkPath = path.join(consumer.scopeDir, name);
    if (!isSymlink(linkPath)) continue;
    console.log(`  ${dryRun ? "would " : ""}unlink ${name} (-> ${readlinkSync(linkPath)})`);
    removed += 1;
    if (!dryRun) unlinkSync(linkPath);
  }
  if (dryRun) console.log(`  would run npm install in ${where}`);
  else run("npm", ["install"], consumer.dir);
}

if (dryRun) {
  console.log(`\nDry run: ${removed} link(s) would be removed. Nothing written.\n`);
  process.exit(0);
}

if (existsSync(stateFile)) {
  rmSync(stateFile);
}

console.log(`\nUnlinked ${removed} link(s). Registry-published @jini-ai/* versions restored.\n`);
