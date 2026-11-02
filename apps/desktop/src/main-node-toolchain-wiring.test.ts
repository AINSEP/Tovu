/**
 * @file Wiring guard for the bundled node toolchain in the Electron entry (`src/main/index.ts`,
 * formerly `main.ts`) — the shims written into `userData` once per launch, whose env contract reaches
 * every `tovu serve` so a stdio MCP server naming `npx`/`npm`/`node` can be found without a system
 * Node install (plan `plan-desktop-bundled-npx-2026-09-24.md` §2, §6 S4).
 *
 * Behaviour is tested through the real modules: `prepareNodeToolchainEnv` (a failed write degrades
 * to no toolchain and never throws, a disk-image launch turns it off, a written one yields its env)
 * in `src/main/boot/boot-steps.test.ts`, and the env reaching `startServer` in
 * `src/main/boot/site-backend.test.ts`. What stays here as source text is what only the entry
 * decides, at module scope: that it prepares the toolchain after `userData` is locked in, with the
 * real writer and Electron's own executable, and hands the result to the site backend. The entry
 * imports "electron" at module scope, so it cannot load under node --test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const source = fs.readFileSync(path.join(__dirname, "main", "index.ts"), "utf8");

/** The module-scope `prepareNodeToolchainEnv(...)` call, up to its closing `});`. */
function prepareCall(): string {
  const start = source.indexOf("const NODE_TOOLCHAIN_ENV = prepareNodeToolchainEnv(");
  assert.notEqual(start, -1, "expected the module-scope prepareNodeToolchainEnv(...) call");
  return source.slice(start, source.indexOf("});", start));
}

test("the toolchain is prepared AFTER userData is applied -- userData must be locked in first", () => {
  const applyAt = source.indexOf("applyUserDataDir(");
  const prepareAt = source.indexOf("prepareNodeToolchainEnv(");
  assert.notEqual(applyAt, -1, "expected the applyUserDataDir(...) call");
  assert.ok(applyAt < prepareAt, "prepareNodeToolchainEnv must run after userData is set");
  assert.match(prepareCall(), /userDataDir: app\.getPath\("userData"\)/);
});

test("the toolchain is written with process.execPath, DESKTOP_ROOTS.npmRoot and the real writer and builder", () => {
  const call = prepareCall();
  assert.match(call, /electronPath: process\.execPath/);
  assert.match(call, /npmRoot: DESKTOP_ROOTS\.npmRoot/);
  assert.match(call, /writeNodeToolchain, buildNodeToolchainEnv/);
});

test("the prepared env is what the site backend hands every tovu serve", () => {
  assert.match(source, /baseToolchainEnv: NODE_TOOLCHAIN_ENV,/);
});
