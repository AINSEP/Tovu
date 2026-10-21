/**
 * @file Tests for `smoke-packaged-chat-gate.ts` — the adapters behind the owner's packaged chat
 * release gate. A whole gate run is driven through `smokePackagedChatCli` against hand-written fakes:
 * a process-group table answering `kill(-pgid, 0)`, a `ps`/`chmod`/packaged-SQLite `spawnSync`, an
 * HTTP router standing in for the packaged server, and fake init/serve launchers that call the
 * gate's own `spawnFn`. Real temporary directories hold the lock, scratch home and site. The last
 * test runs `scripts/smoke-packaged-chat.ts` itself, which must refuse without a `--platform-dir`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ChildProcess, spawnSync as realSpawnSync } from "node:child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptions, SpawnSyncReturns } from "node:child_process";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import * as fsp from "node:fs/promises";
import { existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PackagedGateIsolationError } from "./packaged-gate-isolation.ts";
import { smokePackagedChatCli, withInterruptSignal } from "./smoke-packaged-chat-gate.ts";
import type { ChatGateDeps, GateFs } from "./smoke-packaged-chat-gate.ts";
import { PACKAGED_CHAT_PROMPT, PackagedChatSmokeError } from "./smoke-packaged-chat.ts";
import { resolveSmokeTargets } from "./smoke-native.ts";
import { buildServeEnv } from "./tovu-server.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = 777;
const INIT_PID = 301;
const SERVER_PID = 501;
const DAEMON_PID = 900;
const GENERIC = "smoke-packaged-chat: Gate or teardown failed; no draft may be created.\n";
const PASS = "smoke-packaged-chat: PASS (jini connected, site_guide overview returned, DONE; teardown complete)\n";

const init = { kind: "raw", line: JSON.stringify({ type: "system", subtype: "init", mcp_servers: [{ name: "jini", status: "connected" }] }) };
const toolUse = { kind: "tool_use", id: "gw", name: "mcp__jini__execute_readonly_delegated_tool", input: { toolId: "site_guide", input: { operation: "overview" } } };
const toolResult = { kind: "tool_result", toolUseId: "gw", isError: false, content: "overview" };

function errno(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/** An unspawned, piped `ChildProcess` carrying only the pid the gate records. */
function child(pid: number | undefined): ChildProcessWithoutNullStreams {
  const [stdin, stdout, stderr] = [new PassThrough(), new PassThrough(), new PassThrough()];
  const created = Object.assign(new ChildProcess(), { stdin, stdout, stderr, stdio: [stdin, stdout, stderr, undefined, undefined] as [PassThrough, PassThrough, PassThrough, undefined, undefined] });
  Object.defineProperty(created, "pid", { value: pid });
  return created;
}

function spawnResult(fields: Partial<SpawnSyncReturns<string>>): SpawnSyncReturns<string> {
  return { pid: 1, output: [], stdout: "", stderr: "", status: 0, signal: null, ...fields };
}

/** The packaged server's HTTP surface, scripted per route. */
interface Router {
  bootCookie: string[];
  bootBody: boolean;
  agents: Response[];
  chatStatus: number;
  runStates: string[];
}

/** One scripted gate run: real temp dirs, fake processes, fake HTTP. */
function scenario(t: test.TestContext, tweak: (s: ReturnType<typeof base>) => void = () => {}) {
  const s = base();
  tweak(s);
  t.after(() => rmSync(s.tmp, { recursive: true, force: true }));
  return s;
}

