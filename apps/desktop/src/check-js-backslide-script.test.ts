/**
 * @file `scripts/check-js-backslide.ts` — the gate around `js-backslide-guard.ts` — over a fake path
 * lister, plus its real git-backed lister and the real entry once.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ALLOWLIST, candidatePaths, runJsBackslideCheck } from "../scripts/check-js-backslide.ts";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-js-backslide.ts");

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (text: string) => out.push(text), err: (text: string) => err.push(text) } };
}

test("a TypeScript-only tree (allowlisted exceptions included) passes", () => {
  const io = capture();
  const code = runJsBackslideCheck({ listPaths: () => ["apps/desktop/main.ts", ...ALLOWLIST], ...io.io });
  assert.equal(code, 0);
  assert.deepEqual(io.out, ["check-js-backslide: OK — apps/desktop is TypeScript-only\n"]);
  assert.deepEqual(io.err, []);
});

test("every JavaScript-family offender is named with its TypeScript rename", () => {
  const io = capture();
  const code = runJsBackslideCheck({ listPaths: () => ["apps/desktop/a.js", "apps/desktop/b.mjs", "apps/desktop/ok.ts"], ...io.io });
  assert.equal(code, 1);
  assert.deepEqual(io.err.slice(1), [
    "  - apps/desktop/a.js — rename to apps/desktop/a.ts, or add it to ALLOWLIST in this script with a reason.\n",
    "  - apps/desktop/b.mjs — rename to apps/desktop/b.ts, or add it to ALLOWLIST in this script with a reason.\n",
  ]);
  assert.match(io.err[0]!, /must stay TypeScript-only/);
  assert.deepEqual(io.out, []);
});

test("a lister failure fails the gate with a bounded message, whether it throws an Error or not", () => {
  for (const thrown of [new Error("git: not a repository"), "plain string failure"]) {
    const io = capture();
    const code = runJsBackslideCheck({ listPaths: () => { throw thrown; }, ...io.io });
    assert.equal(code, 1);
    assert.match(io.err.join(""), thrown instanceof Error ? /git: not a repository/ : /plain string failure/);
  }
});

test("the real lister reads git's view of apps/desktop, and the real entry exits with the verdict", () => {
  const paths = candidatePaths();
  assert.ok(paths.includes("apps/desktop/package.json"));
  assert.ok(paths.every((entry) => entry.startsWith("apps/desktop/") && !entry.includes("node_modules/")));
  const child = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", timeout: 60_000 });
  const expected = runJsBackslideCheck({ listPaths: () => paths, out: () => undefined, err: () => undefined });
  assert.equal(child.status, expected, child.stderr);
});
