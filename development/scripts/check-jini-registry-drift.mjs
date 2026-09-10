/**
 * Guard against Tovu using a `@jini-ai/*` symbol that exists in the local Jini checkout but not
 * in the REGISTRY-PUBLISHED version pinned in package.json.
 *
 * Tovu's `node_modules/@jini-ai/*` are `npm link`-style symlinks into a sibling `Jini` checkout
 * (see `check-no-linked-jini.mjs`'s header). Every local test, typecheck, and build resolves
 * `@jini-ai/*` imports against that local source tree. CI installs the same packages from the
 * npm registry instead. Any symbol that exists in the linked local source but not in the
 * published tarball type-checks locally and fails `tsc` in CI only — the exact failure class that
 * cost five separate failed/inert deploys on 2026-09-03 (`@jini-ai/cms`, `@jini-ai/ui`,
 * `@jini-ai/daemon`+`@jini-ai/protocol`, `@jini-ai/agent-runtime` — the last one being
 * `apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts`'s use of
 * `DetectedAgent.reasoningInModelId`, absent from the then-published `agent-runtime@0.3.1`).
 *
 * `check-no-linked-jini.mjs` cannot catch this: it only asserts that `node_modules/@jini-ai/*`
 * are NOT symlinks at build time, i.e. it proves a build ran against a real registry install. It
 * has no way to know whether that registry install's TYPES are missing something the source
 * uses — a real registry install can still fail `tsc` for exactly this reason, and did, five
 * times. This script complements it: it recreates "what CI's registry install actually looks
 * like" in an isolated scratch prefix and type-checks the REAL source against it, without ever
 * touching the real, symlinked `node_modules/@jini-ai/*` that the dev server and other agents on
 * this shared tree depend on.
 *
 * REDIRECTION MECHANISM — why this is a `node_modules` shadow, not a tsconfig `paths` override.
 * A `paths` override was tried first and DISCARDED: `tsc --traceResolution` proved that whenever a
 * real `node_modules/@jini-ai/<pkg>` already exists on the ordinary resolution path (which it
 * always does here — Tovu's real symlinks), TypeScript's `paths`-substitution "load as file/folder"
 * step does not reliably apply the package's `exports`/`types` map, silently gives up, and falls
 * through to classic `node_modules` resolution — which finds the REAL symlinked local Jini source,
 * not the registry install. That produced a script that always reported PASS regardless of what was
 * actually pinned — verified by forcing `@jini-ai/agent-runtime` back to `0.3.1` (the pre-fix
 * version missing `reasoningInModelId`) and watching it still report clean, and by `--listFiles`
 * showing files loaded from the local Jini checkout even on a "clean" run.
 * Fix: install the registry packages into a directory that ordinary Node/TypeScript module
 * resolution reaches BEFORE the real symlinked ones — a `node_modules/@jini-ai/*` placed at an
 * ancestor of the source files that is CLOSER than the real one. Node's resolution algorithm walks
 * every ancestor directory of the importing file looking for `node_modules`, nearest first, and
 * stops at the first match — so a shadow one level closer wins over the real, farther one, and
 * (unlike `paths`) it goes through completely ordinary directory/package.json resolution, so
 * `exports` maps behave exactly as CI's install would resolve them. For root, the real symlinks
 * live at repo-root `node_modules`, so the shadow goes at `apps/website/node_modules/@jini-ai`
 * (closer, since every included file is under `apps/website/src`). For admin, the real symlinks are
 * already the closest possible ancestor (`apps/admin/node_modules`, admin's own independent
 * install), so the shadow has to go one level further in, at `apps/admin/src/node_modules/@jini-ai`
 * (still an ancestor of every file under `apps/admin/src`, and closer than `apps/admin/node_modules`
 * itself). Verified admin's two cross-package includes
 * (`apps/website/src/contracts/headless/**`, `.../features/theme/theme-layout.ts`) do not import
 * `@jini-ai/*` at all, so there is no ambiguity about which project's shadow they would see.
 * The shadow is created fresh, used for one `tsc` run, and removed in a `finally` — it never
 * coexists with, or touches, the real `node_modules/@jini-ai/*` symlinks.
 *
 * SCOPE — one drift direction only. There are two directions a Tovu pin can drift from Jini:
 *   1. Local-ahead-of-registry: source already uses a symbol the pinned registry version doesn't
 *      have yet. This is what breaks `tsc`/CI builds, and is what this script catches: it is a
 *      pure type-surface comparison, mechanically checkable without ever needing Jini's source.
 *   2. Registry-ahead-of-git (or diverged from it): a package gets published from an uncommitted
 *      or since-amended working tree, so the registry tarball's BEHAVIOR doesn't match what's in
 *      Jini's git history, with no accompanying type change (`@jini-ai/chat@0.3.3` was published
 *      this way). A type-check cannot see this — the types are identical either way — so it needs
 *      a provenance check (does the published tarball match a real commit?) which needs the Jini
 *      checkout this script deliberately avoids requiring. Left as a known gap; see dispatch
 *      report for why it wasn't folded in here.
 *
 * SCOPE — root + apps/admin only. These are the only two projects CI actually runs `tsc` against
 * (`typecheck (root)` / `typecheck (admin)` gates in `.github/workflows/ci.yml`). `apps/site-chat`
 * also imports `@jini-ai/*` but has no CI typecheck gate at all today (confirmed: it does not
 * appear anywhere in `ci.yml`) — adding drift-checking for a project nothing type-checks in CI
 * would not be enforced by anything and is out of this task's scope.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const PROJECTS = [
  {
    key: "root",
    dir: REPO_ROOT,
    label: "root (apps/website, tsconfig.json)",
    // Closer ancestor of every included file (`apps/website/src/**`) than the real symlinks at
    // repo-root `node_modules` — see the header comment for why this has to be a shadowed
    // `node_modules` directory rather than a tsconfig `paths` override.
    shadowAnchor: path.join(REPO_ROOT, "apps", "website"),
  },
  {
    key: "admin",
    dir: path.join(REPO_ROOT, "apps", "admin"),
    label: "apps/admin",
    // apps/admin/node_modules (the real, symlinked install) is already the closest ancestor of
    // apps/admin/src/**, so the shadow has to go one level further in, under src/, to still win.
    shadowAnchor: path.join(REPO_ROOT, "apps", "admin", "src"),
  },
];

/** Compiler options whose values are paths, resolved relative to the tsconfig's own directory. */
const PATH_LIKE_COMPILER_OPTIONS = ["rootDir", "outDir", "baseUrl", "declarationDir"];

