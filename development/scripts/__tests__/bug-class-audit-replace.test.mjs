import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("flags a nonliteral replacement named count but not a literal capture string or a callback", (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), "bug-class-audit-replace-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const appDir = path.join(fixture, "apps/admin/src");
  mkdirSync(appDir, { recursive: true });
  writeFileSync(path.join(appDir, "sample.ts"), `declare const s: string;
declare const opts: { count: string };
function count() { return "literal"; }
function f(count: string) { return s.replace("x", count); }
s.replaceAll("x", opts.count);
s.replace("x", "$1");
s.replace("x", () => "$&");
s.replace("x", count);
const callback = () => "$1";
s.replace("x", callback);
s.replace("x", function () { return "$&"; });
`);
  symlinkSync(fileURLToPath(new URL("../../../node_modules", import.meta.url)), path.join(fixture, "node_modules"), "dir");
  execFileSync("git", ["init", fixture]);
  execFileSync("git", ["-C", fixture, "add", "apps/admin/src/sample.ts"]);
  const out = path.join(fixture, "out");
  execFileSync(process.execPath, [fileURLToPath(new URL("../bug-class-audit.mjs", import.meta.url)), "--repo", `tovu=${fixture}`, "--out", out]);
  const rows = readFileSync(path.join(out, "replace-dollar-expansion.tsv"), "utf8").trimEnd().split("\n").slice(1).map(line => line.split("\t"));
  assert.deepEqual(rows, [
    ["tovu", "apps/admin/src/sample.ts", "4", "f", 'replace("x", <identifier> count)'],
    ["tovu", "apps/admin/src/sample.ts", "5", "<module>", 'replaceAll("x", <property> opts.count)'],
  ]);
});
