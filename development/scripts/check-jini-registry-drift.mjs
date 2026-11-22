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
 * itself). Admin's cross-package headless include
 * (`apps/website/src/contracts/headless/**`) does not import
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
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { check, parseDiagnosticBlocks } from "@jini-ai/devops/checks/published-types";
import { createNodeFilesystem, createNodeProcessRunner, createNpmInstaller } from "@jini-ai/devops/checks/node";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** CI type-checks exactly these two projects; `shadowAnchor` is the closer ancestor described in the header. */
const PROJECTS = [
  { key: "root", directory: REPO_ROOT, label: "root (apps/website, tsconfig.json)", shadowAnchor: path.join(REPO_ROOT, "apps", "website") },
  { key: "admin", directory: path.join(REPO_ROOT, "apps", "admin"), label: "apps/admin", shadowAnchor: path.join(REPO_ROOT, "apps", "admin", "src") },
];
// Use a real npm install so the scratch tree resolves the entire transitive dependency graph, including Jini packages referenced by nested declaration files.
const NPM_INSTALL_ARGS = ["install", "--no-audit", "--no-fund", "--no-package-lock", "--workspaces=false"];

function compileProject({ key, directory, shadowAnchor }) {
  return {
    key, directory, shadowAnchor, mode: "drift", prerequisites: [],
    manifestPath: path.join(directory, "package.json"),
    scratchParent: path.join(directory, "node_modules"),
    compiler: { command: path.join(directory, "node_modules", ".bin", "tsc"), args: ["--noEmit", "-p", path.join(directory, "tsconfig.json")], cwd: directory },
  };
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


function reportVersions(result) {
  return Object.entries(result.versions).map(([name, version]) => `    ${name}@${version}`).join("\n");
}

function reportRegistryResult({ result, label }, _options = {}) {
  console.log(`\n--- ${label} ---`);
  if (result.status === "skipped") {
    console.log("  SKIP  no registry-resolved @jini-ai/* dependencies");
    return false;
  }
  if (result.status === "install-error") {
    console.log("  FAIL  could not install the pinned @jini-ai/* versions from the registry:");
    console.log(indent(result.output));
    return true;
  }
  if (result.status === "pass") {
    console.log(`  PASS  ${Object.keys(result.versions).length} package(s) type-check clean against the registry:`);
    console.log(reportVersions(result));
    const preexisting = parseDiagnosticBlocks({ output: result.output }).length;
    if (preexisting > 0) console.log(`  (note: ${preexisting} pre-existing local tsc error(s) unrelated to @jini-ai/* (identical against the real, local Jini checkout))`);
    return false;
  }
  if (result.status === "drift") {
    console.log("  FAIL  source uses a @jini-ai/* symbol not present in the registry-published version:");
    console.log(reportVersions(result));
    console.log("");
    console.log(indent(result.diagnostics.join("\n\n")));
    return true;
  }
  console.log(`  FAIL  ${result.status}:`);
  console.log(indent(result.output));
  return true;
}

async function main() {
  const pins = parseArgs(process.argv.slice(2));
  const runner = createNodeProcessRunner({}, { timeoutMs: 0 });
  const report = await check({
    projects: PROJECTS.map(compileProject), scope: "@jini-ai", fs: createNodeFilesystem({}), runner,
    installer: createNpmInstaller({ runner, command: "npm" }, { args: NPM_INSTALL_ARGS }),
  }, { pins, keepScratch: Boolean(process.env.DEBUG_KEEP_SCRATCH) });
  let failed = false;
  report.projects.forEach((result, index) => {
    if (reportRegistryResult({ result, label: PROJECTS[index].label })) failed = true;
  });

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
