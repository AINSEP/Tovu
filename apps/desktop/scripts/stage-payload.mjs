/**
 * Assemble the runnable Tovu payload this shell spawns as a child, into
 * `apps/desktop/staging/tovu-payload/`, which `electron-builder.yml` ships as `extraResources`
 * at `Contents/Resources/tovu/`.
 *
 * ## Why it lives here and not in `development/scripts/`
 *
 * `main.js`'s own header states the invariant: "`apps/desktop` is deliberately additive and
 * self-contained. Nothing outside it imports it, nothing outside it references it… deleting
 * `apps/desktop/` returns the repo to exactly its previous state." A staging script in the repo's
 * shared `development/scripts/` would be the first thing to break that. Everything packaging-related
 * therefore stays under `apps/desktop/`, and this script reaches UP into the repo for its inputs
 * rather than the repo reaching down for it.
 *
 * ## What ships, and why it keeps its repo-relative shape
 *
 * The shell never imports Tovu — it spawns `tovu serve` as a child (`src/tovu-server.js`), so what
 * must ship is a whole *runnable* tree. It is staged at the SAME relative paths it occupies in the
 * checkout (`dist/`, `apps/admin/dist`, `apps/site-chat/dist`, `package.json`, `node_modules/`),
 * because that is exactly what lets `resolveCliEntry` and `buildServeEnv` keep one `path.join`
 * against `packaged-paths.js`'s `payloadRoot` that is correct in dev and packaged alike. A flatter
 * staged layout would force every one of those consumers to branch on mode individually.
 *
 * Only the `dependencies` closure is staged. devDependencies (astro, drizzle-kit, tsx, typescript…)
 * are build- and test-only and would add hundreds of MB.
 *
 * ## Provenance
 *
 * Adapted from `/Users/la/Programming/Tovu-Runner/development/scripts/stage-tovu-runtime.mjs`,
 * which solves this same problem for a separate repo. Its hard-won pieces are carried over intact —
 * `materializeSymlinks` (codesign rejects absolute symlinks inside a bundle), `assertClosureComplete`
 * (a tree can ship incomplete and still pass every local test, because `staging/` sits inside a repo
 * whose own `node_modules` silently satisfies the gap), and reading `cliEntry` from
 * `runtime-manifest.json` rather than hardcoding `dist/src/cli/main.js`.
 *
 * Three things are deliberately NOT carried over:
 * - Runner's `assertNodeMajorInSync()`, which pins a `TOVU_MIN_NODE_MAJOR` constant in Runner's own
 *   source. This shell spawns Electron's own Node (`ELECTRON_RUN_AS_NODE=1`), so there is no
 *   system-Node version to agree with.
 * - Runner's source `tovuDir` indirection — the source here IS this repo.
 * - `playwright`. See {@link EXCLUDED_PACKAGES}.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";

import { isBundleInput, shellStalenessFailure } from "../src/shell-staleness.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(desktopDir, "..", "..");
const outDir = path.join(desktopDir, "staging", "tovu-payload");
const repoModulesDir = path.join(repoRoot, "node_modules");

/**
 * The two SPA builds, staged at their checkout-relative paths so one `path.join` serves both modes.
 *
 * `marker` is the exact file the SERVER probes to decide between serving the shell and answering
 * 503 — `admin-static.ts:92/115` checks `index.html`, and `site-chat-static.ts:37` checks
 * `site-assistant.js`. Site-chat has NO `index.html` at all: it is a single self-mounting IIFE
 * bundle loaded by a `<script>` tag, not an app with client-side routing (`app.ts:1336-1338`).
 * Asserting the wrong marker would have hard-failed staging on a perfectly good build.
 */
const STAGED_SHELLS = [
  {
    relative: path.join("apps", "admin", "dist"),
    marker: "index.html",
    // NOT `npm run admin:build`. That chains through `check-no-linked-jini.mjs`, which correctly
    // refuses to build while any @jini-ai/* package is npm-linked -- a guard that exists for
    // DISTRIBUTABLE builds. Refreshing a shell for a local package run is not that, and the direct
    // vite invocation is the command that actually works on a linked checkout. Do not suggest
    // `npm run unlink:jini` here: it swaps the whole tree to published Jini for no benefit.
    buildWith: "cd apps/admin && npx vite build",
    sourceDirs: [path.join("apps", "admin", "src")],
    sourceFiles: [path.join("apps", "admin", "package.json")],
  },
  {
    relative: path.join("apps", "site-chat", "dist"),
    marker: "site-assistant.js",
    buildWith: "cd apps/site-chat && npx vite build",
    sourceDirs: [path.join("apps", "site-chat", "src")],
    sourceFiles: [path.join("apps", "site-chat", "package.json")],
  },
];

