/**
 * @file The desktop shell validates its launch environment once, through the shared Tovu boot env
 * schema (`apps/website/src/server/runtime/configuration/env-schema.ts`, a side-effect-free module
 * that imports no website server entry), before it sets the profile, writes the toolchain, or
 * reaches `app.whenReady()` — and so before any `tovu serve` child or listener can start.
 *
 * Behaviour runs through the real schema module. What stays as source text is what only the entry
 * decides, at module scope: that it reads the desktop scope exactly once and ahead of every launch
 * side effect. The entry imports "electron" at module scope, so it cannot load under node --test.
 *
 * Named mutations: `accept-any-desktop-port` (declare `TOVU_DESKTOP_PORT` as free text) turns the
 * first test red; `validate-desktop-env-after-launch` (move the read below `applyUserDataDir` or into
 * the `whenReady` body) turns the second red.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTovuBootEnv } from "../../website/src/server/runtime/configuration/env-schema.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "main", "index.ts"), "utf8");
const READ_CALL = 'readTovuBootEnv({ env: process.env, scope: "desktop"';

function readDesktop(env: Record<string, string | undefined>) {
  return readTovuBootEnv({ env, scope: "desktop", warn: () => assert.fail("no alias is declared for the desktop scope") });
}

test("a bad desktop port stops boot naming the variable but never its value", () => {
  for (const bad of ["70000", "0", "abc", "-1"]) {
    assert.throws(() => readDesktop({ TOVU_DESKTOP_PORT: bad }), (error: Error) => {
      assert.match(error.message, /TOVU_DESKTOP_PORT/);
      assert.ok(!error.message.includes(bad), `the error must not echo the supplied value ${JSON.stringify(bad)}`);
      return true;
    });
  }
  assert.equal(readDesktop({ TOVU_DESKTOP_PORT: "4100" }).TOVU_DESKTOP_PORT, 4100);
  assert.equal(readDesktop({}).TOVU_DESKTOP_PORT, undefined);
});

test("the entry reads the desktop scope once, before the profile, toolchain, and any child or listener", () => {
  const at = source.indexOf(READ_CALL);
  assert.notEqual(at, -1, "expected the module-scope desktop boot env read");
  assert.equal(source.indexOf(READ_CALL, at + 1), -1, "the desktop scope must be read exactly once");
  for (const later of ["applyUserDataDir({", "prepareNodeToolchainEnv({", "app.whenReady()", "startTovuServer("]) {
    const laterAt = source.indexOf(later, source.indexOf("\nconst DESKTOP_ROOTS"));
    assert.notEqual(laterAt, -1, `expected ${later} in the entry`);
    assert.ok(at < laterAt, `the boot env read must come before ${later}`);
  }
  // The self-test switch comes from the validated read rather than a second raw lookup.
  assert.match(source, /const SELFTEST = DESKTOP_BOOT_ENV\.TOVU_DESKTOP_SELFTEST === "1";/);
});