function base() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "smoke-gate-"));
  const desktopRoot = path.join(tmp, "desktop");
  const isolated = path.join(tmp, "isolated");
  mkdirSync(path.join(desktopRoot, "release", "mac-arm64", "Tovu.app"), { recursive: true });
  mkdirSync(isolated, { recursive: true });
  const log: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const requests: { route: string; method: string; body?: string; cookie?: string }[] = [];
  const spawned: { command: string; args: string[]; options: SpawnOptions }[] = [];
  const signals: string[] = [];
  const stopped: number[][] = [];
  const timers: { callback: () => void; ms: number }[] = [];
  const cleared: unknown[] = [];
  const delays: number[] = [];
  const alive = new Set<number>([INIT_PID, SERVER_PID]);
  const controller = new AbortController();
  const router: Router = {
    bootCookie: ["tovu_session=abc; Path=/; HttpOnly", "csrf=1; Path=/"], bootBody: true,
    agents: [new Response(null, { status: 503 }), Response.json({ agents: [{ id: "claude", models: [{ id: "haiku" }] }] })],
    chatStatus: 201, runStates: ["running", "succeeded"],
  };
  let siteDir = "";
  const evidenceRows: (object | null | "garbage" | "fail")[] = [];
  const s = {
    tmp, desktopRoot, isolated, log, out, err, requests, spawned, signals, stopped, timers, cleared, delays, alive, controller, router,
    evidenceRows, get siteDir() { return siteDir; },
    initPid: INIT_PID as number | undefined,
    serverBootToken: "boot-1" as string | null,
    serverStops: 0,
    killError: undefined as Error | undefined,
    psStatus: 0, psOutput: () => `  ${INIT_PID} Z\n`,
    chmodStatus: 0,
    snapshots: [{ pid: SELF, ppid: 1, command: "node smoke" }, { pid: DAEMON_PID, ppid: 1, command: "node /x/agent-daemon-server.js --port 1" }],
    remaining: [] as number[],
    daemonRegistry: JSON.stringify({ pid: DAEMON_PID }) as string | undefined,
    startFailure: undefined as Error | undefined,
    afterStart: () => {},
    deps: undefined as unknown as ChatGateDeps,
  };
  evidenceRows.push({ run_id: "run-1", run_status: "running", content: "", attempt_base_json: "[]", events_json: "[]" },
    { run_id: "run-1", run_status: "succeeded", content: "DONE", attempt_base_json: "[]", events_json: JSON.stringify([init, toolUse, toolResult]) });

  /** The last scripted answer repeats once a queue is down to one. */
  const next = <T,>(queue: T[]): T => (queue.length > 1 ? queue.shift()! : queue[0]!);
  const bootSession = () => {
    const response = new Response(router.bootBody ? "{}" : null, { status: 200 });
    for (const cookie of router.bootCookie) response.headers.append("set-cookie", cookie);
    return response;
  };
  const chats = () => {
    if (router.chatStatus === 201) return Response.json({ conversation: { id: "conv-1" } }, { status: 201 });
    return new Response(router.chatStatus === 403 ? JSON.stringify({ error: "raw server detail" }) : null, { status: router.chatStatus });
  };
  const routes: Record<string, () => Response> = {
    "/api/admin/v1/auth/boot-session": bootSession,
    "/api/agents": () => next(router.agents),
    "/api/assistant/chats": chats,
    "/api/runs": () => Response.json({ run: { id: "run-1" } }, { status: 201 }),
  };
  const runStatus = () => Response.json({ run: { state: next(router.runStates) } });
  let uuid = 0;
  const fs: GateFs = {
    mkdir: (target, options) => fsp.mkdir(target, options),
    mkdtemp: async (prefix) => { siteDir = await fsp.mkdtemp(prefix); return siteDir; },
    readFile: (target, encoding) => fsp.readFile(target, encoding),
    readdir: (target) => fsp.readdir(target),
    rm: (target, options) => fsp.rm(target, options),
    symlink: (target, linkPath) => fsp.symlink(target, linkPath),
    writeFile: (target, data) => { log.push(`write ${path.basename(target)} ${data.trim()}`); return fsp.writeFile(target, data); },
  };
  const deps: ChatGateDeps = {
    desktopRoot, scratchRoot: path.join(tmp, "scratch"),
    argv: ["--platform-dir", "release/mac-arm64"], platform: "darwin", pid: SELF,
    env: { PATH: "/bin", NODE_OPTIONS: "--inspect" }, signal: controller.signal,
    fs,
    userInfo: () => ({ homedir: path.join(tmp, "user") }),
    spawn(command, args, options) {
      spawned.push({ command, args, options });
      return child(args[1] === "serve" ? SERVER_PID : s.initPid);
    },
    spawnSync(command, args) {
      if (command === "ps") return spawnResult({ status: s.psStatus, stdout: s.psOutput() });
      if (command === "chmod") { log.push(`chmod ${args.join(" ")}`); return spawnResult({ status: s.chmodStatus }); }
      const row = next(evidenceRows);
      if (row === "fail") return spawnResult({ status: 1 });
      if (row === "garbage") return spawnResult({ stdout: "{not json" });
      return spawnResult({ stdout: JSON.stringify(row) });
    },
    kill(pid, signal) {
      if (s.killError) throw s.killError;
      const group = -pid;
      if (!alive.has(group)) throw errno("ESRCH");
      if (signal !== 0) { signals.push(`${String(signal)} ${group}`); alive.delete(group); }
      return true;
    },
    async fetch(input, init = {}) {
      const url = new URL(String(input));
      const headers = new Headers(init.headers);
      requests.push({ route: url.pathname, method: init.method ?? "GET", body: init.body as string | undefined, cookie: headers.get("cookie") ?? undefined });
      return (routes[url.pathname] ?? runStatus)();
    },
    async delay(ms, _value, options) { delays.push(ms); options?.signal?.throwIfAborted(); },
    setTimeout(callback, ms) { timers.push({ callback, ms }); return globalThis.setTimeout(() => {}, 0); },
    clearTimeout(handle) { cleared.push(handle); },
    randomUUID: () => { uuid += 1; return `uuid-${uuid}`; },
    processes: {
      listProcessSnapshots: async () => s.snapshots,
      collectProcessTreePids: (_snapshots, roots) => roots.filter((pid): pid is number => typeof pid === "number"),
      stopProcesses: async (pids) => {
        stopped.push(pids.filter((pid): pid is number => typeof pid === "number"));
        return { alreadyStopped: false, forcedPids: [], matchedPids: [], remainingPids: s.remaining, stoppedPids: [] };
      },
    },
    allocatePort: async () => 4100,
    buildServeEnv(input, options) {
      options?.warn?.("site .env could not be read: raw detail");
      return buildServeEnv(input, options);
    },
    async initSiteDir(input) {
      log.push(`init ${input.cliMode} admin=${input.adminPassword}`);
      input.spawnFn!("ignored", ["init", input.dir], { env: input.baseEnv });
      return input.dir;
    },
    async startTovuServer(input) {
      input.spawnFn!("ignored", ["ignored"], { env: input.baseEnv });
      // The real server mirrors its boot output, which can echo credentials.
      input.mirror!.stdout.write("tovu serve: bootToken=boot-1\n");
      input.mirror!.stderr.write("raw stderr\n");
      if (s.startFailure) throw s.startFailure;
      mkdirSync(path.join(input.siteDir, "ops", "logs"), { recursive: true });
      await fsp.writeFile(path.join(input.siteDir, "ops", "logs", "daemon.log"), "[agent-daemon] jini bridge preflight ok (42ms)\n");
      if (s.daemonRegistry !== undefined) await fsp.writeFile(path.join(input.siteDir, "ops", "assistant-daemon.json"), s.daemonRegistry);
      s.afterStart();
      return {
        port: 4100, pid: SERVER_PID, origin: "http://127.0.0.1:4100", adminUrl: "http://127.0.0.1:4100/admin/",
        workspaceId: "ws", schemaVersion: 1, bootToken: s.serverBootToken,
        async stop() { s.serverStops += 1; }, onExit() {},
      };
    },
    resolveSmokeTargets,
    async withIsolatedSmokeTargets({ targets, run }) { await run(targets, isolated); },
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
  };
  s.deps = deps;
  return s;
}