/**
 * Reads a project's registry-resolved `@jini-ai/*` dependency specs (name -> semver spec).
 *
 * A `file:`/`workspace:`/`link:` spec always resolves to real local source, never a registry
 * tarball — `check-no-linked-jini.mjs` applies the same exemption for the same reason. There is
 * no "published version" for those to drift from, so they are skipped.
 *
 * @param {string} projectDir - directory containing the project's package.json
 * @returns {Record<string,string>} `@jini-ai/*` dependency name -> semver spec
 * @complexity O(d) over the project's declared dependency count
 */
function readJiniDependencies(projectDir) {
  const manifest = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
  const specs = { ...manifest.dependencies, ...manifest.devDependencies };
  const deps = {};
  for (const [name, spec] of Object.entries(specs)) {
    if (!name.startsWith("@jini-ai/")) continue;
    if (/^(file:|workspace:|link:)/.test(spec)) continue;
    deps[name] = spec;
  }
  return deps;
}

/**
 * Builds a self-contained tsconfig object equivalent to the project's real one but relocated: all
 * path-bearing options, any existing `paths` targets, and `include`/`exclude` globs are rewritten
 * to absolute paths so the config still means the same thing once written into a scratch directory
 * nested under `node_modules/`. Deliberately does NOT touch `@jini-ai/*` resolution — that is
 * handled by shadowing a `node_modules` directory (see header comment), not by this tsconfig.
 *
 * @param {string} projectDir - the project's real directory (where its real tsconfig.json lives)
 * @returns {object} a tsconfig-shaped object, ready to `JSON.stringify` and run `tsc -p` against
 * @complexity O(k) over the tsconfig's own option/include/exclude count
 */
