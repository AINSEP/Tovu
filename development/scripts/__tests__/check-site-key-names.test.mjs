import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../check-site-key-names.sh", import.meta.url));
const repo = path.resolve(path.dirname(script), "../..");
const marker = kind => `site-key-${kind}:`;
const oldName = "root" + "-key";
function run(cwd, expected = "4") {
  return spawnSync("bash", [script], { cwd, encoding: "utf8", env: { ...process.env, SITE_KEY_LEGACY_EXPECTED: expected } });
}
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "site-key-name-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
  function write(name, value) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), value);
  }
  for (let n = 0; n < 1001; n++) write(`apps/fixtures/${n}.txt`, "ordinary copy\n");
  write("apps/frozen.txt", Array.from({ length: 4 }, () => `${oldName} ${marker("frozen")} cryptographic bytes\n`).join(""));
  write("apps/legacy.txt", Array.from({ length: 4 }, () => `${oldName} ${marker("legacy")} remove on/after 2026-11-01\n`).join(""));
  write("apps/control.txt", "TOVU_SITE_KEY\n");
  return { root, write };
}

test("repository passes the canonical site key name guard", () => {
  const result = run(repo, "16");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /old-name hits: 0/);
  assert.match(result.stdout, /frozen: 4/);
  assert.match(result.stdout, /legacy: 16/);
});

test("accepts precisely documented markers and the two unrelated-token exclusions", t => {
  const f = fixture(t);
  f.write("apps/exclusions.txt", "static-site-" + "token\nANALYTICS_ROOT_" + "KEY_SEED\n");
  f.write("ADS-memory/reports/history.txt", oldName);
  f.write("development/HANDOFF-session-old.md", oldName);
  f.write("sites/example/agent-plugins/history.txt", oldName);
  const result = run(f.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

for (const name of [oldName, "site" + "Token", "MASTER " + "SECRET", "encryption " + "master"]) {
  test(`rejects forbidden spelling ${name}`, t => {
    const f = fixture(t);
    // Space in path exercises the NUL-delimited Git scan set.
    f.write("apps/fixture with space.txt", `${name}\n`);
    const result = run(f.root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /old-name hits: 1/);
    assert.ok(result.stdout.includes("fixture with space.txt"));
  });
}

test("refuses changed frozen count", t => {
  const f = fixture(t);
  f.write("apps/frozen.txt", `${marker("frozen")} only one\n`);
  assert.match(run(f.root).stdout, /frozen=1 want 4/);
  assert.equal(run(f.root).status, 1);
});
test("a scan with no frozen markers reports the count instead of exiting silently", t => {
  // grep exits 1 when a batch has no match; under pipefail that used to end the script with no output.
  const f = fixture(t);
  f.write("apps/frozen.txt", "ordinary copy\n");
  const result = run(f.root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /frozen=0 want 4/);
});
test("refuses an undocumented extra compatibility marker", t => {
  const f = fixture(t);
  f.write("apps/extra.txt", `${marker("legacy")} extra\n`);
  const result = run(f.root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /legacy=5/);
});
test("requires a positive control", t => {
  const f = fixture(t);
  f.write("apps/control.txt", "no environment name\n");
  const result = run(f.root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /positive control failed/);
});
test("refuses a scan set too small to cover the repository", t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "site-key-name-guard-small-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
  const result = run(root);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /scan set too small/);
});