test("a full gate run authenticates, chats on Haiku, verifies evidence, tears every group down and PASSes", async (t) => {
  const s = scenario(t);
  assert.equal(await smokePackagedChatCli(s.deps), 0);
  // Nothing raw reaches the gate's own output: no boot line, no serve-env warning.
  assert.deepEqual(s.err, []);
  assert.deepEqual(s.out, [PASS]);
  // The shared lock was taken with this pid and released.
  assert.ok(s.log.includes(`write owner smoke-packaged-chat ${SELF}`));
  assert.ok(!existsSync(path.join(s.tmp, "scratch", "test-lock")));
  // Scratch home: everything private, only the Keychains borrowed.
  const home = path.join(s.isolated, "home");
  assert.equal(readlinkSync(path.join(home, "Library", "Keychains")), path.join(s.tmp, "user", "Library", "Keychains"));
  const [initSpawn, serveSpawn] = s.spawned;
  const app = path.join(s.desktopRoot, "release", "mac-arm64", "Tovu.app");
  assert.equal(initSpawn!.command, path.join(app, "Contents", "MacOS", "Tovu"));
  assert.deepEqual(initSpawn!.args, ["init", s.siteDir]);
  assert.equal(initSpawn!.options.detached, true);
  assert.equal(initSpawn!.options.signal, s.controller.signal);
  assert.equal(serveSpawn!.args.slice(1).join(" "), `serve ${s.siteDir} --port 4100 --emit-boot-token`);
  const env = serveSpawn!.options.env!;
  assert.equal(env.HOME, home);
  assert.equal(env.TOVU_SITES_HOME, path.join(home, "Documents", "Tovu"));
  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(env.NODE_OPTIONS, undefined, "an inherited dev loader never reaches the packaged server");
  assert.ok(s.log.includes("init compiled admin=uuid-1"));
  // HTTP: token redemption first (no cookie yet), then cookie-authenticated calls.
  assert.deepEqual(s.requests.map((r) => `${r.method} ${r.route}`), [
    "POST /api/admin/v1/auth/boot-session", "GET /api/agents", "GET /api/agents", "POST /api/assistant/chats",
    "POST /api/runs", "GET /api/runs/run-1", "GET /api/runs/run-1",
  ]);
  assert.equal(s.requests[0]!.cookie, undefined);
  assert.equal(s.requests[0]!.body, JSON.stringify({ token: "boot-1" }));
  assert.ok(s.requests.slice(1).every((r) => r.cookie === "tovu_session=abc; csrf=1"));
  const context = JSON.parse(JSON.parse(s.requests[4]!.body!).contextRef);
  assert.equal(context.prompt, PACKAGED_CHAT_PROMPT);
  assert.equal(context.model, "haiku");
  assert.equal(context.conversationId, "conv-1");
  assert.equal(s.timers[0]!.ms, 180_000);
  assert.equal(s.cleared.length, 1);
  // Teardown: the init group (no daemon registered yet), then the server group with the
  // registered daemon's own tree.
  assert.deepEqual(s.signals, [`SIGTERM ${INIT_PID}`, `SIGTERM ${SERVER_PID}`]);
  assert.deepEqual(s.stopped, [[INIT_PID], [SERVER_PID, DAEMON_PID]]);
  assert.equal(s.serverStops, 1);
  assert.ok(s.log.includes(`chmod -R u+w ${s.siteDir}`));
  assert.ok(!existsSync(s.siteDir));
});