function buildAbsolutizedTsconfig(projectDir) {
  const real = JSON.parse(readFileSync(path.join(projectDir, "tsconfig.json"), "utf8"));
  const compilerOptions = { ...(real.compilerOptions ?? {}) };

  for (const key of PATH_LIKE_COMPILER_OPTIONS) {
    if (typeof compilerOptions[key] === "string") {
      compilerOptions[key] = path.resolve(projectDir, compilerOptions[key]);
    }
  }

  if (compilerOptions.paths) {
    const paths = {};
    for (const [alias, targets] of Object.entries(compilerOptions.paths)) {
      paths[alias] = targets.map((target) => path.resolve(projectDir, target));
    }
    compilerOptions.paths = paths;
    compilerOptions.baseUrl = compilerOptions.baseUrl ?? projectDir;
  }
  compilerOptions.noEmit = true;

  const absolutize = (globs) => (globs ?? []).map((glob) => path.resolve(projectDir, glob));

  return {
    compilerOptions,
    include: absolutize(real.include),
    exclude: absolutize(real.exclude),
  };
}

/**
 * Copies each installed `@jini-ai/*` package from the scratch npm install into a shadow
 * `node_modules` directory that ordinary module resolution reaches before the real symlinked one
 * (see header comment). Returns a cleanup function: removes the whole shadow `node_modules` if this
 * call created it fresh, or just the copied packages if a `node_modules` was already there for some
 * other reason (defensive — not expected in this repo, verified empty before this script runs).
 *
 * @param {string} shadowAnchor - directory whose `node_modules` should shadow the real one
 * @param {string} scratchNodeModules - the scratch install's `node_modules` (source of the copy)
 * @param {string[]} names - `@jini-ai/*` package names to shadow
 * @returns {() => void} cleanup callback — always call this once the shadowed `tsc` run is done
 * @complexity O(n) directory copies, n = number of pinned @jini-ai/* packages
 */
function createShadow(shadowAnchor, scratchNodeModules, names) {
  const shadowNodeModules = path.join(shadowAnchor, "node_modules");
  const preexisting = existsSync(shadowNodeModules);
  mkdirSync(shadowNodeModules, { recursive: true });
  for (const name of names) {
    rmSync(path.join(shadowNodeModules, name), { recursive: true, force: true });
    cpSync(path.join(scratchNodeModules, name), path.join(shadowNodeModules, name), { recursive: true });
  }
  return () => {
    if (preexisting) {
      for (const name of names) rmSync(path.join(shadowNodeModules, name), { recursive: true, force: true });
    } else {
      rmSync(shadowNodeModules, { recursive: true, force: true });
    }
  };
}

/**
 * Reads the exact installed version of each package from a scratch install, for reporting.
 * @param {string} scratchNodeModules - `<scratchRoot>/node_modules`
 * @param {string[]} names - `@jini-ai/*` package names to look up
 * @returns {Record<string,string>} name -> installed version, or "(not installed)" on failure
 */
function readInstalledVersions(scratchNodeModules, names) {
  const versions = {};
  for (const name of names) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(scratchNodeModules, name, "package.json"), "utf8"));
      versions[name] = pkg.version;
    } catch {
      versions[name] = "(not installed)";
    }
  }
  return versions;
}

/**
 * Runs `tsc --noEmit` for a project against a given (already-written) tsconfig file.
 * @param {{dir: string}} project
 * @param {string} tsconfigPath
 * @returns {{ok: boolean, output: string}}
 */
