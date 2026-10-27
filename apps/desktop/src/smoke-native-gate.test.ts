/**
 * @file `scripts/smoke-native.ts` — the packaged native-module + entry-import release gate — over
 * fake ports for the package (directory listing, existence, isolation copy, packaged child runs).
 * Nothing packaged is ever executed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { formatGateFailure, runSmokeNativeGate, runPackagedOwnerStoreStatus } from "../scripts/smoke-native.ts";
import type { SmokeNativePorts } from "../scripts/smoke-native.ts";
import type { OwnerStoreReply } from "./contracts/owner-store.ts";
import type { OwnerStoreCliOptions } from "./owner-store-cli.ts";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "smoke-native.ts");
const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NATIVE_OK = JSON.stringify({ betterSqlite3: { ok: true }, sharp: { ok: true }, argon2: { ok: true } });
const ENTRIES_OK = JSON.stringify({ ok: true, unresolved: [] });
const OWNER_OK: OwnerStoreReply<'status'> = { version: 1, ok: true, action: 'status', data: { legacy: 'none', entries: 0, grants: 0 } };

type Run = { status?: number | null; signal?: NodeJS.Signals | null; stdout?: string; stderr?: string; error?: Error };

/** Ports over a `release/mac-arm64/Tovu.app` layout; `runs` are the two packaged child outcomes. */
function ports(runs: Run[] = [{ stdout: NATIVE_OK }, { stdout: ENTRIES_OK }], overrides: Partial<SmokeNativePorts> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const spawned: { command: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string }[] = [];
  const queue = [...runs];
  const base: SmokeNativePorts = {
    readDirectory: () => ["mac-arm64", "builder-debug.yml"],
    exists: () => true,
    spawn: ((command: string, args: string[], options: { env: NodeJS.ProcessEnv; cwd: string }) => {
      spawned.push({ command, args, env: options.env, cwd: options.cwd });
      const run = queue.shift() ?? assert.fail("unexpected extra packaged run");
      return { status: 0, signal: null, stdout: "", stderr: "", pid: 1, output: [], ...run };
    }) as unknown as SmokeNativePorts["spawn"],
    isolate: async ({ targets, run }) => run(targets, "/isolated"),
    ownerStatus: async () => OWNER_OK,
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    env: { PATH: "/bin", NODE_PATH: "/leaky" },
  };
  return { ports: { ...base, ...overrides }, out, err, spawned };
}

const argv = ["--platform-dir", "release"];
const exe = path.join(DESKTOP_ROOT, "release", "mac-arm64", "Tovu.app", "Contents", "MacOS", "Tovu");

test("a healthy package passes both checks, run as Node with no inherited NODE_PATH", async () => {
  const fixture = ports();
  await runSmokeNativeGate({ argv }, fixture.ports);

  assert.equal(fixture.spawned.length, 2);
  for (const run of fixture.spawned) {
    assert.equal(run.command, exe);
    assert.equal(run.args[0], "-e");
    assert.equal(run.env.ELECTRON_RUN_AS_NODE, "1");
    assert.equal(run.env.NODE_PATH, "", "a host NODE_PATH would let a missing shipped module resolve anyway");
    assert.equal(run.cwd, path.dirname(exe));
  }
  assert.ok(fixture.out.some((line) => line.includes("better-sqlite3, sharp, and argon2 all round-tripped")));
  assert.ok(fixture.out.some(line => line.includes("every static import of the shell and server entries resolves")));
  assert.equal(fixture.out.at(-1), "smoke-native: OK — packaged owner-store status: no legacy owner store in an empty temporary profile\n");
  assert.deepEqual(fixture.err, []);
});

test("child stdout and stderr are echoed, bounded and redacted", async () => {
  const secret = ["ghp", "_", "q".repeat(36)].join("");
  const fixture = ports([{ stdout: `${NATIVE_OK}\n`, stderr: `warn ${secret}` }, { stdout: ENTRIES_OK, stderr: "entry warn" }]);
  await runSmokeNativeGate({ argv }, fixture.ports);
  assert.ok(fixture.err.length === 2 && !fixture.err.join("").includes(secret));
  assert.match(fixture.err[1]!, /entry warn/);
});