test("--platform-dir must be given, and must name one native mac output", async (t) => {
  const seen: string[] = [];
  const targetsOf = async (argv: string[], prepare: (root: string) => void = () => {}) => {
    const s = scenario(t);
    prepare(s.desktopRoot);
    s.deps.argv = argv;
    s.deps.withIsolatedSmokeTargets = async ({ targets }) => { seen.push(path.relative(s.desktopRoot, targets.executablePath)); };
    return { code: await smokePackagedChatCli(s.deps), err: s.err };
  };
  const usage = "smoke-packaged-chat: Usage: npm run smoke:packaged-chat -- --platform-dir release/mac-arm64\n";
  for (const argv of [[], ["--platform-dir"], ["--platform-dir", "--verbose"]]) assert.deepEqual(await targetsOf(argv), { code: 1, err: [usage] });
  assert.deepEqual(await targetsOf(["--platform-dir", "release/mac-arm64"]), { code: 0, err: [] });
  assert.deepEqual(await targetsOf(["--platform-dir", "release"]), { code: 0, err: [] });
  assert.deepEqual(await targetsOf(["--platform-dir", "release"], (root) => mkdirSync(path.join(root, "release", "mac", "Tovu.app"), { recursive: true })),
    { code: 1, err: ["smoke-packaged-chat: Choose a single native mac* output with --platform-dir.\n"] });
  assert.deepEqual(seen, [path.join("release/mac-arm64/Tovu.app/Contents/MacOS/Tovu"), path.join("release/mac-arm64/Tovu.app/Contents/MacOS/Tovu")]);
  const linux = scenario(t);
  linux.deps.platform = "linux";
  assert.equal(await smokePackagedChatCli(linux.deps), 1);
  assert.deepEqual(linux.err, ["smoke-packaged-chat: Packaged chat smoke requires the owner's Mac and a logged-in Claude CLI.\n"]);
});

