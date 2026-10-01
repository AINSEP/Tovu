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
import vm from "node:vm";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawSource = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");

/** `main.ts` with every comment stripped — same helper as `main-mcp-announce-wiring.test.ts`, so a
 *  hazard named only in a comment (e.g. this file's own doc quoted back into main.ts) never
 *  false-positives a raw scan. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const source = withoutComments(rawSource);

/** Execute only the actual top-level toolchain try/catch, leaving Electron startup out of the test. */
function initializeToolchain(write: () => unknown, build: (input: unknown) => unknown, warnings: string[]): unknown {
  const parsed = ts.createSourceFile("main.ts", rawSource, ts.ScriptTarget.Latest, true);
  const guardedWrite = parsed.statements.find((statement) =>
    ts.isTryStatement(statement) && statement.tryBlock.getText(parsed).includes("writeNodeToolchain("),
  );
  assert.ok(guardedWrite, "the toolchain write must have its own guarding try/catch");
  const compiled = ts.transpileModule(`let NODE_TOOLCHAIN_ENV;\n${guardedWrite.getText(parsed)}\nNODE_TOOLCHAIN_ENV;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(compiled, {
    app: { getPath: () => "/user-data" },
    process: { execPath: "/electron" },
    DESKTOP_ROOTS: { npmRoot: "/npm" },
    writeNodeToolchain: write,
    buildNodeToolchainEnv: build,
    console: { warn: (message: string) => warnings.push(message) },
  });
}

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
  const warnings: string[] = [];
  let fallback: unknown;
  assert.doesNotThrow(() => {
    fallback = initializeToolchain(
      () => { throw new Error("disk full"); },
      () => { assert.fail("a failed write must not try to build a toolchain env"); },
      warnings,
    );
  });
  assert.equal(fallback, undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /could not write the bundled node toolchain.*disk full/);
});

test("startTovuServer is called with nodeToolchainEnv, so the write's result actually reaches the child", () => {
  const callIndex = source.indexOf("startTovuServer({");
  assert.notEqual(callIndex, -1, "expected a startTovuServer({...}) call");
  const body = source.slice(callIndex);
  const ownCall = body.slice(0, body.indexOf("});") + 3);
  assert.match(ownCall, /nodeToolchainEnv/, "expected the startTovuServer call to pass nodeToolchainEnv");
  assert.match(ownCall, /nodeToolchainEnv:\s*NODE_TOOLCHAIN_ENV\s*[,}]/, "the child must receive the written toolchain's environment");
  const environment = { TOVU_NODE_TOOLCHAIN_DIR: "/user-data/node-toolchain", TOVU_BUNDLED_NPM_ROOT: "/npm" };
  const warnings: string[] = [];
  const actual = initializeToolchain(
    () => ({ toolchainDir: "/user-data/node-toolchain" }),
    (input) => {
      assert.equal((input as { toolchainDir: string }).toolchainDir, "/user-data/node-toolchain");
      assert.equal((input as { npmRoot: string }).npmRoot, "/npm");
      return environment;
    },
    warnings,
  );
  assert.equal(actual, environment);
  assert.deepEqual(warnings, []);
});

test("a null writeNodeToolchain result (a launch from a disk image) is guarded, never dereferenced", () => {
  const writeIndex = source.indexOf("writeNodeToolchain(");
  const after = source.slice(writeIndex, writeIndex + 600);
  assert.match(after, /if \(toolchain\) NODE_TOOLCHAIN_ENV = buildNodeToolchainEnv\(\{ toolchainDir: toolchain\.toolchainDir/);
});
