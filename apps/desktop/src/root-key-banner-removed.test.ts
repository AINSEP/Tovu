/**
 * @file Regression guard for the removal of the "This Tovu has no usable root key" banner
 * (Slice A5 of `ADS-memory/.local-artifacts/plan-site-key-2026-09-24.md`). Keys are now per-site,
 * created at site server boot, so the shell no longer needs a boot-time root-key check or a
 * banner reporting on one.
 *
 * Asserts the ABSENCE of every wiring link the old `root-key-banner-wiring.test.ts` asserted the
 * PRESENCE of: the boot guard is not installed from `main.ts`, the renderer no longer mounts
 * `RootKeyBanner`, and none of the deleted module files remain on disk. Assertions run against
 * COMMENT-STRIPPED source for the same reason the old test did — the header prose in `main.ts` and
 * `main.tsx` will keep discussing this removal for a while, so a naive substring match must not be
 * fooled by prose describing what used to be there.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");

function source(...parts: string[]) {
  const raw = fs.readFileSync(path.join(desktopRoot, ...parts), "utf8");
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

test("main.ts no longer imports or installs the root-key boot guard", () => {
  const mainProcess = source("main.ts");
  assert.doesNotMatch(mainProcess, /installRootKeyBootGuard/, "main.ts still references installRootKeyBootGuard");
  assert.doesNotMatch(mainProcess, /root-key-boot-guard\.ts/, "main.ts still imports root-key-boot-guard.ts");
});

test("the renderer entry no longer mounts the root-key banner", () => {
  const rendererEntry = source("src", "renderer", "main.tsx");
  assert.doesNotMatch(rendererEntry, /RootKeyBanner/, "main.tsx still references RootKeyBanner");
  assert.doesNotMatch(rendererEntry, /<RootKeyBanner\s*\/>/, "main.tsx still mounts <RootKeyBanner />");
});

test("the renderer bridge no longer declares rootKeyStatus", () => {
  const runnerApi = source("src", "renderer", "runner-api.ts");
  assert.doesNotMatch(runnerApi, /rootKeyStatus/, "runner-api.ts still declares rootKeyStatus");
  assert.doesNotMatch(runnerApi, /contracts\/root-key\.js/, "runner-api.ts still imports contracts/root-key.js");
});

test("the preload no longer exposes the root-key status channel", () => {
  const preload = source("src", "preload", "preload.mts");
  assert.doesNotMatch(preload, /rootKeyStatus/, "preload.mts still exposes rootKeyStatus");
  assert.doesNotMatch(preload, /ROOT_KEY_CHANNELS/, "preload.mts still references ROOT_KEY_CHANNELS");
});

test("none of the deleted root-key module files remain on disk", () => {
  const deleted = [
    "src/root-key-status.ts",
    "src/root-key-status.test.ts",
    "src/root-key-boot-guard.ts",
    "src/root-key-boot-guard.test.ts",
    "src/root-key-parity.test.ts",
    "src/contracts/root-key.ts",
    "src/renderer/root-key-banner.ts",
    "src/renderer/root-key-banner.css",
    "src/renderer/root-key-banner.test.ts",
    "src/renderer/root-key-banner-wiring.test.ts",
    "src/renderer/RootKeyBanner.tsx",
  ];
  for (const rel of deleted) {
    assert.equal(fs.existsSync(path.join(desktopRoot, rel)), false, `${rel} still exists`);
  }
});