function runTsc(project, tsconfigPath) {
  const tscBin = path.join(project.dir, "node_modules", ".bin", "tsc");
  try {
    const stdout = execFileSync(tscBin, ["--noEmit", "-p", tsconfigPath], {
      cwd: project.dir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return { ok: true, output: stdout };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/**
 * Splits `tsc`'s non-pretty text output into one string per diagnostic (a diagnostic's first line
 * matches `file(line,col): error TSxxxx: ...`; any following lines with no such prefix are that
 * same diagnostic's wrapped detail and stay attached to it).
 * @param {string} output - raw combined stdout+stderr from a `tsc --noEmit` run
 * @returns {string[]} one entry per diagnostic, each possibly multi-line
 */
function parseDiagnosticBlocks(output) {
  const startOfDiagnostic = /^\S.*\(\d+,\d+\): error TS\d+:/;
  const blocks = [];
  let current = null;
  for (const line of output.split("\n")) {
    if (startOfDiagnostic.test(line)) {
      if (current) blocks.push(current.join("\n"));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) blocks.push(current.join("\n"));
  return blocks;
}

/**
 * Installs a project's pinned `@jini-ai/*` packages from the registry into an isolated scratch
 * prefix, then type-checks the project's REAL source against that install — and against the REAL,
 * symlinked local install, to isolate registry drift from any pre-existing, unrelated `tsc` error
 * (e.g. a broken test file) that has nothing to do with `@jini-ai/*` and would otherwise make this
 * gate permanently red for the wrong reason. Only a diagnostic present in the registry run but
 * ABSENT from the local run counts as drift.
 *
 * A real `npm install` (not `npm pack` per package) is deliberate: several `@jini-ai/*` packages
 * depend on OTHER `@jini-ai/*` packages Tovu never imports directly (e.g. `agent-runtime` depends
 * on `@jini-ai/platform`), and those nested `.d.ts` references need to resolve too. `npm install`
 * resolves that whole transitive graph automatically; reconstructing it by hand would either miss
 * packages (spurious "cannot find module" noise unrelated to real drift) or require re-implementing
 * npm's resolver.
 *
 * @param {{dir: string, label: string, shadowAnchor: string}} project
 * @param {Record<string,string>} pinOverrides - `--pin name=version` overrides from argv
 * @returns {Promise<object>} result record; see `main()` for the shape consumed per `status`
 * @complexity O(1) process spawns (npm install, 2x tsc) dominated by network/compile time, not input size
 */
async function checkProject(project, pinOverrides) {
  const deps = { ...readJiniDependencies(project.dir), ...pinOverrides };
  const names = Object.keys(deps);
  if (names.length === 0) {
    return { project, status: "skipped", reason: "no registry-resolved @jini-ai/* dependencies" };
  }

  const scratchRoot = path.join(project.dir, "node_modules", ".tovu-jini-registry-check");
  rmSync(scratchRoot, { recursive: true, force: true });
  mkdirSync(scratchRoot, { recursive: true });

  try {
    writeFileSync(
      path.join(scratchRoot, "package.json"),
      JSON.stringify({ name: "tovu-jini-registry-drift-scratch", private: true, dependencies: deps }, null, 2),
    );

    try {
      execFileSync(
        "npm",
        ["install", "--no-audit", "--no-fund", "--no-package-lock", "--workspaces=false"],
        { cwd: scratchRoot, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
      );
    } catch (err) {
      return { project, status: "install-error", resolved: deps, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }

    const scratchNodeModules = path.join(scratchRoot, "node_modules");
    const versions = readInstalledVersions(scratchNodeModules, names);

    const tsconfigPath = path.join(scratchRoot, "tsconfig.generated.json");
    writeFileSync(tsconfigPath, JSON.stringify(buildAbsolutizedTsconfig(project.dir), null, 2));

    // Baseline FIRST, before the shadow exists — resolves through the real, symlinked local Jini
    // via ordinary module resolution, exactly like `npm run typecheck` does today.
    const baseline = runTsc(project, tsconfigPath);

    const removeShadow = createShadow(project.shadowAnchor, scratchNodeModules, names);
    let registry;
    try {
      registry = runTsc(project, tsconfigPath);
    } finally {
      removeShadow();
    }

    if (registry.ok) {
      return { project, status: "pass", versions };
    }

    // The registry run failed — but only a diagnostic that is NEW relative to the real, local
    // (symlinked) run is actual @jini-ai/* registry drift; anything else is a pre-existing local
    // error this gate should not report as (and must not be silently hidden as) drift.
    const baselineBlocks = new Set(parseDiagnosticBlocks(baseline.output));
    const registryBlocks = parseDiagnosticBlocks(registry.output);
    const driftBlocks = registryBlocks.filter((block) => !baselineBlocks.has(block));

    if (driftBlocks.length === 0) {
      return {
        project,
        status: "pass",
        versions,
        note: `${registryBlocks.length} pre-existing local tsc error(s) unrelated to @jini-ai/* (identical against the real, local Jini checkout)`,
      };
    }
    return { project, status: "drift", versions, output: driftBlocks.join("\n\n") };
  } finally {
    // Always clean up, pass or fail — this must never leave anything behind in the shared tree.
    if (!process.env.DEBUG_KEEP_SCRATCH) rmSync(scratchRoot, { recursive: true, force: true });
  }
}

/** @param {string} text @returns {string} `text` indented for nesting under a status line */
function indent(text) {
  return text
    .split("\n")
    .map((line) => (line ? `    ${line}` : line))
    .join("\n");
}

/**
 * @param {string[]} argv - `process.argv.slice(2)`
 * @returns {Record<string,string>} `--pin name=version` overrides, repeatable
 */
function parseArgs(argv) {
  const overrides = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--pin") continue;
    const kv = argv[++i];
    const eq = kv?.indexOf("=") ?? -1;
    if (!kv || eq === -1) {
      throw new Error(`--pin expects "name=version", got: ${kv ?? "(missing)"}`);
    }
    overrides[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  return overrides;
}

async function main() {
  const overrides = parseArgs(process.argv.slice(2));
  // Safe to run in parallel: each project's shadow lives under its OWN directory
  // (apps/website/node_modules vs apps/admin/src/node_modules — see header comment), and
  // apps/admin and apps/website are siblings, so neither project's source can ever walk up into
  // the other's shadow. The one tsconfig include that crosses projects (admin also compiles two
  // files physically under apps/website/src) was checked and does not import @jini-ai/* at all.
  const results = await Promise.all(PROJECTS.map((project) => checkProject(project, overrides)));

  let failed = false;
  for (const result of results) {
    console.log(`\n--- ${result.project.label} ---`);
    if (result.status === "skipped") {
      console.log(`  SKIP  ${result.reason}`);
      continue;
    }
    if (result.status === "install-error") {
      failed = true;
      console.log("  FAIL  could not install the pinned @jini-ai/* versions from the registry:");
      console.log(indent(result.output));
      continue;
    }
    const versionLines = Object.entries(result.versions)
      .map(([name, version]) => `    ${name}@${version}`)
      .join("\n");
    if (result.status === "pass") {
      console.log(`  PASS  ${Object.keys(result.versions).length} package(s) type-check clean against the registry:`);
      console.log(versionLines);
      if (result.note) console.log(`  (note: ${result.note})`);
    } else {
      failed = true;
      console.log("  FAIL  source uses a @jini-ai/* symbol not present in the registry-published version:");
      console.log(versionLines);
      console.log("");
      console.log(indent(result.output));
    }
  }

  console.log("");
  if (failed) {
    console.error(
      "[check-jini-registry-drift] one or more @jini-ai/* symbols used in Tovu's source are not " +
        "in the REGISTRY-published version pinned in package.json. Either bump the pin once the " +
        "fix is actually published, or the change was never published at all — this is the exact " +
        "failure class that broke 5 deploys on 2026-09-03 (see this script's header comment).",
    );
    process.exitCode = 1;
  } else {
    console.log("[check-jini-registry-drift] all pinned @jini-ai/* packages match Tovu's source usage.");
  }
}

main().catch((err) => {
  console.error(`[check-jini-registry-drift] unexpected failure: ${err.stack ?? err}`);
  process.exitCode = 1;
});
