/**
 * @file Tests for `smoke-native.ts`. Per the release plan (S3): unit-test the path resolution and
 * the result parsing, not the spawn of the packaged app — no packaged bundle is required to exist on
 * disk. `scripts/smoke-native.ts` (untested by this suite, like `scripts/verify-package.ts`'s own
 * `resolveAsarPath`) is the thin CLI that does the actual `readdirSync` + `spawnSync` against those
 * pure functions. The generated script itself is executed here: in a child Node against controlled
 * package fixtures, and in a VM against hostile paths.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

import { buildEntryLoadScript, buildSmokeScript, parseEntryLoadOutput, parseSmokeOutput, resolveSmokeTargets } from "./smoke-native.ts";

test("the generated script executes each staged package and reports its individual failure", () => {
  const root = mkdtempSync(path.join(tmpdir(), "smoke-script-"));
  const modules = path.join(root, "node_modules");
  const fixtures = {
    "better-sqlite3": `module.exports = class Database {
      constructor(name) { if (name !== ':memory:') throw Error('wrong database'); this.rows = new Map(); }
      exec(sql) { if (!sql.startsWith('CREATE TABLE smoke')) throw Error('wrong table'); }
      prepare(sql) { return sql.startsWith('INSERT')
        ? { run: (id, v) => this.rows.set(id, { v }) }
        : { get: (id) => this.rows.get(id) }; }
      close() {}
    };`,
    sharp: `module.exports = (bytes) => {
      if (!Buffer.isBuffer(bytes) || bytes.readUInt32BE(0) !== 0x89504e47) throw Error('not PNG');
      return { metadata: async () => ({ width: 1, height: 1 }) };
    };`,
    argon2: `module.exports = {
      hash: async (value) => 'fixture-hash:' + value,
      verify: async (hash, value) => hash === 'fixture-hash:' + value,
    };`,
  };
  try {
    for (const failing of [null, "better-sqlite3", "sharp", "argon2"] as const) {
      for (const [name, source] of Object.entries(fixtures)) {
        const folder = path.join(modules, name);
        mkdirSync(folder, { recursive: true });
        writeFileSync(path.join(folder, "index.js"), name === failing ? `throw Error('fixture ${name} failure');` : source);
      }
      const child = spawnSync(process.execPath, ["-e", buildSmokeScript(modules)], { cwd: root, encoding: "utf8", timeout: 5000 });
      assert.equal(child.error, undefined);
      assert.equal(child.status, failing === null ? 0 : 1, child.stderr);
      const expected: Record<string, unknown> = { betterSqlite3: { ok: true }, sharp: { ok: true }, argon2: { ok: true } };
      if (failing !== null) expected[failing === "better-sqlite3" ? "betterSqlite3" : failing] = { ok: false, error: `fixture ${failing} failure` };
      assert.deepEqual(JSON.parse(child.stdout), expected);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the generated script preserves hostile require paths exactly without executing injected statements", async () => {
  const directory = `/tmp/quote'and\\slash"; globalThis.injected = true; //`;
  const required: string[] = [];
  const output: string[] = [];
  const exits: number[] = [];
  const context = vm.createContext({
    Buffer,
    require(specifier: string) { required.push(specifier); throw new Error("fixture missing"); },
    console: { log: (value: string) => output.push(value), error: (value: string) => { throw new Error(value); } },
    process: { exit: (code: number) => exits.push(code) },
  });
  await vm.runInContext(buildSmokeScript(directory), context);
  assert.deepEqual(required, [path.join(directory, "better-sqlite3"), path.join(directory, "sharp"), path.join(directory, "argon2")]);
  assert.equal(context.injected, undefined);
  assert.deepEqual(exits, [1]);
  assert.equal(output.length, 1);
  assert.deepEqual(JSON.parse(output[0]!), {
    betterSqlite3: { ok: false, error: "fixture missing" }, sharp: { ok: false, error: "fixture missing" }, argon2: { ok: false, error: "fixture missing" },
  });
});

// --- resolveSmokeTargets: pure path resolution from an already-listed directory -----------------

test("resolves a mac-prefixed *.app layout (e.g. release/mac-arm64/Tovu.app)", () => {
  const targets = resolveSmokeTargets("/release", ["mac-arm64", "mac-arm64.blockmap"]);
  assert.equal(targets.executablePath, path.join("/release", "mac-arm64", "Tovu.app", "Contents", "MacOS", "Tovu"));
  assert.equal(
    targets.nodeModulesDir,
    path.join("/release", "mac-arm64", "Tovu.app", "Contents", "Resources", "tovu", "node_modules"),
  );
});

test("resolves a plain 'mac' output directory the same way as 'mac-arm64'", () => {
  const targets = resolveSmokeTargets("/release", ["mac"]);
  assert.equal(targets.executablePath, path.join("/release", "mac", "Tovu.app", "Contents", "MacOS", "Tovu"));
});

test("resolves a win-unpacked layout when no mac-prefixed directory is present", () => {
  const targets = resolveSmokeTargets("/release", ["win-unpacked", "builder-effective-config.yaml"]);
  assert.equal(targets.executablePath, path.join("/release", "win-unpacked", "Tovu.exe"));
  assert.equal(
    targets.nodeModulesDir,
    path.join("/release", "win-unpacked", "resources", "tovu", "node_modules"),
  );
});

test("a mac-prefixed directory takes precedence over win-unpacked when both are present", () => {
  // Never happens in the real CI matrix (one OS per runner), but the choice must be deterministic
  // rather than dependent on directory-listing order.
  const targets = resolveSmokeTargets("/release", ["win-unpacked", "mac-x64"]);
  assert.equal(targets.executablePath, path.join("/release", "mac-x64", "Tovu.app", "Contents", "MacOS", "Tovu"));
});

test("throws a clear error when neither layout is found under platformDir", () => {
  assert.throws(
    () => resolveSmokeTargets("/release", ["builder-debug.yml", "some-other-dir"]),
    /no mac.* or win-unpacked.* layout found under \/release/,
  );
});

test("an entry merely starting with 'mac' as a substring elsewhere is not mistaken for the mac layout (e.g. 'macos-notes')", () => {
  // Guards the prefix match itself: `startsWith("mac")` on the raw entry name, not a substring
  // search, so an unrelated leftover directory sharing a "mac" substring never triggers a wrong
  // resolution path silently.
  assert.throws(() => resolveSmokeTargets("/release", ["not-macos-related"]), /no mac.* or win-unpacked.* layout found/);
});

// --- parseSmokeOutput: pure result parsing, no spawn ---------------------------------------------

test("all three checks ok -> overall ok true", () => {
  const stdout = JSON.stringify({
    betterSqlite3: { ok: true },
    sharp: { ok: true },
    argon2: { ok: true },
  });
  const result = parseSmokeOutput(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.betterSqlite3.ok, true);
  assert.equal(result.sharp.ok, true);
  assert.equal(result.argon2.ok, true);
});

test("any single check failing makes the overall result false, and the failing check's error is preserved", () => {
  const stdout = JSON.stringify({
    betterSqlite3: { ok: true },
    sharp: { ok: false, error: "libvips not found" },
    argon2: { ok: true },
  });
  const result = parseSmokeOutput(stdout);
  assert.equal(result.ok, false);
  assert.equal(result.sharp.ok, false);
  assert.equal(result.sharp.error, "libvips not found");
  assert.equal(result.betterSqlite3.ok, true, "an unrelated passing check must not be dragged down");
});

test("malformed JSON is a parse failure, not a silent pass -- a safe stdout excerpt is included for diagnosis", () => {
  assert.throws(() => parseSmokeOutput("not json at all"), /could not parse smoke output as JSON/);
  try {
    parseSmokeOutput("not json at all");
    assert.fail("expected a throw");
  } catch (error) {
    assert.match((error as Error).message, /not json at all/);
  }
});

test("empty stdout (process crashed before printing) is a parse failure", () => {
  assert.throws(() => parseSmokeOutput(""), /could not parse smoke output as JSON/);
});

test("a missing check key (e.g. the child process died between checks) is treated as a failure, not skipped", () => {
  const stdout = JSON.stringify({ betterSqlite3: { ok: true }, sharp: { ok: true } }); // argon2 absent
  const result = parseSmokeOutput(stdout);
  assert.equal(result.ok, false);
  assert.equal(result.argon2.ok, false);
  assert.match(result.argon2.error ?? "", /missing/);
});

test("JSON that parses but is not an object (e.g. a bare number or array) is treated as every check missing, not a crash", () => {
  const result = parseSmokeOutput("42");
  assert.equal(result.ok, false);
  assert.equal(result.betterSqlite3.ok, false);
  assert.equal(result.sharp.ok, false);
  assert.equal(result.argon2.ok, false);
});

// --- buildSmokeScript: pure string generation -- syntax-checked, never executed -------------------

test("embeds the resolved node_modules dir as a JSON-quoted absolute require path for each package", () => {
  const script = buildSmokeScript("/release/mac-arm64/Tovu.app/Contents/Resources/tovu/node_modules");
  for (const pkg of ["better-sqlite3", "sharp", "argon2"]) {
    const expectedRequire = JSON.stringify(path.join("/release/mac-arm64/Tovu.app/Contents/Resources/tovu/node_modules", pkg));
    assert.ok(script.includes(expectedRequire), `script must require ${pkg} from the resolved node_modules dir`);
  }
});

test("a node_modules dir containing a quote or backslash is embedded safely (JSON.stringify escaping), not string-concatenated raw", () => {
  const dodgy = String.raw`C:\Program Files\Tovu"; process.exit(0); //`;
  const script = buildSmokeScript(dodgy);
  // `new Function` only PARSES the body; the top-level IIFE inside is never invoked because the
  // returned function is never called. A syntax error here means the embedding broke out of the
  // string literal it was meant to stay inside.
  assert.doesNotThrow(() => new Function(script), "the generated script must remain syntactically valid");
});

test("the generated script is syntactically valid JavaScript (constructible, never invoked)", () => {
  const script = buildSmokeScript("/some/node_modules");
  assert.doesNotThrow(() => new Function(script));
});

// --- buildEntryLoadScript / parseEntryLoadOutput: static import graph of the packaged entries ----

test("the entry-load script names all five shipped process entries", () => {
  const script = buildEntryLoadScript("/packaged/Resources");
  assert.ok(script.includes('require(join(asar, "package.json")).main'));
  assert.ok(script.includes('require(join(tovu, "dist", "runtime-manifest.json")).cliEntry'));
  for (const root of ["tovu", "asar"]) {
    assert.ok(script.includes(`join(dirname(createRequire(join(${root}, "package.json")).resolve("@jini-ai/mcp")), "bin", "serve.js")`));
  }
  assert.ok(script.includes('join(asar, "bin", "mcp-bridge.ts")'));
});

test("the entry-load script reports every unresolvable static import without evaluating any module", () => {
  const resources = mkdtempSync(path.join(tmpdir(), "smoke-entry-"));
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(resources, file)), { recursive: true });
    writeFileSync(path.join(resources, file), content);
  };
  const marker = path.join(resources, "evaluated");
  write("app.asar/package.json", JSON.stringify({ main: "main.mjs" }));
  write("app.asar/node_modules/present/package.json", JSON.stringify({ name: "present", type: "module", exports: "./index.js" }));
  write("app.asar/node_modules/present/index.js", `import "absent-peer"; export const value = 1;`);
  write("tovu/dist/runtime-manifest.json", JSON.stringify({ cliEntry: "dist/cli.mjs" }));
  write("tovu/dist/cli.mjs", `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "x");`);
  for (const root of ["app.asar", "tovu"]) {
    write(`${root}/node_modules/@jini-ai/mcp/package.json`, JSON.stringify({ name: "@jini-ai/mcp", type: "module", exports: "./dist/index.js" }));
    write(`${root}/node_modules/@jini-ai/mcp/dist/index.js`, "export {};");
    write(`${root}/node_modules/@jini-ai/mcp/dist/bin/serve.js`, "export {};");
  }
  write("app.asar/bin/mcp-bridge.ts", "export {};");
  const run = () => spawnSync(process.execPath, ["-e", buildEntryLoadScript(resources)], { cwd: resources, encoding: "utf8", timeout: 5000 });
  try {
    write("app.asar/main.mjs", `import { app } from "electron"; import { value } from "present"; export default [app, value];`);
    const failing = run();
    assert.equal(failing.status, 1, failing.stderr);
    const failed = parseEntryLoadOutput(failing.stdout);
    assert.equal(failed.ok, false);
    assert.equal(failed.unresolved.length, 1);
    assert.match(failed.unresolved[0]!, /^absent-peer \(from file:.*present\/index\.js\): ERR_MODULE_NOT_FOUND$/);
    write("app.asar/node_modules/present/index.js", `export const value = 1;`);
    const passing = run();
    assert.equal(passing.status, 0, passing.stderr);
    assert.deepEqual(parseEntryLoadOutput(passing.stdout), { ok: true, unresolved: [] });
    assert.equal(existsSync(marker), false, "no entry body may run");
    for (const root of ["app.asar", "tovu"]) {
      const bridge = `${root}/node_modules/@jini-ai/mcp/dist/bin/serve.js`;
      write(bridge, 'import "missing-bridge-peer";');
      const brokenBridge = parseEntryLoadOutput(run().stdout);
      assert.equal(brokenBridge.ok, false);
      assert.equal(brokenBridge.unresolved.length, 1);
      assert.match(brokenBridge.unresolved[0]!, /^missing-bridge-peer \(from file:.*serve\.js\): ERR_MODULE_NOT_FOUND$/);
      write(bridge, "export {};");
    }
    rmSync(path.join(resources, "tovu/dist/cli.mjs"));
    assert.match(parseEntryLoadOutput(run().stdout).unresolved.join("\n"), /cli\.mjs: nothing loaded/);
    rmSync(path.join(resources, "app.asar/package.json"));
    assert.match(parseEntryLoadOutput(run().stdout).unresolved[0]!, /package\.json/);
  } finally { rmSync(resources, { recursive: true, force: true }); }
});

test("entry-load output that is not JSON throws; any other shape fails", () => {
  assert.throws(() => parseEntryLoadOutput(""), /could not parse entry-load output as JSON/);
  assert.deepEqual(parseEntryLoadOutput("null"), { ok: false, unresolved: ["malformed entry-load output"] });
  assert.deepEqual(parseEntryLoadOutput(JSON.stringify({ ok: true })), { ok: false, unresolved: ["malformed entry-load output"] });
  assert.deepEqual(parseEntryLoadOutput(JSON.stringify({ ok: false, unresolved: [] })), { ok: false, unresolved: [] });
});


test("native smoke malformed JSON and module errors expose only bounded redacted diagnostics", () => {
  const secrets = [["ghp", "_", "x".repeat(36)], ["sk", "-", "x".repeat(40)], ["AK", "IA", "X".repeat(16)]].map(parts => parts.join(""));
  const homePath = path.join(homedir(), "private/addon.node");
  const detail = `native load failed ${secrets.join(" ")} ${homePath}\n` + "safe detail ".repeat(1000);
  for (const parse of [parseSmokeOutput, parseEntryLoadOutput]) {
    assert.throws(() => parse(detail), (error: Error) => {
      assert.match(error.message, /could not parse.*native load failed/s);
      for (const secret of secrets) assert.ok(!error.message.includes(secret));
      assert.ok(!error.message.includes(homePath));
      assert.ok(error.message.length < 2_100);
      return true;
    });
  }
  const failed = parseSmokeOutput(JSON.stringify({ betterSqlite3: { ok: false, error: detail } }));
  assert.equal(failed.ok, false);
  assert.match(failed.betterSqlite3.error!, /native load failed/);
  for (const secret of secrets) assert.ok(!JSON.stringify(failed).includes(secret));
  assert.ok(!JSON.stringify(failed).includes(homePath));
  assert.ok(failed.betterSqlite3.error!.length <= 2_000);
  const entries = parseEntryLoadOutput(JSON.stringify({ ok: false, unresolved: [detail] }));
  for (const secret of secrets) assert.ok(!JSON.stringify(entries).includes(secret));
  assert.ok(!JSON.stringify(entries).includes(homePath));
  assert.ok(entries.unresolved[0]!.length <= 2_000);
});
