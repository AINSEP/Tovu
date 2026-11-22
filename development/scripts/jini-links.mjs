/**
 * What `link-jini.mjs` links and `unlink-jini.mjs` unlinks, in one place so the two can never
 * disagree about which consumers or which packages are involved.
 *
 * Per consumer (the repo root plus every directory under `apps/`) the package set is its direct
 * `@jini-ai/*` dependencies plus every `@jini-ai/*` npm installed there transitively. A consumer
 * with no direct `@jini-ai/*` dependency is left out entirely.
 *
 * The apps are discovered, not listed: a hard-coded list silently skipped `apps/desktop` once, so
 * its gates ran against registry copies of `@jini-ai/*` and failed with
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`, and any app added later would have repeated that.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..", "..");
export const stateFile = path.join(repoRoot, "development", ".jini-link-state.json");

/** The repo root plus every `apps/<name>` that has a `package.json`, in name order. */
function consumerDirs({ root }) {
  const appsDir = path.join(root, "apps");
  const apps = readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(appsDir, entry.name, "package.json")))
    .map((entry) => path.join(appsDir, entry.name))
    .sort();
  return [root, ...apps];
}

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
export function jiniConsumers({ root }, _optional = {}) {
  return consumerDirs({ root }).map((dir) => {
    const scopeDir = path.join(dir, "node_modules", "@jini-ai");
    const direct = jiniDepsOf(dir);
    const names = [...new Set([...direct, ...installedJiniPackagesIn(scopeDir)])].sort();
    return { dir, scopeDir, direct, names };
  }).filter((consumer) => consumer.direct.length > 0);
}
