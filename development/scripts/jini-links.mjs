/**
 * What `link-jini.mjs` links and `unlink-jini.mjs` unlinks, in one place so the two can never
 * disagree about which consumers or which packages are involved.
 *
 * Per consumer (root, `apps/admin`, `apps/site-chat`) the package set is its direct `@jini-ai/*`
 * dependencies plus every `@jini-ai/*` npm installed there transitively. A consumer with no direct
 * `@jini-ai/*` dependency is left out entirely.
 */
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..", "..");
export const stateFile = path.join(repoRoot, "development", ".jini-link-state.json");

const CONSUMER_DIRS = [
  repoRoot,
  path.join(repoRoot, "apps", "admin"),
  path.join(repoRoot, "apps", "site-chat"),
];

function jiniDepsOf(consumerDir) {
  const pkg = JSON.parse(readFileSync(path.join(consumerDir, "package.json"), "utf8"));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.keys(allDeps)
    .filter((name) => name.startsWith("@jini-ai/"))
    .map((name) => name.slice("@jini-ai/".length));
}

function installedJiniPackagesIn(scopeDir) {
  try {
    return readdirSync(scopeDir).filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
}

/** `{ dir, scopeDir, direct, names }` per consumer that has a direct `@jini-ai/*` dependency. */
export function jiniConsumers() {
  return CONSUMER_DIRS.map((dir) => {
    const scopeDir = path.join(dir, "node_modules", "@jini-ai");
    const direct = jiniDepsOf(dir);
    const names = [...new Set([...direct, ...installedJiniPackagesIn(scopeDir)])].sort();
    return { dir, scopeDir, direct, names };
  }).filter((consumer) => consumer.direct.length > 0);
}