/**
 * Top-level `node_modules` entries never staged, each for a reason that was checked rather than
 * assumed:
 *
 * - `playwright` / `playwright-core` / `@playwright` — a production dependency of Tovu, but its ONLY
 *   importer is `apps/website/src/features/site-evidence/playwright-browser.ts:144`, which reaches
 *   it through a DYNAMIC `await import("playwright")` inside a try/catch and degrades to
 *   `{available: false, reason}`. A static import would crash the server at load; a dynamic one
 *   does not. The driver is ~12 MB and the browser it drives is a separate ~150 MB download that a
 *   desktop app has no business shipping.
 * - `@oven` — 132 MB of Bun runtimes, `optionalDependencies` of `@modelcontextprotocol/ext-apps`,
 *   which uses Bun only to build and test ITSELF. Reached only through the `@jini-ai/*` pnpm store.
 * - `@rollup` — same package, same root cause: every `@rollup/rollup-<platform>` native listed under
 *   its `optionalDependencies`.
 */
const EXCLUDED_PACKAGES = new Set(["playwright", "playwright-core", "@playwright", "@oven", "@rollup"]);

function fail(message) {
  process.stderr.write(`stage-payload: ${message}\n`);
  process.exit(1);
}

function isExcluded(name) {
  const [head] = name.split(path.sep);
  return EXCLUDED_PACKAGES.has(head) || EXCLUDED_PACKAGES.has(name);
}

/** Tovu's production dependency closure, as package paths relative to its `node_modules`. */
function productionDependencyPaths() {
  let stdout;
  try {
    stdout = execFileSync("npm", ["ls", "--omit=dev", "--parseable", "--all"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // `npm ls` exits non-zero on any tree quibble (the linked `@jini-ai/*` produce several) while
    // still printing a complete, usable tree on stdout.
    stdout = err.stdout ?? "";
  }
  const prefix = `${repoModulesDir}${path.sep}`;
  const names = [...new Set(stdout.split("\n").filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length)))].sort();
  if (names.length === 0) {
    fail(`npm ls listed no packages under ${repoModulesDir}. Has \`npm install\` run at the repo root?`);
  }
  return names;
}

function stageDir(src, dest, dropNestedModules) {
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    dereference: true,
    filter: dropNestedModules ? (from) => path.basename(from) !== "node_modules" : undefined,
  });
}

function stagePackage(name) {
  if (isExcluded(name)) return false;
  const src = path.join(repoModulesDir, name);
  const dest = path.join(outDir, "node_modules", name);
  if (!existsSync(src)) return false;
  // A nested entry (`liquidjs/node_modules/commander`) already came along with its parent.
  if (existsSync(dest)) return false;

  // `@jini-ai/*` and `@tovu/sdk` are `file:`/workspace links whose real directories carry a pnpm
  // symlink farm under `node_modules/`. Dereferencing that would drag in the entire pnpm store;
  // dropping it makes their imports resolve from the staged root instead, which is where npm
  // hoisted those same dependencies.
  stageDir(src, dest, lstatSync(src).isSymbolicLink());
  return true;
}

/**
 * npm's hoisted view only covers the `@jini-ai/*` packages this repo names directly. Their imports
 * of each other — `@jini-ai/agent-runtime` needing `@jini-ai/platform`, which Tovu never mentions —
 * resolve in dev through Jini's own pnpm workspace links, which cannot ship. Staging every Jini
 * package flat puts all of them somewhere one upward walk can find.
 *
 * @returns the real source directory of each staged package, to seed the dependency closure.
 */