test("a held lock is waited on, never stolen; an aborted wait or unexpected mkdir error fails the gate", async (t) => {
  const s = scenario(t);
  let attempts = 0;
  const mkdir = s.deps.fs.mkdir;
  s.deps.fs.mkdir = async (target, options) => {
    if (target.endsWith("test-lock") && attempts++ === 0) throw errno("EEXIST");
    return mkdir(target, options);
  };
  assert.equal(await smokePackagedChatCli(s.deps), 0);
  assert.equal(s.delays[0], 1_000);

  const aborted = scenario(t);
  aborted.deps.fs.mkdir = async (target, options) => {
    if (target.endsWith("test-lock")) { aborted.controller.abort(); throw errno("EEXIST"); }
    return mkdir(target, options);
  };
  assert.equal(await smokePackagedChatCli(aborted.deps), 1);
  assert.deepEqual(aborted.err, [GENERIC]);

  const denied = scenario(t);
  denied.deps.fs.mkdir = async (target, options) => { if (target.endsWith("test-lock")) throw errno("EACCES"); return mkdir(target, options); };
  assert.equal(await smokePackagedChatCli(denied.deps), 1);
  assert.deepEqual(denied.err, [GENERIC]);
  assert.deepEqual(denied.spawned, [], "nothing launches without the lock");
});

test("a lock whose owner file cannot be written is removed before failing", async (t) => {
  const s = scenario(t);
  s.deps.fs.writeFile = async () => { throw errno("ENOSPC"); };
  assert.equal(await smokePackagedChatCli(s.deps), 1);
  assert.deepEqual(s.err, [GENERIC]);
  assert.ok(!existsSync(path.join(s.tmp, "scratch", "test-lock")));
});

test("EPERM on a zombie-only group asks ps, waiting while a live member remains", async (t) => {
  const s = scenario(t);
  // INIT group answers EPERM throughout: first a live member, then a member ps prints with no stat
  // (still counted live — only a Z stat proves a zombie), then only a zombie beside another group.
  const probes = [`  ${INIT_PID} S\n`, `  ${INIT_PID}\n`, `  ${INIT_PID} Z+\n\n  12 S\n`];
  s.psOutput = () => probes.length > 1 ? probes.shift()! : probes[0]!;
  const kill = s.deps.kill;
  s.deps.kill = (pid, signal) => {
    if (-pid === INIT_PID) { if (signal === 0) throw errno("EPERM"); s.signals.push(`${String(signal)} ${INIT_PID}`); return true; }
    return kill(pid, signal);
  };
  assert.equal(await smokePackagedChatCli(s.deps), 0);
  assert.deepEqual(s.signals, [`SIGTERM ${INIT_PID}`, `SIGTERM ${SERVER_PID}`]);
  assert.equal(s.delays.filter((ms) => ms === 100).length, 1, "one bounded wait while the stat-less member was listed");
});