test("a missing or unreadable target is refused with a specific reason before anything is copied", async () => {
  const noIsolate = { isolate: async () => assert.fail("must not isolate") };
  const cases: [Partial<SmokeNativePorts>, string[], RegExp][] = [
    [{}, [], /^smoke-native: --platform-dir <dir> is required$/],
    [{}, ["--platform-dir"], /^smoke-native: --platform-dir <dir> is required$/],
    [{ readDirectory: () => { throw new Error("ENOENT: no such directory"); } }, argv, /^smoke-native: cannot read .*release: ENOENT: no such directory$/],
    [{ readDirectory: () => ["linux-unpacked"] }, argv, /no mac-prefixed \*\.app layout or win-unpacked layout/],
    [{ exists: (target) => !target.endsWith("Tovu") }, argv, /^smoke-native: resolved executable does not exist: /],
    [{ exists: (target) => !target.endsWith("node_modules") }, argv, /^smoke-native: resolved node_modules dir does not exist: /],
  ];
  for (const [overrides, args, expected] of cases) {
    await assert.rejects(runSmokeNativeGate({ argv: args }, ports([], { ...noIsolate, ...overrides }).ports), { message: expected });
  }
});

test("native-module child failures: spawn error, non-zero exit, unparseable output, and a failed module", async () => {
  const cases: [Run, RegExp][] = [
    [{ error: new Error("spawnSync EACCES"), status: null }, /^smoke-native: failed to spawn .*Tovu: spawnSync EACCES$/],
    [{ status: 1, stdout: "partial" }, /^smoke-native: child failed \(code 1, signal none\)\npartial$/],
    [{ status: null, signal: "SIGKILL", stdout: undefined }, /^smoke-native: child failed \(code none, signal SIGKILL\)\n$/],
    [{ stdout: "not json" }, /could not parse smoke output as JSON/],
    [{ stdout: JSON.stringify({ betterSqlite3: { ok: true }, sharp: { ok: false, error: "dlopen" }, argon2: { ok: true } }) },
      /^smoke-native: one or more native modules failed inside the packaged binary$/],
  ];
  for (const [run, expected] of cases) {
    const fixture = ports([run]);
    await assert.rejects(runSmokeNativeGate({ argv }, fixture.ports), { message: expected });
    assert.equal(fixture.spawned.length, 1, "the entry-import check never runs after a native failure");
  }
});

test("entry-import child failures: spawn error, non-zero exit, unparseable output, and unresolved imports", async () => {
  const cases: [Run, RegExp][] = [
    [{ error: new Error("spawnSync ENOENT"), status: null }, /^smoke-native: failed to spawn .*Tovu: spawnSync ENOENT$/],
    [{ status: 2, stdout: "trace" }, /^smoke-native: entry-load child failed \(code 2, signal none\)\ntrace$/],
    [{ status: null, signal: "SIGTERM", stdout: undefined }, /^smoke-native: entry-load child failed \(code none, signal SIGTERM\)\n$/],
    [{ stdout: "{oops" }, /could not parse entry-load output as JSON/],
    [{ stdout: JSON.stringify({ ok: false, unresolved: ["@jini-ai/oauth", "left-pad"] }) },
      /^smoke-native: packaged entries import modules the app does not ship:\n {2}@jini-ai\/oauth\n {2}left-pad$/],
  ];
  for (const [run, expected] of cases) {
    const fixture = ports([{ stdout: NATIVE_OK }, run]);
    await assert.rejects(runSmokeNativeGate({ argv }, fixture.ports), { message: expected });
  }
  // An entry-load child with no stdout at all is malformed, not a pass.
  await assert.rejects(runSmokeNativeGate({ argv }, ports([{ stdout: NATIVE_OK }, { stdout: undefined }]).ports), /could not parse entry-load output/);
});

