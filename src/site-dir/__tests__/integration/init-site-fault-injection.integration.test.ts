import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initSite } from "../../init-site.js";

/**
 * @file SPEC-003 C-007 (`initSite`) — TDD certification, integration tier: fault injection.
 *
 * Traces: CIC U-003 (Init commit-marker ordering + cleanup-on-failure) Binding constraints
 * U-003-B1/B2/B3 and Required Ordering U-003-ORD1; BR-01, INV-02, AC-03, EC-10, RT-003.
 *
 * `initSite` does not exist yet — expected to fail to compile/run until Programmer implements
 * `src/site-dir/init-site.ts` (tasks.md T014). Correct TDD state.
 *
 * ## Technique disclosure (mirrors this repo's own precedent in
 * `src/features/plugins/__tests__/disk-headroom.test.ts`, which explicitly documents where a
 * real fault condition is impractical to simulate rather than silently skipping it):
 *
 * `initSite`'s target directory must be absent-or-empty before the call (EC-01) — this is a
 * *structural* constraint that makes it impossible to pre-seed any artifact inside the target to
 * selectively fail one late step (5/6/7) while leaving earlier steps (4/5) genuinely completed,
 * without either (a) a real resource-exhaustion condition or (b) a Programmer-exposed test seam
 * (none is defined in `implementation-outline.md`'s Contract Map for C-007). This suite uses two
 * distinct, deterministic, POSIX-only techniques instead of inventing a seam:
 *
 * 1. **Permission-denial tests** (`EACCES` on directory creation) — fail at the earliest possible
 *    real-write point (step 4). Deterministic, portable to any POSIX CI runner, but cannot reach
 *    steps 5-7 because nothing can exist inside an as-yet-untouched, must-be-empty target.
 * 2. **`ulimit -f` (POSIX max-file-size) tests** — spawn a child process with a small file-size
 *    limit via `sh -c "ulimit -f <n> && exec node --import tsx <worker>"`. `config.json` (well
 *    under 1 KiB) and `content.db`'s initial pages fit under the chosen limit, but the SQLite WAL
 *    file this repo's `openContentDb` produces while migrating+seeding does not (measured ~780 KB
 *    on this repo's current migration count) — so the limit deterministically fails partway
 *    through step 6/7, *after* steps 4-5 have genuinely completed on disk. This reaches materially
 *    deeper into BR-01's ordering than technique 1 can.
 *
 * Caveats disclosed, not hidden: POSIX-only (skipped on `win32`); assumes the chosen `ulimit`
 * value stays between "config.json + a fresh content.db's first pages" (small, stable) and "the
 * WAL file a full migrate()+seed produces" (currently ~780 KB; would need revisiting only if this
 * repo's migration count grew enormously, which is unlikely to shrink the WAL by 10x); assumes the
 * `tsx` transform cache the worker process relies on is already warm (true in this repo's normal
 * CI/dev flow, since the same cache is shared across every test-suite invocation) so `ulimit` does
 * not spuriously break `tsx`'s own startup before the worker's `initSite` call even runs.
 */

const IS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;
const SKIP_PERMISSION_TESTS = process.platform === "win32" || IS_ROOT;
const SKIP_REASON = process.platform === "win32"
  ? "POSIX chmod/ulimit fault injection is not portable to win32"
  : "running as root bypasses POSIX permission checks, making this fault injection a false pass";

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-init-fault-"));
}

/**
 * Env for the `ulimit -f`-constrained workers below, with V8 coverage output redirected into the
 * test's own temp dir instead of the runner's aggregation dir.
 *
 * Under `--experimental-test-coverage` the runner exports `NODE_V8_COVERAGE=<tmpdir>` and collects
 * every `coverage-*.json` written there. A spawned child inherits that setting and dumps its own
 * profile into the same directory at exit. These children deliberately run under `ulimit -f 400`
 * — on macOS a 409,600-byte per-file cap — while a profile for a process that has loaded tsx +
 * drizzle + better-sqlite3 is several times that, so the write is truncated at exactly the cap and
 * leaves malformed JSON in the shared directory. One unparseable file makes the runner emit an
 * EMPTY lcov for the ENTIRE run: every other test file's coverage is destroyed with it, which is
 * why this file previously made integration coverage unmeasurable rather than merely incomplete.
 *
 * Redirecting is required, not merely preferred — deleting the variable from the child env does
 * NOT work. Node re-injects `NODE_V8_COVERAGE` into descendant processes from its own coverage
 * state, so it survives `delete env.NODE_V8_COVERAGE` (verified directly: the worker still saw the
 * runner's path). Pointing it at a directory under the test's own `parent` temp dir is the fix that
 * actually holds: the truncated profile lands somewhere inert, the runner's aggregation directory
 * stays clean, and the existing `fs.rmSync(parent, …)` in each test's `finally` already removes it,
 * so no new cleanup path is introduced. The workers' own coverage is not wanted in the first place
 * — the behavior under test is asserted from the parent via the worker's stdout JSON and the
 * resulting on-disk state, never from the worker's own instrumentation.
 */
function workerEnv(parent: string): NodeJS.ProcessEnv {
  return { ...process.env, NODE_V8_COVERAGE: path.join(parent, "worker-v8-coverage") };
}