function stageJiniPackages() {
  const anchor = path.join(repoModulesDir, "@jini-ai", "core");
  if (!existsSync(anchor)) {
    fail(`no @jini-ai/core under ${repoModulesDir}; cannot locate the Jini packages.`);
  }
  // Derived from the link itself so it cannot drift from wherever Jini really is.
  const packagesDir = path.dirname(realpathSync(anchor));
  const roots = [];
  for (const entry of readdirSync(packagesDir)) {
    const src = path.join(packagesDir, entry);
    const manifest = path.join(src, "package.json");
    if (!existsSync(manifest)) continue;
    roots.push(src);
    const dest = path.join(outDir, "node_modules", JSON.parse(readFileSync(manifest, "utf8")).name);
    if (existsSync(dest)) continue;
    stageDir(src, dest, true);
  }
  return roots;
}

function declaredDependencies(packageDir) {
  const manifestPath = path.join(packageDir, "package.json");
  if (!existsSync(manifestPath)) return [];
  return Object.keys(JSON.parse(readFileSync(manifestPath, "utf8")).dependencies ?? {});
}

/** Node's own upward `node_modules` walk — the only way to find a package in pnpm's store. */
function findPackageDir(fromDir, depName) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", depName);
    if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Jini's packages declare ordinary npm dependencies of their own — `@jini-ai/devops` needs `undici`
 * — that exist only inside Jini's pnpm store. Tovu never names them, so `productionDependencyPaths()`
 * never sees them and nothing above stages them.
 */
function stageTransitiveDependencies(roots) {
  const visited = new Set(roots);
  const queue = [...roots];
  let count = 0;
  while (queue.length > 0) {
    const from = queue.pop();
    for (const dep of declaredDependencies(from)) {
      if (isExcluded(dep)) continue;
      const resolved = findPackageDir(from, dep);
      if (resolved === undefined || visited.has(resolved)) continue;
      visited.add(resolved);
      queue.push(resolved);
      const dest = path.join(outDir, "node_modules", dep);
      if (existsSync(dest)) continue;
      stageDir(resolved, dest, true);
      count += 1;
    }
  }
  return count;
}

/**
 * Replace every symlink in the staged tree with the real thing it points at.
 *
 * `cpSync`'s `dereference` only dereferences links whose target lies inside the subtree being
 * copied. A link pointing OUT of it (npm's `.bin/node-which -> ../which/bin/…`) is recreated as a
 * symlink to the resolved ABSOLUTE path — so a developer-machine path ends up inside the bundle.
 * `codesign --verify --deep --strict` rejects that outright ("invalid destination for symbolic link
 * in bundle"), and on any other machine it would simply dangle.
 */
function materializeSymlinks(dir) {
  let replaced = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      let target;
      try {
        target = realpathSync(full);
      } catch {
        rmSync(full, { force: true });
        continue;
      }
      rmSync(full, { force: true });
      cpSync(target, full, { recursive: true, dereference: true });
      replaced += 1;
    }
    // Re-stat rather than trusting the dirent: an entry just materialized from a link to a
    // directory needs walking too, in case its own contents carried links outward.
    if (existsSync(full) && statSync(full).isDirectory()) replaced += materializeSymlinks(full);
  }
  return replaced;
}

function assertNoSymlinks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) fail(`staged tree still contains a symlink after materialization: ${full}`);
    if (entry.isDirectory()) assertNoSymlinks(full);
  }
}

function stagedPackageDirs(modulesDir) {
  return readdirSync(modulesDir)
    .filter((entry) => !entry.startsWith("."))
    .flatMap((entry) => {
      const full = path.join(modulesDir, entry);
      return entry.startsWith("@") ? readdirSync(full).map((scoped) => path.join(full, scoped)) : [full];
    });
}

/**
 * Every declared dependency of every staged package must resolve INSIDE the staged tree.
 *
 * Without this the tree can ship incomplete and still pass every local test: `staging/` sits inside
 * this repo, so Node's upward walk quietly satisfies a missing import from the repo's OWN
 * `node_modules`. The `.app` only breaks once it is moved somewhere else, which is every real
 * install. A static check is the honest guard, because no in-repo runtime test can distinguish
 * "resolved from the bundle" from "resolved from an ancestor".
 *
 * Deliberately excluded packages are exempt — they are absent on purpose, not by accident.
 */
