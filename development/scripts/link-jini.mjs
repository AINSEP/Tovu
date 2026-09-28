/**
 * `npm run link:jini` — point every `@jini-ai/*` package in Tovu's three `node_modules` trees
 * (root, `apps/admin`, `apps/site-chat`) at a local Jini checkout, so editing Jini and rebuilding
 * it shows up in Tovu immediately, without publishing a version or touching the committed npm
 * version ranges in any package.json. Machine-specific and leaves no repo footprint: the only file
 * it writes, `.jini-link-state.json`, is gitignored.
 *
 * Expects Jini's packages directory at `JINI_PACKAGES_DIR` (default
 * `~/Programming/Jini/packages`) — override the env var for a different checkout location.
 *
 * Creates the symlinks directly instead of running `npm link`. `npm link @jini-ai/<name>` rewrites
 * the direct dependency's spec to `file:<path>` in the in-memory tree, and npm then rejects any
 * `overrides` entry keyed on that package (the root's `"@jini-ai/chat@^0.3.9"` rule) with
 * `EOVERRIDE: Override for @jini-ai/chat@file:… conflicts with direct dependency`. Those overrides
 * are what release builds (Docker, published typecheck) resolve through, so they stay; this
 * script just never asks npm to reconcile them.
 *
 * Per consumer it links the direct `@jini-ai/*` dependencies plus any `@jini-ai/*` npm installed
 * there as a transitive dependency, so no registry copy is left beside the linked ones. Links are
 * relative (`../../../Jini/packages/<name>`, as npm writes them). Idempotent: a correct link is
 * left alone; a wrong link or an installed registry copy is replaced.
 *
 * `--dry-run` prints, per location, what it would do and changes nothing.
 *
 * Companion: `unlink-jini.mjs` reverses this. `check-no-linked-jini.mjs`, wired into every `build`
 * script, fails the build while any of these links are active, so a linked checkout can never ship
 * silently.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const jiniPackagesDir =
  process.env.JINI_PACKAGES_DIR || path.join(os.homedir(), "Programming", "Jini", "packages");
const stateFile = path.join(repoRoot, "development", ".jini-link-state.json");
const dryRun = process.argv.includes("--dry-run");

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

/** One of "ok" | "missing" | "wrong-link" | "installed-copy" for the entry at `linkPath`. */
function linkStatus(linkPath, target) {
  let stat;
  try {
    stat = lstatSync(linkPath);
  } catch {
    return "missing";
  }
  if (!stat.isSymbolicLink()) return "installed-copy";
  const resolved = path.resolve(path.dirname(linkPath), readlinkSync(linkPath));
  return resolved === target ? "ok" : "wrong-link";
}

const consumers = CONSUMER_DIRS.map((dir) => {
  const scopeDir = path.join(dir, "node_modules", "@jini-ai");
  const direct = jiniDepsOf(dir);
  const names = [...new Set([...direct, ...installedJiniPackagesIn(scopeDir)])].sort();
  return { dir, scopeDir, direct, names };
}).filter((consumer) => consumer.direct.length > 0);

const missingDirect = [...new Set(consumers.flatMap((consumer) => consumer.direct))].filter(
  (name) => !existsSync(path.join(jiniPackagesDir, name)),
);
if (missingDirect.length > 0) {
  console.error(
    `\nMissing local Jini package(s) under ${jiniPackagesDir}: ${missingDirect.join(", ")}\n` +
      `Set JINI_PACKAGES_DIR if Jini lives somewhere else.\n`,
  );
  process.exit(1);
}

let changed = 0;
for (const consumer of consumers) {
  console.log(`\n${path.relative(repoRoot, consumer.dir) || "."}:`);
  for (const name of consumer.names) {
    const target = path.join(jiniPackagesDir, name);
    const linkPath = path.join(consumer.scopeDir, name);
    if (!existsSync(target)) {
      console.log(`  skip     ${name} (installed transitively; no local Jini package)`);
      continue;
    }
    const status = linkStatus(linkPath, target);
    if (status === "ok") {
      console.log(`  ok       ${name}`);
      continue;
    }
    const relativeTarget = path.relative(consumer.scopeDir, target);
    console.log(`  ${dryRun ? "would " : ""}link ${name} -> ${relativeTarget} (was ${status})`);
    changed += 1;
    if (dryRun) continue;
    mkdirSync(consumer.scopeDir, { recursive: true });
    // A dangling link must be unlinked: `rmSync` stats through it, finds nothing, and keeps it.
    if (status === "wrong-link") unlinkSync(linkPath);
    else rmSync(linkPath, { recursive: true, force: true });
    symlinkSync(relativeTarget, linkPath, "dir");
  }
}

if (dryRun) {
  console.log(`\nDry run: ${changed} link(s) would change. Nothing written.\n`);
  process.exit(0);
}

writeFileSync(
  stateFile,
  JSON.stringify(
    {
      linkedAt: new Date().toISOString(),
      jiniPackagesDir,
      consumers: consumers.map((consumer) => ({
        dir: path.relative(repoRoot, consumer.dir) || ".",
        packages: consumer.names.map((name) => `@jini-ai/${name}`),
      })),
    },
    null,
    2,
  ),
);

console.log(
  `\nLinked @jini-ai/* from ${jiniPackagesDir} (${changed} link(s) changed).\n` +
    `Builds are blocked while linked (check-no-linked-jini.mjs) — run \`npm run unlink:jini\` ` +
    `before building for real.\n`,
);
