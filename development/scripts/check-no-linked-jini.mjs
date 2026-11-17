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
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { check } from "@jini-ai/devops/checks/published-types";
import { createNodeFilesystem, createNodeProcessRunner, createNpmInstaller } from "@jini-ai/devops/checks/node";

function readManifest(packageDir) {
  try {
    return JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
}

/** Registry-only release builds reject manifest file: specs as well as npm-link symlinks.
 * A file: dependency is also a symlink, indistinguishable from npm link by lstat alone; that
 * symlink is expected during local development. Release builds now reject its manifest spec
 * before checking installed links. Local iteration remains available through build:local.
 */
function rejectFileSpecs(manifest) {
  const specs = { ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies, ...manifest.devDependencies };
  const local = Object.entries(specs).filter(([name, spec]) => name.startsWith('@jini-ai/') && spec.startsWith('file:'));
  if (local.length) {
    console.error(`Build blocked: @jini-ai/* file: dependencies cannot ship without the sibling checkout:\n${local.map(([name]) => `  - ${name}`).join('\n')}\nUse published ranges for releases; build:local is available for local development.`);
    process.exit(1);
  }
}

const cwd = process.cwd();
const manifest = readManifest(cwd);
if (manifest) {
  rejectFileSpecs(manifest);
  const runner = createNodeProcessRunner({});
  const report = await check({
    projects: [{ key: "build", mode: "links", directory: cwd, manifestPath: path.join(cwd, "package.json") }],
    scope: "@jini-ai", fs: createNodeFilesystem({}), runner, installer: createNpmInstaller({ runner, command: "npm" }),
  });
  const [result] = report.projects;
  if (result.status === "linked") {
    console.error(
      `\nBuild blocked: ${result.linkedPackages.length} @jini-ai/* package(s) are npm-linked in ${process.cwd()}, ` +
        `not installed from the registry:\n` +
        result.linkedPackages.map((name) => `  - ${name}`).join("\n") +
        `\n\nA build against a local Jini checkout only works on this machine. Run ` +
        `\`npm run unlink:jini\` (from the repo root) to restore the published versions, then build ` +
        `again.\n`,
    );
    process.exit(1);
  }
  if (result.status !== "pass") {
    console.error(`\nBuild blocked: could not check ${cwd} for npm-linked @jini-ai/* packages: ${result.output}\n`);
    process.exit(1);
  }
}