test("U-003-B1/B2/ORD1 (step-4 class, top-level mkdir denied): a read-only PARENT blocks target creation entirely -> InitSite throws, target never exists, no commit marker anywhere", { skip: SKIP_PERMISSION_TESTS && SKIP_REASON }, () => {
  const parent = mkTempParent();
  const restrictedGrandparent = path.join(parent, "restricted");
  fs.mkdirSync(restrictedGrandparent);
  const target = path.join(restrictedGrandparent, "demo");
  fs.chmodSync(restrictedGrandparent, 0o555);
  try {
    assert.throws(() => initSite({ dir: target, name: "Demo" }));
    assert.equal(fs.existsSync(target), false, "AC-03: the target path must not exist at all — full cleanup (trivial here: nothing was ever created)");
  } finally {
    fs.chmodSync(restrictedGrandparent, 0o755);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("U-003-B1/B2 (step-4 class, subdirectory creation denied): a pre-existing EMPTY but read-only target blocks subdirectory creation -> InitSite throws, target left exactly as it was (empty, no marker)", { skip: SKIP_PERMISSION_TESTS && SKIP_REASON }, () => {
  const parent = mkTempParent();
  const target = path.join(parent, "pre-existing-locked");
  fs.mkdirSync(target);
  fs.chmodSync(target, 0o555);
  try {
    assert.throws(() => initSite({ dir: target, name: "Demo" }));
    fs.chmodSync(target, 0o755); // restore before inspecting, in case the impl left it restricted
    assert.deepEqual(fs.readdirSync(target), [], "INV-02: no partial content was created inside the (pre-existing, EC-01-allowed) target");
  } finally {
    fs.chmodSync(target, 0o755);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("AC-03/EC-10 (deep, real resource-exhaustion failure): a file-size-limited child process fails partway through db creation/seeding (after config.json genuinely succeeded) -> full cleanup, no commit marker, nonzero-signaling failure", { skip: SKIP_PERMISSION_TESTS && SKIP_REASON }, () => {
  const parent = mkTempParent();
  const target = path.join(parent, "deep-failure");
  const workerPath = path.join(parent, "worker.ts");
  const initSitePath = path.resolve(import.meta.dirname, "../../init-site");
  fs.writeFileSync(
    workerPath,
    [
      `const { initSite } = require(${JSON.stringify(initSitePath)});`,
      `const dir = process.argv[2];`,
      `try {`,
      `  const result = initSite({ dir, name: "Deep Failure" });`,
      `  process.stdout.write(JSON.stringify({ ok: true, result }));`,
      `} catch (err) {`,
      `  process.stdout.write(JSON.stringify({ ok: false, name: err && err.name, message: err && err.message }));`,
      `}`,
    ].join("\n")
  );

  try {
    const proc = spawnSync("sh", ["-c", `ulimit -f 400 && exec node --import tsx "${workerPath}" "${target}"`], { encoding: "utf8", env: workerEnv(parent) });
    assert.equal(proc.status, 0, `worker process itself should exit 0 and report failure via stdout JSON, not crash uncontrolled (stderr: ${proc.stderr})`);
    const reported = JSON.parse(proc.stdout);
    assert.equal(reported.ok, false, "the ulimit-constrained write must fail deep inside init (config.json's own tiny write must have already succeeded)");

    assert.equal(fs.existsSync(path.join(target, ".site-meta.json")), false, "INV-02: the commit marker must never exist after any mid-flight failure");
    assert.equal(fs.existsSync(target), false, "AC-03: full cleanup — the target path must not exist (this scenario: target did not pre-exist, so full removal is unambiguous)");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("EC-10/RT-003/U-003-B3: when cleanup's own removal step hits a real EACCES (read-only grandparent blocks the final directory-node removal), the surfaced error names the partial directory's path rather than swallowing the cleanup failure silently", { skip: SKIP_PERMISSION_TESTS && SKIP_REASON }, () => {
  const parent = mkTempParent();
  const grandparent = path.join(parent, "grandparent");
  fs.mkdirSync(grandparent);
  const target = path.join(grandparent, "target");
  fs.mkdirSync(target); // pre-existing, empty — EC-01 allows init to proceed using it
  const workerPath = path.join(parent, "worker.ts");
  const initSitePath = path.resolve(import.meta.dirname, "../../init-site");
  fs.writeFileSync(
    workerPath,
    [
      `const { initSite } = require(${JSON.stringify(initSitePath)});`,
      `const dir = process.argv[2];`,
      `try {`,
      `  const result = initSite({ dir, name: "Cleanup Failure" });`,
      `  process.stdout.write(JSON.stringify({ ok: true, result }));`,
      `} catch (err) {`,
      `  process.stdout.write(JSON.stringify({ ok: false, name: err && err.name, message: err && err.message }));`,
      `}`,
    ].join("\n")
  );

  // Make the GRANDPARENT (not target itself) read-only AFTER target is created: target's own
  // subdirectory/file creation only needs target's own write permission (still 0o755), so init's
  // early writes genuinely succeed; only the FINAL removal of target's own directory entry from
  // its parent requires write permission on the grandparent, which is now denied.
  fs.chmodSync(grandparent, 0o555);
  try {
    const proc = spawnSync("sh", ["-c", `ulimit -f 400 && exec node --import tsx "${workerPath}" "${target}"`], { encoding: "utf8", env: workerEnv(parent) });
    assert.equal(proc.status, 0, `worker process itself should exit 0 and report failure via stdout JSON (stderr: ${proc.stderr})`);
    const reported = JSON.parse(proc.stdout);
    assert.equal(reported.ok, false);
    assert.ok(
      typeof reported.message === "string" && reported.message.includes(target),
      `U-003-B3: the surfaced error message must name the partial directory's path (${target}) so an operator knows manual removal is required — got: ${reported.message}`
    );
  } finally {
    fs.chmodSync(grandparent, 0o755);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
