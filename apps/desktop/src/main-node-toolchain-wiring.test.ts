/**
 * @file Wiring guard for `writeNodeToolchain` (`../main.ts`) — the call that writes the bundled
 * node/npm/npx shims into `userData` once per launch and hands their env contract to
 * `startTovuServer`, so a stdio MCP server naming `npx`/`npm`/`node` can be found without a system
 * Node install (plan `plan-desktop-bundled-npx-2026-09-24.md` §2, §6 S4).
 *
 * Source text, for the reason `main-mcp-announce-wiring.test.ts` states at length: `main.ts`
 * requires `"electron"` at module scope, which crashes under plain `node --test` before this file
 * could prove anything behavioural. `writeNodeToolchain` and `buildNodeToolchainEnv` are covered
 * behaviourally where they live (`node-toolchain.test.ts`); what only this file can catch is that
 * `main.ts` actually calls them — after `userData` is locked in, with the right inputs, wrapped so a
 * write failure degrades to no toolchain rather than crashing the app — because a dropped call, a
 * reordered one, or a swallowed throw produces no failing test and no dialog anywhere else. Only a
 * desktop build where every bundled `npx` MCP server silently can't launch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawSource = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");

/** `main.ts` with every comment stripped — same helper as `main-mcp-announce-wiring.test.ts`, so a
 *  hazard named only in a comment (e.g. this file's own doc quoted back into main.ts) never
 *  false-positives a raw scan. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const source = withoutComments(rawSource);

test("both functions are imported from node-toolchain.ts", () => {
  assert.match(
    source,
    /import \{ writeNodeToolchain, buildNodeToolchainEnv \} from ["']\.\/src\/node-toolchain\.ts["']/,
  );
});

test("writeNodeToolchain is called AFTER app.setPath(\"userData\", ...) -- userData must be locked in first", () => {
  const setPathIndex = source.indexOf('app.setPath("userData"');
  const writeIndex = source.indexOf("writeNodeToolchain(");
  assert.notEqual(setPathIndex, -1, 'expected app.setPath("userData", ...) to still be present');
  assert.notEqual(writeIndex, -1, "expected a writeNodeToolchain(...) call");
  assert.ok(setPathIndex < writeIndex, "writeNodeToolchain must run after userData is set");
});

test("writeNodeToolchain is called with process.execPath and DESKTOP_ROOTS.npmRoot", () => {
  const callIndex = source.indexOf("writeNodeToolchain(");
  assert.notEqual(callIndex, -1, "expected a writeNodeToolchain(...) call");
  const call = source.slice(callIndex, source.indexOf(")", source.indexOf("{", callIndex)) + 200);
  const ownCall = call.slice(0, call.indexOf(");") + 1);
  assert.match(ownCall, /electronPath:\s*process\.execPath/, "expected electronPath: process.execPath");
  assert.match(ownCall, /npmRoot:\s*DESKTOP_ROOTS\.npmRoot/, "expected npmRoot: DESKTOP_ROOTS.npmRoot");
});

test("a writeNodeToolchain failure is caught and warned once, never thrown -- a write failure must degrade, not crash the app", () => {
  const writeIndex = source.indexOf("writeNodeToolchain(");
  assert.notEqual(writeIndex, -1);
  const surrounding = source.slice(Math.max(0, writeIndex - 200), writeIndex + 500);
  assert.match(surrounding, /try\s*\{/, "expected writeNodeToolchain to run inside a try block");
  assert.match(surrounding, /\}\s*catch/, "expected a catch clause guarding the call");
  assert.match(surrounding, /console\.warn/, "expected a console.warn on failure");
});

test("startTovuServer is called with nodeToolchainEnv, so the write's result actually reaches the child", () => {
  const callIndex = source.indexOf("startTovuServer({");
  assert.notEqual(callIndex, -1, "expected a startTovuServer({...}) call");
  const body = source.slice(callIndex);
  const ownCall = body.slice(0, body.indexOf("});") + 3);
  assert.match(ownCall, /nodeToolchainEnv/, "expected the startTovuServer call to pass nodeToolchainEnv");
});