function assertClosureComplete() {
  const modulesDir = path.join(outDir, "node_modules");
  const missing = [];
  for (const packageDir of stagedPackageDirs(modulesDir)) {
    for (const dep of declaredDependencies(packageDir)) {
      if (isExcluded(dep)) continue;
      const hoisted = path.join(modulesDir, dep, "package.json");
      const nested = path.join(packageDir, "node_modules", dep, "package.json");
      if (existsSync(hoisted) || existsSync(nested)) continue;
      missing.push(`${path.relative(modulesDir, packageDir)} -> ${dep}`);
    }
  }
  if (missing.length > 0) {
    fail(`staged tree is missing ${missing.length} declared dependencies, so the packaged app would fail once installed outside this repo:\n  ${missing.join("\n  ")}`);
  }
}

/**
 * `dist/runtime-manifest.json` is the root build's own output (`emit-dist-package-json.mjs`, derived
 * from the root `package.json`'s `bin.tovu`) — read here rather than assuming the conventional
 * `dist/src/cli/main.js`, since that literal is exactly what broke once already when `src/` was
 * renamed (2026-08-27 restructure).
 */
function readRuntimeManifest(dir) {
  const manifestPath = path.join(dir, "dist", "runtime-manifest.json");
  if (!existsSync(manifestPath)) {
    fail(`no ${manifestPath}. Run \`npm run build\` at ${repoRoot} first.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (typeof manifest.cliEntry !== "string") fail(`${manifestPath} has no "cliEntry" string field.`);
  return manifest;
}

/**
 * The shell resolves the CLI through `resolveCliEntry`, which reads `<payloadRoot>/package.json`'s
 * `bin.tovu` — so that manifest has to be staged, and it has to agree with the `cliEntry` the build
 * recorded. Two independently-derived paths that are allowed to disagree are exactly the failure
 * `runtime-manifest.json` was introduced to prevent, so assert they match instead of picking one.
 */
function assertCliEntryAgreement(manifest) {
  const binEntry = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).bin?.tovu;
  if (binEntry !== manifest.cliEntry) {
    fail(`the root package.json's bin.tovu ("${binEntry}") and dist/runtime-manifest.json's cliEntry ("${manifest.cliEntry}") disagree. Re-run \`npm run build\`.`);
  }
}

/** Count `.sql` migrations on both sides — a stale `dist/` is the single likeliest reason a
 *  packaged app rejects a site with `SITE_NEWER_THAN_RUNTIME`, and it is invisible otherwise. */
function countMigrations(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((entry) => entry.endsWith(".sql")).length : 0;
}

function failIfDistIsStale() {
  const source = countMigrations(path.join(repoRoot, "apps", "website", "src", "platform", "db", "drizzle"));
  const built = countMigrations(path.join(outDir, "dist", "src", "platform", "db", "drizzle"));
  if (built < source) {
    fail(
      `the staged dist/ carries ${built} migrations but source has ${source}. This payload is built ` +
        `from a stale dist/ and will reject any site created from current source with ` +
        `SITE_NEWER_THAN_RUNTIME. Re-run \`npm run build\` at the repo root for a shippable payload.`
    );
  }
}

/** Newest mtime under a directory tree, or 0 if it does not exist.
 *  @complexity O(n) in files walked. */
function newestMtime(abs) {
  if (!existsSync(abs)) return 0;
  const stat = statSync(abs);
  if (!stat.isDirectory()) return isBundleInput(abs) ? stat.mtimeMs : 0;
  let newest = 0;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    if (!entry.isDirectory() && !isBundleInput(entry.name)) continue;
    if (entry.isDirectory() && !isBundleInput(`${entry.name}/`)) continue;
    newest = Math.max(newest, newestMtime(path.join(abs, entry.name)));
  }
  return newest;
}

/**
 * Refuse a shell whose build output is OLDER than its own source. The comparison itself lives in
 * `../src/shell-staleness.js` (and is tested there, against the real 2026-09-12 incident); this
 * function is only the filesystem half.
 *
 * BEHAVIOUR CHANGE, deliberately: anyone packaging from a checkout whose shells are behind their
 * source now hits a HARD STOP where they previously got a shipped-but-wrong artifact.
 *
 * mtime is the floor, not the ceiling. A build-provenance record (git HEAD sha plus a dirty flag,
 * written at build time and asserted here) would be stricter — but a matching `head_sha` is NOT
 * proof of freshness if the build came from a dirty tree, so such a record must carry the dirty
 * flag and staging must refuse a dirty-built payload. Otherwise it becomes another
 * green-for-the-wrong-reason check, which is the failure class this guard exists to end.
 *
 * @complexity O(n) in source files under the shell's own tree.
 */
