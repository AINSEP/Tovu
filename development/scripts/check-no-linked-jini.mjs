/**
 * Guard wired into every `build` script (root `package.json`, `apps/admin/package.json`,
 * `apps/site-chat/package.json`): fails the build if any `@jini-ai/*` package under
 * `<cwd>/node_modules` is an `npm link` symlink rather than a real registry install. A build made
 * against a linked local Jini checkout (see `link-jini.mjs`) only resolves on the machine that ran
 * `npm link` — it can't be reproduced by `npm install` on a clean clone or in CI, so it must never
 * ship.
 *
 * Checks the real filesystem rather than trusting `.jini-link-state.json` (the marker
 * `link-jini.mjs`/`unlink-jini.mjs` maintain): that marker only reflects the last time those
 * scripts ran, and can go stale after a manual `npm link`/`npm unlink` or a `git clean`. An
 * `npm link`-managed dependency is always a symlink in `node_modules`, so `lstat` is ground truth.
 *
 * Relies on being run with `cwd` set to the package whose build it's guarding — `build` scripts
 * invoke this via a relative path (e.g. `node ../../development/scripts/check-no-linked-jini.mjs`
 * from `apps/admin`), and npm always runs package scripts with `cwd` at that package's own
 * directory, so no explicit target argument is needed.
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

/**
 * A `file:` dependency is ALSO installed as a symlink, indistinguishable by `lstat` from an
 * `npm link`. So a symlink alone is not the defect — it is only wrong when the manifest says the
 * package should have come from the registry. While a dep is still declared `file:`, a symlink is
 * exactly what npm is supposed to produce, and blocking on it would break every build.
 */
function registryDependencyNames(packageDir) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
  } catch {
    return new Set();
  }
  const specs = { ...manifest.dependencies, ...manifest.devDependencies };
  const names = Object.entries(specs)
    .filter(([name, spec]) => name.startsWith("@jini-ai/") && !spec.startsWith("file:"))
    .map(([name]) => name.slice("@jini-ai/".length));
  return new Set(names);
}

function findLinkedPackages(scopeDir, fromRegistry) {
  let entries;
  try {
    entries = readdirSync(scopeDir);
  } catch {
    return [];
  }
  return entries.filter(
    (name) => fromRegistry.has(name) && lstatSync(path.join(scopeDir, name)).isSymbolicLink(),
  );
}

const scopeDir = path.join(process.cwd(), "node_modules", "@jini-ai");
const linked = findLinkedPackages(scopeDir, registryDependencyNames(process.cwd()));

if (linked.length > 0) {
  console.error(
    `\nBuild blocked: ${linked.length} @jini-ai/* package(s) are npm-linked in ${process.cwd()}, ` +
      `not installed from the registry:\n` +
      linked.map((name) => `  - @jini-ai/${name}`).join("\n") +
      `\n\nA build against a local Jini checkout only works on this machine. Run ` +
      `\`npm run unlink:jini\` (from the repo root) to restore the published versions, then build ` +
      `again.\n`,
  );
  process.exit(1);
}
