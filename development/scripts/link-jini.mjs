/**
 * `npm run link:jini` — link every `@jini-ai/*` dependency across Tovu's three package.json files
 * (root, `apps/admin`, `apps/site-chat`) to a local Jini checkout via `npm link`, so editing Jini
 * and rebuilding it shows up in Tovu immediately, without publishing a version or touching the
 * committed npm version ranges in any of those files. Machine-specific and leaves no repo
 * footprint: the only file it writes, `.jini-link-state.json`, is gitignored.
 *
 * Expects Jini's packages directory at `JINI_PACKAGES_DIR` (default
 * `~/Programming/Jini/packages`) — override the env var for a different checkout location.
 *
 * Two-step `npm link`, per npm's own model: (1) `npm link`, run *inside* each Jini package,
 * registers it in npm's global link store; (2) `npm link @jini-ai/<name> ...`, run *inside* each
 * Tovu consumer, replaces that consumer's `node_modules/@jini-ai/<name>` with a symlink into the
 * global entry. Neither step edits `package.json` — only `node_modules` changes.
 *
 * Companion: `unlink-jini.mjs` reverses this. `check-no-linked-jini.mjs`, wired into every `build`
 * script, fails the build while any of these links are active, so a linked checkout can never ship
 * silently.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const jiniPackagesDir =
  process.env.JINI_PACKAGES_DIR || path.join(os.homedir(), "Programming", "Jini", "packages");
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

const uniquePackageNames = [...new Set(consumers.flatMap((consumer) => consumer.deps))].map(
  (specifier) => specifier.replace("@jini-ai/", ""),
);

const missing = uniquePackageNames.filter(
  (name) => !existsSync(path.join(jiniPackagesDir, name)),
);
if (missing.length > 0) {
  console.error(
    `\nMissing local Jini package(s) under ${jiniPackagesDir}: ${missing.join(", ")}\n` +
      `Set JINI_PACKAGES_DIR if Jini lives somewhere else.\n`,
  );
  process.exit(1);
}

for (const name of uniquePackageNames) {
  run("npm", ["link"], path.join(jiniPackagesDir, name));
}

for (const consumer of consumers) {
  run("npm", ["link", ...consumer.deps], consumer.dir);
}

writeFileSync(
  stateFile,
  JSON.stringify(
    {
      linkedAt: new Date().toISOString(),
      jiniPackagesDir,
      consumers: consumers.map((consumer) => ({
        dir: path.relative(repoRoot, consumer.dir) || ".",
        packages: consumer.deps,
      })),
    },
    null,
    2,
  ),
);

console.log(
  `\nLinked ${uniquePackageNames.length} @jini-ai/* package(s) from ${jiniPackagesDir}.\n` +
    `Builds are blocked while linked (check-no-linked-jini.mjs) — run \`npm run unlink:jini\` ` +
    `before building for real.\n`,
);