test("a native child with no stdout at all fails as unparseable rather than passing", async () => {
  await assert.rejects(runSmokeNativeGate({ argv }, ports([{ stdout: undefined }]).ports), /could not parse smoke output as JSON/);
});

test("formatGateFailure prints an Error's message or a non-Error value, bounded", () => {
  assert.equal(formatGateFailure(new Error("smoke-native: nope")), "smoke-native: nope\n");
  assert.equal(formatGateFailure(42), "42\n");
  assert.ok(formatGateFailure(new Error("x".repeat(5000))).length <= 2_001);
});

test("the real entry with no --platform-dir prints the refusal and exits 1", () => {
  const child = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", SCRIPT], { encoding: "utf8", timeout: 60_000 });
  assert.equal(child.status, 1);
  assert.equal(child.stderr, "smoke-native: --platform-dir <dir> is required\n");
});

test('owner-store check receives the isolated Windows payload and cleanup runs on failure', async () => {
  let cleaned = false;
  const directory = path.resolve('isolated profile');
  const targets = { executablePath: path.join(directory, 'win-unpacked', 'Tovu.exe'),
    nodeModulesDir: path.join(directory, 'win-unpacked', 'resources', 'tovu', 'node_modules') };
  const fixture = ports(undefined, {
    readDirectory: () => ['win-unpacked'],
    isolate: async ({ run }) => { try { await run(targets, directory); } finally { cleaned = true; } },
    ownerStatus: async input => {
      assert.deepEqual(input, { targets, directory });
      return { version: 1, ok: false, action: 'status', error: { code: 'operation-failed', message: 'not echoed' } };
    },
  });
  await assert.rejects(runSmokeNativeGate({ argv }, fixture.ports), {
    message: 'smoke-native: packaged owner-store status failed or profile was not empty',
  });
  assert.equal(cleaned, true);
  assert.equal(fixture.out.join('').includes('not echoed'), false);
});

test('owner-store adapter reuses the CLI transport and substitutes the shipped executable', async () => {
  const directory = path.resolve('isolated gate');
  const targets = { executablePath: path.join(directory, 'Tovu.exe'), nodeModulesDir: path.join(directory, 'resources', 'tovu', 'node_modules') };
  const fakeSecret = ['fixture', 'not-in-child-env', String(123)].join('-');
  let inputSeen: unknown;
  let optionsSeen: OwnerStoreCliOptions | undefined;
  let spawnSeen: unknown;
  const reply = await runPackagedOwnerStoreStatus({ targets, directory }, {
    env: { PATH: '/os-bin', NODE_PATH: '/checkout/node_modules', TOVU_CONTENT_DB: '/real/content.db', API_KEY: fakeSecret },
    runCli: async (input, options) => { inputSeen = input; optionsSeen = options; return OWNER_OK; },
    spawnFn: ((command, args, options) => { spawnSeen = { command, args, options }; return {} as never; }),
  });
  assert.deepEqual(reply, OWNER_OK);
  assert.deepEqual(inputSeen, { repoRoot: path.dirname(targets.nodeModulesDir), userDataDir: path.join(directory, 'owner-profile'), action: 'status', fields: {} });
  assert.equal(optionsSeen!.cliMode, 'compiled');
  assert.equal(optionsSeen!.baseEnv!.HOME, directory);
  assert.equal(optionsSeen!.baseEnv!.APPDATA, directory);
  assert.equal(optionsSeen!.baseEnv!.NODE_PATH, '');
  assert.equal(optionsSeen!.baseEnv!.TOVU_CONTENT_DB, undefined);
  assert.equal(JSON.stringify(optionsSeen!.baseEnv).includes(fakeSecret), false);
  const args = ['payload/cli.js', 'owner-store', 'status', '--json'];
  optionsSeen!.spawnFn!('runner-node', args, { stdio: ['pipe', 'pipe', 'pipe'], env: optionsSeen!.baseEnv });
  assert.deepEqual(spawnSeen, { command: targets.executablePath, args,
    options: { stdio: ['pipe', 'pipe', 'pipe'], env: optionsSeen!.baseEnv, cwd: directory } });
});
