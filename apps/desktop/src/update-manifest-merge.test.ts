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
import { parseUpdateInfo } from "electron-updater/out/providers/Provider.js";

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
  const parsed = parseUpdateInfo(text, 'latest-mac.yml', new URL('https://updates.example/latest-mac.yml'));
  assert.deepEqual(parsed.files, [
    { url: 'Tovu-mac-arm64.zip', sha512: 'zip-arm64', size: 100 },
    { url: 'Tovu-mac-x64.zip', sha512: 'zip-x64', size: 100 },
  ]);
  assert.equal(parsed.version, '0.2.0');
  assert.equal(parsed.path, 'Tovu-mac-x64.zip');
  assert.equal(parsed.sha512, 'zip-x64');
  assert.equal(parsed.releaseDate, '2026-09-23T11:00:00.000Z');

  const bad = spawnSync(process.execPath, [script, out, path.join(dir, "arm.yml"), path.join(dir, "arm.yml")], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /merge-latest-mac: expected one arm64 zip and one x64 zip/);
});

test("the CLI refuses too few arguments with its usage line and writes nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-latest-mac-usage-"));
  const out = path.join(dir, "latest-mac.yml");
  const script = path.join(DESKTOP_ROOT, "scripts", "merge-latest-mac.ts");

  for (const args of [[], [out], [out, path.join(dir, "only-one.yml")]]) {
    const run = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(run.status, 1, `accepted ${JSON.stringify(args)}`);
    assert.match(run.stderr, /^usage: node scripts\/merge-latest-mac\.ts <out\.yml> <in-arm64\.yml> <in-x64\.yml>$/m);
  }
  assert.equal(fs.existsSync(out), false);
});