test("teardown failures are fixed diagnostics: ps unusable, a group that never exits, an unexpected kill error", async (t) => {
  const psDown = scenario(t, (s) => { s.psStatus = 1; s.killError = errno("EPERM"); });
  assert.equal(await smokePackagedChatCli(psDown.deps), 1);
  assert.ok(psDown.err.includes("smoke-packaged-chat: Could not list processes to verify teardown.\n"));

  const immortal = scenario(t);
  immortal.deps.kill = () => true;
  assert.equal(await smokePackagedChatCli(immortal.deps), 1);
  assert.ok(immortal.err.includes("smoke-packaged-chat: Packaged server process group survived teardown.\n"));
  // 50 bounded waits after SIGTERM and 50 after SIGKILL — twice, because start's own partial-start
  // cleanup retries the init group's teardown once before rejecting.
  assert.equal(immortal.delays.filter((ms) => ms === 100).length, 200);
  assert.deepEqual(immortal.spawned.map((item) => item.args[0]), ["init"], "serve never launches after a failed init teardown");

  const weird = scenario(t, (s) => { s.killError = errno("EINVAL"); });
  assert.equal(await smokePackagedChatCli(weird.deps), 1);
  assert.ok(weird.err.every((line) => line === GENERIC));
});

test("the daemon registry decides which extra tree is stopped, and an unreadable one fails verification", async (t) => {
  const missing = scenario(t, (s) => { s.daemonRegistry = undefined; });
  assert.equal(await smokePackagedChatCli(missing.deps), 0);
  assert.deepEqual(missing.stopped, [[INIT_PID], [SERVER_PID]]);

  const impostor = scenario(t, (s) => { s.snapshots = [{ pid: SELF, ppid: 1, command: "node smoke" }, { pid: DAEMON_PID, ppid: 1, command: "vim agent-daemon-server.js.bak" }]; });
  assert.equal(await smokePackagedChatCli(impostor.deps), 0);
  assert.deepEqual(impostor.stopped[1], [SERVER_PID]);

  const gone = scenario(t, (s) => { s.daemonRegistry = JSON.stringify({ pid: 12345 }); });
  assert.equal(await smokePackagedChatCli(gone.deps), 0);
  assert.deepEqual(gone.stopped[1], [SERVER_PID]);

  const corrupt = scenario(t, (s) => { s.daemonRegistry = "{"; });
  assert.equal(await smokePackagedChatCli(corrupt.deps), 1);
  assert.deepEqual(corrupt.err, ["smoke-packaged-chat: Packaged process tree teardown could not be verified.\n"]);
});

test("surviving pids, or a snapshot that lost this process, fail teardown verification", async (t) => {
  for (const tweak of [(s: ReturnType<typeof base>) => { s.remaining = [4444]; },
    (s: ReturnType<typeof base>) => { s.snapshots = [{ pid: DAEMON_PID, ppid: 1, command: "node agent-daemon-server.js" }]; }]) {
    const s = scenario(t, tweak);
    assert.equal(await smokePackagedChatCli(s.deps), 1);
    assert.ok(s.err.every((line) => line === "smoke-packaged-chat: Packaged process tree teardown could not be verified.\n"));
  }
});

test("partial start: a server that dies after spawning, or emits no boot token, still has its group stopped", async (t) => {
  const dies = scenario(t, (s) => { s.startFailure = new Error("serve exited 1: raw child output with secrets"); s.initPid = undefined; });
  assert.equal(await smokePackagedChatCli(dies.deps), 1);
  assert.deepEqual(dies.err, [GENERIC], "raw upstream errors are never printed");
  assert.deepEqual(dies.signals, [`SIGTERM ${SERVER_PID}`]);
  assert.equal(dies.serverStops, 0);

  const tokenless = scenario(t, (s) => { s.serverBootToken = null; });
  assert.equal(await smokePackagedChatCli(tokenless.deps), 1);
  assert.deepEqual(tokenless.err, ["smoke-packaged-chat: Packaged server emitted no boot token.\n"]);
  assert.deepEqual(tokenless.signals, [`SIGTERM ${INIT_PID}`, `SIGTERM ${SERVER_PID}`]);

  const interrupted = scenario(t, (s) => { s.afterStart = () => s.controller.abort(); });
  assert.equal(await smokePackagedChatCli(interrupted.deps), 1);
  assert.deepEqual(interrupted.signals.at(-1), `SIGTERM ${SERVER_PID}`);
  assert.equal(interrupted.serverStops, 0);
});

