import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("the audit reads object-form translation entries and still reports a missing key", (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), "hygiene-translation-entry-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const appDir = path.join(fixture, "apps/admin/src");
  mkdirSync(appDir, { recursive: true });
  writeFileSync(path.join(appDir, "sample-i18n.ts"), `const translations = {
  en: { Save: "Save", Cancel: "Cancel" },
  fr: { Save: "Enregistrer", Cancel: "Annuler" },
  es: { ...translationEntry({ source: "Save", translated: "Guardar" }) },
};
`);
  symlinkSync(fileURLToPath(new URL("../../../node_modules", import.meta.url)), path.join(fixture, "node_modules"), "dir");
  execFileSync("git", ["init", fixture]);
  execFileSync("git", ["-C", fixture, "add", "apps/admin/src/sample-i18n.ts"]);
  const out = path.join(fixture, "out");
  execFileSync(process.execPath, [fileURLToPath(new URL("../hygiene-audit.mjs", import.meta.url)), "--repo", `tovu=${fixture}`, "--out", out, "--skip-audit"]);
  const rows = readFileSync(path.join(out, "i18n-missing-keys.tsv"), "utf8").trimEnd().split("\n").slice(1).map((line) => line.split("\t"));
  assert.ok(rows.some((row) => row[4] === "es" && row[5] === "Cancel" && row[6] === "missing"), "Spanish Cancel remains a missing key");
  assert.equal(rows.some((row) => row[4] === "es" && row[5] === "Save"), false, "Spanish Save is supplied by the object-form translation entry");
});
