/**
 * Assemble the runnable Tovu payload this shell spawns as a child, into
 * `apps/desktop/staging/tovu-payload/`, which `electron-builder.yml` ships as `extraResources`
 * at `Contents/Resources/tovu/`.
 *
 * ## Why it lives here and not in `development/scripts/`
 *
 * `main.ts`'s own header states the invariant: "`apps/desktop` is deliberately additive and
 * self-contained. Nothing outside it imports it, nothing outside it references it… deleting
 * `apps/desktop/` returns the repo to exactly its previous state." A staging script in the repo's
 * shared `development/scripts/` would be the first thing to break that. Everything packaging-related
 * therefore stays under `apps/desktop/`, and this script reaches UP into the repo for its inputs
 * rather than the repo reaching down for it.
 *
 * ## What ships, and why it keeps its repo-relative shape
 *
 * The shell never imports Tovu — it spawns `tovu serve` as a child (`src/tovu-server.ts`), so what
 * must ship is a whole *runnable* tree. It is staged at the SAME relative paths it occupies in the
 * checkout (`dist/`, `apps/admin/dist`, `apps/site-chat/dist`, `package.json`, `node_modules/`),
 * because that is exactly what lets `resolveCliEntry` and `buildServeEnv` keep one `path.join`
 * against `packaged-paths.ts`'s `payloadRoot` that is correct in dev and packaged alike. A flatter
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
 * - `playwright`. See `EXCLUDED_PACKAGES` in `../src/stage-payload-lib.ts`.
 *
 * ## Shape
 *
 * Every precondition, staging step and summary line lives in `../src/stage-payload-run.ts`, tested
 * there against real temporary trees; this file only binds the real filesystem, `npm ls`, the
 * staging steps, the environment and the output streams.
 *
 * Usage: node scripts/stage-payload.ts [--repo-root <checkout>]   (default: this checkout)
 * Exit codes: 0 = payload and bundled npm staged; 1 = a precondition or staged-tree check refused.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertDistImportsDeclared } from "../src/dist-import-check.ts";
import {
  assertClosureComplete,
  diskBytes,
  newestMtime,
  pruneNativePrebuilds,
  STAGED_SHELLS,
  stageBundledNpm,
  stageDir,
  stagePayloadFiles,
  stageTransitiveDependencies,
  stripNonRuntimeFiles,
} from "../src/stage-payload-lib.ts";
import { stagePayloadCli } from "../src/stage-payload-run.ts";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

process.exitCode = stagePayloadCli({ argv: process.argv.slice(2), desktopDir }, {
  fs: { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync },
  steps: {
    stagePayloadFiles, stageDir, stageTransitiveDependencies, stripNonRuntimeFiles, pruneNativePrebuilds,
    assertClosureComplete, assertDistImportsDeclared, stageBundledNpm, diskBytes, newestMtime,
  },
  shells: STAGED_SHELLS,
  execFileSync,
  env: process.env,
  host: process,
  stdout: process.stdout,
  stderr: process.stderr,
});
