/**
 * @file Behavioural proof for `update-manifest-merge.ts` and its CLI, `scripts/merge-latest-mac.ts`:
 * the merged `latest-mac.yml` lists both arches' zips, and every shape that would let one arch
 * update to the other's binary is refused.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mergeMacManifests } from "./update-manifest-merge.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A manifest shaped like electron-builder 26's `latest-mac.yml` for one arch. */
function manifest(arch: "arm64" | "x64", overrides: Record<string, unknown> = {}) {
  return {
    version: "0.2.0",
    files: [
      { url: `Tovu-mac-${arch}.zip`, sha512: `zip-${arch}`, size: 100, blockMapSize: 10 },
      { url: `Tovu-mac-${arch}.dmg`, sha512: `dmg-${arch}`, size: 120 },
    ],
    path: `Tovu-mac-${arch}.zip`,
    sha512: `zip-${arch}`,
    releaseDate: arch === "arm64" ? "2026-09-23T10:00:00.000Z" : "2026-09-23T11:00:00.000Z",
    ...overrides,
  };
}

test("both arches' zips are listed (the re-stapled dmgs are not), and the legacy top-level path names the Intel zip", () => {
  const merged = mergeMacManifests([
    { label: "arm", manifest: manifest("arm64") },
    { label: "x64", manifest: manifest("x64") },
  ]);
  assert.equal(merged.version, "0.2.0");
  assert.deepEqual(merged.files.map((entry) => entry.url), ["Tovu-mac-arm64.zip", "Tovu-mac-x64.zip"]);
  assert.equal(merged.path, "Tovu-mac-x64.zip");
  assert.equal(merged.sha512, "zip-x64");
  assert.equal(merged.releaseDate, "2026-09-23T11:00:00.000Z");
  assert.equal(merged.files[0]!.blockMapSize, 10, "blockmap sizes must survive for differential downloads");
});

test("a merge of one arch alone is refused: the other arch would find no zip or the wrong one", () => {
  assert.throws(
    () => mergeMacManifests([{ label: "arm", manifest: manifest("arm64") }]),
    { message: "expected one arm64 zip and one x64 zip, got [Tovu-mac-arm64.zip]" },
  );
  assert.throws(
    () => mergeMacManifests([{ label: "a", manifest: manifest("x64") }, { label: "b", manifest: manifest("x64", { files: [{ url: "Other-x64.zip", sha512: "o" }] }) }]),
    { message: "expected one arm64 zip and one x64 zip, got [Tovu-mac-x64.zip, Other-x64.zip]" },
  );
});

test("inputs from two different versions are refused", () => {
  assert.throws(
    () => mergeMacManifests([{ label: "arm", manifest: manifest("arm64") }, { label: "x64", manifest: manifest("x64", { version: "0.1.9" }) }]),
    { message: "version mismatch: 0.2.0 vs 0.1.9" },
  );
});

test("one file name with two checksums is refused; an identical duplicate is kept once", () => {
  const clash = manifest("x64", { files: [...manifest("x64").files, { url: "Tovu-mac-arm64.zip", sha512: "different" }] });
  assert.throws(
    () => mergeMacManifests([{ label: "arm", manifest: manifest("arm64") }, { label: "x64", manifest: clash }]),
    { message: "Tovu-mac-arm64.zip listed with two different checksums" },
  );
  const merged = mergeMacManifests([{ label: "a", manifest: manifest("arm64") }, { label: "b", manifest: manifest("arm64") }, { label: "c", manifest: manifest("x64") }]);
  assert.equal(merged.files.length, 2);
});

test("malformed input and no input are refused with the input's label", () => {
  assert.throws(() => mergeMacManifests([]), { message: "no manifests to merge" });
  assert.throws(() => mergeMacManifests([{ label: "a.yml", manifest: null }]), { message: "a.yml: not an update manifest (needs version and files)" });
  assert.throws(
    () => mergeMacManifests([{ label: "a.yml", manifest: { version: "1", files: [{ url: "x.zip" }] } }]),
    { message: "a.yml: every files entry needs url and sha512" },
  );
});

test("the CLI writes a YAML manifest electron-updater's parser reads back, and fails loudly", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-latest-mac-"));
  const yamlText = (value: ReturnType<typeof manifest>) =>
    `version: ${value.version}\nfiles:\n${value.files.map((entry) => `  - url: ${entry.url}\n    sha512: ${entry.sha512}\n    size: ${entry.size}`).join("\n")}\npath: ${value.path}\nsha512: ${value.sha512}\nreleaseDate: '${value.releaseDate}'\n`;
  fs.writeFileSync(path.join(dir, "arm.yml"), yamlText(manifest("arm64")));
  fs.writeFileSync(path.join(dir, "x64.yml"), yamlText(manifest("x64")));
  const out = path.join(dir, "latest-mac.yml");
  const script = path.join(DESKTOP_ROOT, "scripts", "merge-latest-mac.ts");

  const ok = spawnSync(process.execPath, [script, out, path.join(dir, "arm.yml"), path.join(dir, "x64.yml")], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  const text = fs.readFileSync(out, "utf8");
  assert.match(text, /^version: 0\.2\.0$/m);
  assert.match(text, /url: Tovu-mac-arm64\.zip/);
  assert.match(text, /^path: Tovu-mac-x64\.zip$/m);

  const bad = spawnSync(process.execPath, [script, out, path.join(dir, "arm.yml"), path.join(dir, "arm.yml")], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /merge-latest-mac: expected one arm64 zip and one x64 zip/);
});