test("HTTP failures are body-free diagnostics", async (t) => {
  const s = scenario(t, (x) => { x.router.chatStatus = 500; });
  assert.equal(await smokePackagedChatCli(s.deps), 1);
  assert.deepEqual(s.err, ["smoke-packaged-chat: Packaged chat HTTP 500 at /api/assistant/chats.\n"]);
  assert.equal(s.serverStops, 1, "the server is still stopped");

  const forbidden = scenario(t, (x) => { x.router.chatStatus = 403; });
  assert.equal(await smokePackagedChatCli(forbidden.deps), 1);
  assert.deepEqual(forbidden.err, ["smoke-packaged-chat: Packaged chat HTTP 403 at /api/assistant/chats.\n"], "the response body is never echoed");

  const cookieless = scenario(t, (x) => { x.router.bootCookie = []; x.router.bootBody = false; });
  assert.equal(await smokePackagedChatCli(cookieless.deps), 1);
  assert.deepEqual(cookieless.err, ["smoke-packaged-chat: Boot-session redemption set no session cookie.\n"]);
});

test("Claude discovery that never becomes ready, or a failed run, fails the gate", async (t) => {
  const pending = scenario(t, (x) => { x.router.agents = [new Response(null, { status: 503 })]; });
  pending.deps.fetch = ((fetch) => async (input: string | URL | Request, init?: RequestInit) =>
    new URL(String(input)).pathname === "/api/agents" ? new Response(null, { status: 503 }) : fetch(input, init))(pending.deps.fetch);
  assert.equal(await smokePackagedChatCli(pending.deps), 1);
  assert.deepEqual(pending.err, ["smoke-packaged-chat: Packaged Claude discovery did not become ready.\n"]);
  assert.equal(pending.delays.filter((ms) => ms === 500).length, 60);

  for (const state of ["failed", "cancelled"]) {
    const failed = scenario(t, (x) => { x.router.runStates = [state]; });
    assert.equal(await smokePackagedChatCli(failed.deps), 1);
    assert.deepEqual(failed.err, ["smoke-packaged-chat: The packaged Claude run failed or was canceled.\n"]);
  }
});

test("the 180 s run deadline aborts in-flight polling", async (t) => {
  const s = scenario(t, (x) => { x.router.runStates = ["running"]; });
  const delay = s.deps.delay;
  s.deps.delay = async (ms, value, options) => {
    if (ms === 500 && s.requests.at(-1)?.route === "/api/runs/run-1") s.timers[0]!.callback();
    return delay(ms, value, options);
  };
  assert.equal(await smokePackagedChatCli(s.deps), 1);
  assert.deepEqual(s.err, [GENERIC]);
  assert.equal(s.cleared.length, 1);
});

