/**
 * @file `scripts/check-tree-quiet.ts` — the packaging precondition gate — over a scripted `exec`
 * (pgrep, git, sleep) and a real temp checkout, so every signal can be driven without a live
 * watcher, a dirty repo, or a racing writer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runTreeQuietCheck, snapshot } from "../scripts/check-tree-quiet.ts";
import type { ExecPort } from "../scripts/check-tree-quiet.ts";

/** A temp checkout holding the verified surface: src/ (nested), bin/, and main.ts. */
function checkout(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-tree-quiet-"));
  fs.mkdirSync(path.join(root, "apps", "desktop", "src", "nested"), { recursive: true });
  fs.mkdirSync(path.join(root, "apps", "desktop", "bin"));
  fs.writeFileSync(path.join(root, "apps", "desktop", "src", "a.ts"), "a");
  fs.writeFileSync(path.join(root, "apps", "desktop", "src", "nested", "b.ts"), "b");
  fs.writeFileSync(path.join(root, "apps", "desktop", "main.ts"), "main");
  return root;
}

/** Scripted exec: `pgrep` exits 1 (no watcher) unless told otherwise; `git` prints `dirty`; `sleep`
 *  runs `duringSleep`, the window in which a racing writer would land. */
function fakeExec({ pgrep = () => { throw Object.assign(new Error("exit 1"), { status: 1 }); }, dirty = "", duringSleep = () => undefined }:
  { pgrep?: () => string; dirty?: string; duringSleep?: () => void } = {}) {
  const calls: [string, readonly string[]][] = [];
  const exec: ExecPort = (file, args) => {
    calls.push([file, args]);
    if (file === "pgrep") return pgrep();
    if (file === "git") return dirty;
    duringSleep();
    return "";
  };
  return { exec, calls };
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (text: string) => out.push(text), err: (text: string) => err.push(text) } };
}

test("a quiet checkout passes, having asked pgrep, git (scoped to the verified surface) and slept once", () => {
  const repoRoot = checkout();
  const { exec, calls } = fakeExec();
  const io = capture();

  assert.equal(runTreeQuietCheck({ exec, ...io.io }, { repoRoot }), 0);
  assert.deepEqual(io.out, ["check-tree-quiet: OK — apps/desktop is quiet\n"]);
  assert.deepEqual(calls.map(([file]) => file), ["pgrep", "git", "sleep"]);
  assert.deepEqual(calls[1]![1], ["-C", repoRoot, "status", "--porcelain", "--", "apps/desktop/src", "apps/desktop/bin", "apps/desktop/main.ts"]);
});

test("a live vite watcher, git-dirty paths, and a write inside the window are each reported", () => {
  const repoRoot = checkout();
  const { exec } = fakeExec({
    pgrep: () => "4242\n",
    // Porcelain keeps a leading space column (" M"); the path must survive it intact.
    dirty: " M apps/desktop/src/a.ts\n?? apps/desktop/bin/new.ts\n",
    duringSleep: () => fs.writeFileSync(path.join(repoRoot, "apps", "desktop", "src", "nested", "c.ts"), "c"),
  });
  const io = capture();

  assert.equal(runTreeQuietCheck({ exec, ...io.io }, { repoRoot }), 1);
  const report = io.err.join("");
  assert.match(report, /^check-tree-quiet: apps\/desktop is not quiet enough to package safely:\n/);
  assert.match(report, /vite build --watch/);
  assert.ok(report.includes("apps/desktop/src/a.ts") && report.includes("apps/desktop/bin/new.ts"), report);
  assert.equal(io.err.filter((line) => line.startsWith("  - ")).length, 3);
});

test("a pgrep failure other than 'no match' fails the gate rather than reading as quiet", () => {
  const repoRoot = checkout();
  const { exec } = fakeExec({ pgrep: () => { throw Object.assign(new Error("pgrep: permission denied"), { status: 3 }); } });
  const io = capture();

  assert.equal(runTreeQuietCheck({ exec, ...io.io }, { repoRoot }), 1);
  assert.match(io.err.join(""), /check-tree-quiet: pgrep failed unexpectedly: pgrep: permission denied/);
});

test("a non-Error thrown by a probe still fails the gate with a readable line", () => {
  const { exec } = fakeExec({ pgrep: () => { throw Object.assign(new Error("ok"), { status: 1 }); } });
  const io = capture();
  const failingExec: ExecPort = (file, args, options) => {
    if (file === "git") throw "git exploded";
    return exec(file, args, options);
  };
  assert.equal(runTreeQuietCheck({ exec: failingExec, ...io.io }, { repoRoot: checkout() }), 1);
  assert.equal(io.err.join(""), "git exploded\n");
});

test("snapshot fingerprints a missing path, a file, and a tree (symlinks are not counted)", () => {
  const repoRoot = checkout();
  const src = path.join(repoRoot, "apps", "desktop", "src");
  fs.symlinkSync(path.join(src, "a.ts"), path.join(src, "link.ts"));
  const fileStat = fs.statSync(path.join(repoRoot, "apps", "desktop", "main.ts"));

  assert.deepEqual(snapshot(path.join(repoRoot, "nope")), { exists: false, fileCount: 0, newestMtimeMs: 0 });
  assert.deepEqual(snapshot(path.join(repoRoot, "apps", "desktop", "main.ts")), { exists: true, fileCount: 1, newestMtimeMs: fileStat.mtimeMs });
  const tree = snapshot(src);
  assert.equal(tree.exists, true);
  assert.equal(tree.fileCount, 2);
  assert.equal(tree.newestMtimeMs, Math.max(fs.statSync(path.join(src, "a.ts")).mtimeMs, fs.statSync(path.join(src, "nested", "b.ts")).mtimeMs));
});

test("the real entry runs the check against this checkout and exits with its verdict", { skip: process.platform === "win32" }, () => {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-tree-quiet.ts");
  const child = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 60_000 });
  // The verdict depends on this checkout's live state, so assert the entry's contract both ways:
  // exit 0 always says OK on stdout, and a non-zero exit always explains itself on stderr.
  if (child.status === 0) assert.equal(child.stdout, "check-tree-quiet: OK — apps/desktop is quiet\n");
  else {
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /check-tree-quiet: /);
  }
});