function failIfShellIsStale(shell) {
  const builtAt = newestMtime(path.join(repoRoot, shell.relative, shell.marker));
  let sourceAt = 0;
  for (const dir of shell.sourceDirs ?? []) sourceAt = Math.max(sourceAt, newestMtime(path.join(repoRoot, dir)));
  for (const file of shell.sourceFiles ?? []) sourceAt = Math.max(sourceAt, newestMtime(path.join(repoRoot, file)));

  const failure = shellStalenessFailure(builtAt, sourceAt, shell);
  if (failure) fail(failure);
}

const manifest = readRuntimeManifest(repoRoot);
assertCliEntryAgreement(manifest);
if (!existsSync(path.join(repoRoot, manifest.cliEntry))) {
  fail(`no built Tovu CLI at ${path.join(repoRoot, manifest.cliEntry)} (from runtime-manifest.json's cliEntry). Run \`npm run build\` at ${repoRoot} first.`);
}

/**
 * The admin and site-chat SPAs are SEPARATE builds from `dist/`: the root `npm run build` compiles
 * the server only. So a checkout that builds cleanly can still have neither shell, and a build made
 * from it produces an app whose every site tab answers `/admin` and `/site-chat` with a 503 — a
 * failure that first shows up after packaging, signing and notarizing. Refusing to stage is the
 * cheap end of that.
 */
for (const shell of STAGED_SHELLS) {
  if (!existsSync(path.join(repoRoot, shell.relative, shell.marker))) {
    fail(`no built shell at ${path.join(repoRoot, shell.relative, shell.marker)}. Run \`${shell.buildWith}\` at ${repoRoot} first.`);
  }
  // Existence was never enough -- see failIfShellIsStale's header for the bundle this missed.
  failIfShellIsStale(shell);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// `package.json` is staged verbatim because `resolveCliEntry` reads `bin.tovu` from it in BOTH
// modes — copying it is what keeps that function free of any packaged-mode branch at all.
cpSync(path.join(repoRoot, "package.json"), path.join(outDir, "package.json"));
cpSync(path.join(repoRoot, "dist"), path.join(outDir, "dist"), { recursive: true, dereference: true });
for (const shell of STAGED_SHELLS) {
  cpSync(path.join(repoRoot, shell.relative), path.join(outDir, shell.relative), { recursive: true, dereference: true });
}

const jiniRoots = stageJiniPackages();
const staged = productionDependencyPaths().filter(stagePackage).length + jiniRoots.length + stageTransitiveDependencies(jiniRoots);

if (!existsSync(path.join(outDir, "node_modules", "better-sqlite3"))) {
  fail("staged tree has no better-sqlite3 — Tovu's CLI cannot open a site database without it.");
}
const materialized = materializeSymlinks(outDir);
assertNoSymlinks(outDir);
assertClosureComplete();

const stagedManifest = readRuntimeManifest(outDir);
if (stagedManifest.cliEntry !== manifest.cliEntry || !existsSync(path.join(outDir, stagedManifest.cliEntry))) {
  fail(`the staged tree's runtime-manifest.json names cliEntry "${stagedManifest.cliEntry}", which did not survive the dist/ copy.`);
}
for (const shell of STAGED_SHELLS) {
  // After `materializeSymlinks`, not before: that pass could in principle empty out a dangling link.
  if (!existsSync(path.join(outDir, shell.relative, shell.marker))) {
    fail(`staged tree has no shell at ${path.join(outDir, shell.relative, shell.marker)} — the copy must have gone wrong.`);
  }
}
failIfDistIsStale();

const size = execFileSync("du", ["-sh", outDir], { encoding: "utf8" }).split("\t")[0];
process.stdout.write(`stage-payload: staged ${staged} packages, materialized ${materialized} symlinks -> ${outDir} (${size})\n`);
