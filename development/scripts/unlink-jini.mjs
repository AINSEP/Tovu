/**
 * `npm run unlink:jini` — reverse `link-jini.mjs`. Removes the `npm link` symlink for every
 * `@jini-ai/*` package under each consumer's `node_modules` (root, `apps/admin`,
 * `apps/site-chat`), then runs `npm install` in each so the registry-published version pinned in
 * that consumer's `package.json`/lockfile is reinstalled in its place.
 *
 * Re-derives the linked-package list fresh from the three `package.json` files on every run
 * (same logic as `link-jini.mjs`'s `jiniDepsOf`) rather than trusting `.jini-link-state.json`'s
 * contents — that marker can go stale (a manual `npm link` afterward, or a `git clean` that leaves
 * it behind), so this works even if the marker is missing or wrong. The marker is still deleted at
 * the end, as cleanup.
 *
 * Deletes the symlink directly (`rm`) rather than running `npm unlink <pkg>`: `npm unlink` run
 * inside a consuming project is an alias for `npm uninstall`, which would drop the dependency from
 * `package.json` entirely — the opposite of what "restore the published version" means here.
 * Removing just the `node_modules` symlink and reinstalling is the safe equivalent.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const stateFile = path.join(repoRoot, "development", ".jini-link-state.json");

const CONSUMER_DIRS = [
  repoRoot,
  path.join(repoRoot, "apps", "admin"),
  path.join(repoRoot, "apps", "site-chat"),
];

function jiniDepsOf(consumerDir) {
  const pkg = JSON.parse(readFileSync(path.join(consumerDir, "package.json"), "utf8"));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.keys(allDeps).filter((name) => name.startsWith("@jini-ai/"));
}

function run(cmd, args, cwd) {
  console.log(`$ (${path.relative(repoRoot, cwd) || "."}) ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

const consumers = CONSUMER_DIRS.map((dir) => ({ dir, deps: jiniDepsOf(dir) })).filter(
  (consumer) => consumer.deps.length > 0,
);

for (const consumer of consumers) {
  for (const specifier of consumer.deps) {
    const linkPath = path.join(consumer.dir, "node_modules", specifier);
    rmSync(linkPath, { recursive: true, force: true });
  }
  run("npm", ["install"], consumer.dir);
}

if (existsSync(stateFile)) {
  rmSync(stateFile);
}

console.log("\nUnlinked. Registry-published @jini-ai/* versions restored.\n");