test("packaged-SQLite evidence failures: unreadable, invalid JSON, never settling, or wrong evidence", async (t) => {
  const cases: [(s: ReturnType<typeof base>) => void, string][] = [
    [(s) => { s.evidenceRows.splice(0, 2, "fail"); }, "Unable to read chat.db with packaged SQLite."],
    [(s) => { s.evidenceRows.splice(0, 2, "garbage"); }, "Packaged SQLite returned invalid evidence JSON."],
    [(s) => { s.evidenceRows.splice(0, 2, null); }, "The smoke run did not settle in chat.db."],
    [(s) => { s.evidenceRows.splice(0, 2, { run_id: "run-1", run_status: "queued", content: "", attempt_base_json: "[]", events_json: "[]" }); }, "The smoke run did not settle in chat.db."],
    [(s) => { s.evidenceRows.splice(1, 1, { run_id: "run-1", run_status: "succeeded", content: "NOPE", attempt_base_json: "[]", events_json: JSON.stringify([init, toolUse, toolResult]) }); }, "The packaged chat reply was not exactly DONE."],
  ];
  for (const [tweak, message] of cases) {
    const s = scenario(t, tweak);
    assert.equal(await smokePackagedChatCli(s.deps), 1);
    assert.deepEqual(s.err, [`smoke-packaged-chat: ${message}\n`]);
  }
});

test("a site that cannot be made writable is reported alongside nothing else", async (t) => {
  const s = scenario(t, (x) => { x.chmodStatus = 1; });
  assert.equal(await smokePackagedChatCli(s.deps), 1);
  assert.deepEqual(s.err, ["smoke-packaged-chat: Could not make the temporary site writable.\n"]);
});

test("every collected failure prints its own line; isolation errors print their own message", async (t) => {
  const s = scenario(t, (x) => { x.serverBootToken = null; x.chmodStatus = 1; });
  assert.equal(await smokePackagedChatCli(s.deps), 1);
  assert.deepEqual(s.err, ["smoke-packaged-chat: Packaged server emitted no boot token.\n", "smoke-packaged-chat: Could not make the temporary site writable.\n"]);

  const isolation = scenario(t);
  isolation.deps.withIsolatedSmokeTargets = async () => { throw new PackagedGateIsolationError("node_modules above the gate copy"); };
  assert.equal(await smokePackagedChatCli(isolation.deps), 1);
  assert.deepEqual(isolation.err, ["smoke-packaged-chat: node_modules above the gate copy\n"]);
});

test("a non-macOS isolated run skips the Keychain link", async (t) => {
  const s = scenario(t);
  // Targets are resolved on darwin; the scratch home is then prepared for a non-darwin host.
  const isolate = s.deps.withIsolatedSmokeTargets;
  s.deps.withIsolatedSmokeTargets = async (input) => { s.deps.platform = "linux"; return isolate(input); };
  assert.equal(await smokePackagedChatCli(s.deps), 0);
  assert.ok(!existsSync(path.join(s.isolated, "home", "Library")));
  assert.ok(existsSync(path.join(s.isolated, "home", "Documents")));
});

test("withInterruptSignal aborts on SIGINT/SIGTERM and always detaches its handlers", async () => {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const events = new EventEmitter();
    const seen = await withInterruptSignal({ events }, async (abort) => {
      assert.equal(abort.aborted, false);
      events.emit(signal);
      return abort.aborted;
    });
    assert.equal(seen, true);
    assert.equal(events.listenerCount("SIGINT") + events.listenerCount("SIGTERM"), 0);
  }
  const events = new EventEmitter();
  await assert.rejects(withInterruptSignal({ events }, async () => { throw new PackagedChatSmokeError("boom"); }), PackagedChatSmokeError);
  assert.equal(events.listenerCount("SIGINT") + events.listenerCount("SIGTERM"), 0);
});

test("scripts/smoke-packaged-chat.ts refuses to run without the owner's Mac and a --platform-dir", () => {
  const run = realSpawnSync(process.execPath, [path.join(DESKTOP_ROOT, "scripts/smoke-packaged-chat.ts")], {
    cwd: DESKTOP_ROOT, encoding: "utf8", timeout: 60_000,
  });
  assert.equal(run.status, 1, run.stderr);
  assert.equal(run.stdout, "");
  assert.equal(run.stderr, process.platform === "darwin"
    ? "smoke-packaged-chat: Usage: npm run smoke:packaged-chat -- --platform-dir release/mac-arm64\n"
    : "smoke-packaged-chat: Packaged chat smoke requires the owner's Mac and a logged-in Claude CLI.\n");
});
