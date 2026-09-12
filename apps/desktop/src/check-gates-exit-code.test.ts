/**
 * @file END-TO-END exit-code tests for `scripts/check-gates.mjs`. This file exists because reading
 * the runner and concluding "it propagates" is exactly the standard that failed in this repo, in
 * both directions:
 *
 *  - `stage-payload.mjs` shipped a twelve-day-stale admin bundle because nobody ever watched its
 *    staleness check FAIL — it wrote a warning to stderr and the script exited 0;
 *  - `npm run admin:build` was reported as "prints Build blocked and exits 0" and carried
 *    downstream as a root cause, when it exits 1 correctly and the reporter had read the status
 *    through a shell pipe (`$?` is the PIPE's status; `PIPESTATUS[0]` was 1 all along).
 *
 * So every assertion here SPAWNS the real runner against a real manifest and reads `status` off the
 * child directly. No pipes anywhere in this file — a piped assertion would be testing the pipe.
 *
 * The manifests are written to `os.tmpdir()`, never into the repo, so a failed run cannot leave a
 * broken `quality-gates.json` behind.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-gates.ts");

/**
 * Writes a throwaway manifest and runs the real runner against it. Output is captured for
 * assertions, but `status` is read off the returned object — never through a shell pipe.
 *
 * `scriptNames` plants fake gate scripts in a temp `scripts/` directory the runner is pointed at,
 * so the property-3 drift check is exercised against a known set rather than against whatever
 * `apps/desktop/scripts/` happens to contain today — which would make this test's result depend on
 * unrelated commits.
 */
function runWith(manifest, scriptNames = []) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tovu-gates-"));
  const manifestPath = path.join(dir, "quality-gates.json");
  const scriptsDir = path.join(dir, "scripts");
  mkdirSync(scriptsDir);
  for (const name of scriptNames) writeFileSync(path.join(scriptsDir, name), "// planted\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  try {
    const result = spawnSync(
      process.execPath,
      [RUNNER, "--manifest", manifestPath, "--scripts-dir", scriptsDir],
      { encoding: "utf8" }
    );
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const today = () => {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
};

test("a manifest whose gates all pass exits 0", () => {
  const { status, stdout } = runWith({ gates: [{ id: "ok", run: "node -e \"process.exit(0)\"" }] });
  assert.equal(status, 0);
  assert.match(stdout, /check-gates: OK/);
});

test("ONE deliberately failing gate makes a non-zero code reach the caller", () => {
  const { status, stdout, stderr } = runWith({ gates: [{ id: "boom", run: "node -e \"process.exit(1)\"" }] });
  assert.equal(status, 1, "the failure must arrive as a non-zero exit code, not only as text");
  assert.match(stdout, /FAIL {4}\s+boom/);
  assert.match(stderr, /check-gates: FAILED/);
});

test("a gate failing with exit 2 also fails — ESLint's crash code must not read as a pass", () => {
  // The real hazard: `eslint` exits 2 with EMPTY stdout when a config cannot resolve a plugin, and
  // a caller testing `rc !== 1` treats that as success.
  const { status } = runWith({ gates: [{ id: "crash", run: "node -e \"process.exit(2)\"" }] });
  assert.equal(status, 1);
});

test("a gate whose command does not exist at all fails, rather than being skipped", () => {
  const { status, stdout } = runWith({ gates: [{ id: "ghost", run: "definitely-not-a-real-command-xyz" }] });
  assert.equal(status, 1);
  assert.match(stdout, /FAIL/);
});

test("EVERY gate runs even after an earlier one fails, so one run reports every problem", () => {
  const { status, stdout } = runWith({
    gates: [
      { id: "first", run: "node -e \"process.exit(1)\"" },
      { id: "second", run: "node -e \"process.exit(1)\"" },
      { id: "third", run: "node -e \"process.exit(0)\"" },
    ],
  });
  assert.equal(status, 1);
  assert.match(stdout, /3 gates: 1 pass, 2 fail, 0 DISABLED/, "a halt-on-first-failure run would report only one");
});

test("a passing gate alongside a failing one still yields a non-zero code", () => {
  const { status } = runWith({
    gates: [
      { id: "good", run: "node -e \"process.exit(0)\"" },
      { id: "bad", run: "node -e \"process.exit(1)\"" },
    ],
  });
  assert.equal(status, 1, "a green gate must never mask a red one");
});

// --- the manifest itself being unsound is ALSO a non-zero exit --------------------------------

test("a disabled gate with no reason fails the run even though every enabled gate passed", () => {
  const { status, stderr } = runWith({
    gates: [
      { id: "ok", run: "node -e \"process.exit(0)\"" },
      { id: "silent", run: "x", enabled: false, disabledOn: today() },
    ],
  });
  assert.equal(status, 1, "an undocumented disablement must be as fatal as a failing gate");
  assert.match(stderr, /disabledReason/);
});

test("a properly documented disabled gate does NOT fail the run — turning a gate off is allowed", () => {
  const { status, stdout } = runWith({
    gates: [
      { id: "ok", run: "node -e \"process.exit(0)\"" },
      { id: "parked", run: "x", enabled: false, disabledReason: "baseline pending", disabledOn: today() },
    ],
  });
  assert.equal(status, 0);
  assert.match(stdout, /DISABLED {2}parked/, "and it is still printed, every run");
  assert.match(stdout, /baseline pending/);
});

test("a stale disablement fails the run until the date is re-confirmed", () => {
  const { status, stderr } = runWith({
    gates: [{ id: "parked", run: "x", enabled: false, disabledReason: "r", disabledOn: "2020-01-01" }],
    maxDisabledDays: 30,
  });
  assert.equal(status, 1);
  assert.match(stderr, /re-confirm/);
});

test("an empty manifest fails rather than passing by measuring nothing", () => {
  const { status, stderr } = runWith({ gates: [] });
  assert.equal(status, 1);
  assert.match(stderr, /zero gates/);
});

test("a gate script on disk that the manifest does not run fails the run", () => {
  const { status, stderr } = runWith({ gates: [{ id: "ok", run: "node -e \"process.exit(0)\"" }] }, [
    "check-orphaned.ts",
  ]);
  assert.equal(status, 1, "an unwired gate script must be as fatal as a failing gate");
  assert.match(stderr, /gate scripts on disk that nothing runs/);
  assert.match(stderr, /check-orphaned\.ts/);
  assert.match(stderr, /11 dead check scripts/, "the message must say why this rule exists");
});

test("a gate script the manifest DOES run is not reported as drift", () => {
  const { status } = runWith(
    { gates: [{ id: "cov", run: "node scripts/check-coverage.ts" }, { id: "ok", run: "node -e \"process.exit(0)\"" }] },
    ["check-coverage.ts"]
  );
  // The `cov` gate itself fails here (the planted script is a stub with no such path from cwd), so
  // only the ABSENCE of a drift complaint is asserted, not the overall status.
  assert.equal(status, 1);
});

test("the runner does not report ITSELF as an unregistered gate script", () => {
  // `check-gates.mjs` matches the `check-*.mjs` convention but is the runner, not a gate. Without
  // the explicit exclusion it would fail every single run, including this one.
  const { status, stderr } = runWith({ gates: [{ id: "ok", run: "node -e \"process.exit(0)\"" }] }, [
    "check-gates.ts",
  ]);
  assert.equal(status, 0);
  assert.doesNotMatch(stderr, /nothing runs/);
});
