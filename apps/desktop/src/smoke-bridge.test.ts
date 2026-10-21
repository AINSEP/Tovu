import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import {
  assertBridgeReplies, buildBridgeEnv, buildJiniEntryScript, buildSitesBridgeCommand,
  parseBridgeReply, parseJiniEntries, parseJiniEntryEnv, resolveBridgeSmokeTargets, smokeBridge,
} from "./smoke-bridge.ts";
import type { BridgeCommand } from "./smoke-bridge.ts";
import { buildSitesMcpLauncherScript, buildSitesMcpRegistration } from "./sites-mcp-registration.ts";

test("bridge CLI layout keeps app precedence and delegates platform layouts to the native resolver", () => {
  const reads: string[] = [];
  const input = { desktopRoot: path.resolve("/checkout/desktop"), readDirectory(directory: string) {
    reads.push(directory);
    return ["mac-arm64"];
  } };
  const app = path.resolve(input.desktopRoot, "mounted/Tovu.app");
  const platformDir = path.resolve(input.desktopRoot, "release");
  assert.deepEqual(resolveBridgeSmokeTargets({ ...input, argv: ["--platform-dir", "release", "--app", "mounted/Tovu.app"] }), {
    executablePath: path.join(app, "Contents", "MacOS", "Tovu"),
    nodeModulesDir: path.join(app, "Contents", "Resources", "tovu", "node_modules"),
  });
  assert.deepEqual(reads, [], "an explicit app must not read the platform directory");
  const targets = resolveBridgeSmokeTargets({ ...input, argv: ["--platform-dir", "release", "--app"] }, {});
  assert.deepEqual(reads, [platformDir]);
  assert.deepEqual(targets, {
    executablePath: path.join(platformDir, "mac-arm64", "Tovu.app", "Contents", "MacOS", "Tovu"),
    nodeModulesDir: path.join(platformDir, "mac-arm64", "Tovu.app", "Contents", "Resources", "tovu", "node_modules"),
  });
  assert.deepEqual(resolveBridgeSmokeTargets({ ...input, argv: ["--platform-dir", "/win"], readDirectory: () => ["win-unpacked"] }), {
    executablePath: path.resolve("/win/win-unpacked/Tovu.exe"), nodeModulesDir: path.resolve("/win/win-unpacked/resources/tovu/node_modules"),
  });
});

test("bridge CLI layout preserves usage, directory-read and native-layout failures", () => {
  const input = { desktopRoot: "/desktop", readDirectory: () => [] };
  for (const argv of [[], ["--app"], ["--platform-dir"], ["--app", ""], ["--platform-dir", ""]]) {
    assert.throws(() => resolveBridgeSmokeTargets({ ...input, argv }), {
      message: "smoke-bridge: --platform-dir <dir> or --app <Tovu.app> is required",
    });
  }
  assert.throws(() => resolveBridgeSmokeTargets({ ...input, argv: ["--platform-dir", "release"] }), /no mac-prefixed/);
  const failure = new Error("directory unavailable");
  assert.throws(() => resolveBridgeSmokeTargets({ ...input, argv: ["--platform-dir", "release"],
    readDirectory() { throw failure; } }), error => error === failure);
});

test("packaged Jini environment requires string values and the fixed release identity without copying", () => {
  const env = { ELECTRON_RUN_AS_NODE: "1", JINI_RUN_ID: "release-smoke", EXTRA: "retained" };
  assert.equal(parseJiniEntryEnv({ env }), env);
  for (const invalid of [null, undefined, [], "env", {}, { ...env, EXTRA: 42 },
    { ...env, JINI_RUN_ID: "other" }, { ...env, ELECTRON_RUN_AS_NODE: "0" }]) {
    assert.throws(() => parseJiniEntryEnv({ env: invalid }), { message: "malformed packaged Jini entry" });
  }
});

test("bridge env keeps only the CLI baseline and entry environment", () => {
  assert.deepEqual(buildBridgeEnv({ hostEnv: {
    PATH: "/bin", HOME: "/home", TMPDIR: "/tmp", SHELL: "/bin/sh", LANG: "en", USER: "smoke",
    NODE_PATH: "/dev/modules", NODE_OPTIONS: "--inspect", ELECTRON_RUN_AS_NODE: "wrong",
    JINI_RUN_ID: "host-run", UNRELATED_SETTING: "excluded",
  }, entryEnv: { ELECTRON_RUN_AS_NODE: "1", JINI_RUN_ID: "release-smoke" } }), {
    PATH: "/bin", HOME: "/home", TMPDIR: "/tmp", SHELL: "/bin/sh", LANG: "en", USER: "smoke",
    ELECTRON_RUN_AS_NODE: "1", JINI_RUN_ID: "release-smoke",
  });
  assert.deepEqual(buildBridgeEnv({ hostEnv: {} }), {});
});

test("packaged resolver script calls the real resolver and entry builder with isolated runtime facts", () => {
  const resourcesDir = String.raw`/bundle/quote"; globalThis.injected = true; //`;
  const executablePath = String.raw`C:\Program Files\Tovu\Tovu.exe`;
  const script = buildJiniEntryScript({ resourcesDir, executablePath });
  assert.doesNotThrow(() => new Function(script));
  assert.ok(script.includes(JSON.stringify(resourcesDir)));
  assert.ok(script.includes(JSON.stringify(executablePath)));
  assert.ok(script.includes('"dist/src/assistant/mcp-injection.js"'));
  assert.ok(script.includes('resolveMcpJsonInjection("http://127.0.0.1:9", () => "smoke"'));
  assert.ok(script.includes('electronVersion: "smoke", env: {}'));
  assert.ok(script.includes('createRequire(join(asar, "package.json")).resolve("@jini-ai/mcp")'));
  assert.ok(script.includes('buildMcpJsonServerEntry({ runId: "release-smoke", options }, { credential: "smoke" })'));
});

test("resolver output requires both bridge entries, preserving their command/argv/env", () => {
  const site = { command: "/Tovu", args: ["/site/serve.js"], env: { ELECTRON_RUN_AS_NODE: "1", JINI_RUN_ID: "release-smoke" } };
  const desktop = { ...site, args: ["/app.asar/serve.js"] };
  const parsed = parseJiniEntries({ stdout: JSON.stringify([site, desktop]) });
  assert.deepEqual(parsed.map(({ command, args, env }) => ({ command, args, env })), [site, desktop]);
  assert.deepEqual(parsed.map(entry => entry.label), ["site jini-mcp", "desktop jini-mcp"]);
  assert.ok(parsed.every(entry => entry.serverName === "jini-mcp" && entry.toolName === "execute_delegated_tool"));
  for (const entries of [null, [], [site], [site, { ...desktop, env: {} }], [site, { ...desktop, args: [42] }]]) {
    assert.throws(() => parseJiniEntries({ stdout: JSON.stringify(entries) }));
  }
  assert.throws(() => parseJiniEntries({ stdout: "not json" }));
});

test("POSIX bridge command executes the production launcher with a disposable user-data path", () => {
  const input = { executablePath: "/bundle with spaces/Tovu", resourcesDir: "/bundle/Resources", userDataDir: "/scratch/user data", platform: "darwin" as const };
  const result = buildSitesBridgeCommand(input);
  assert.equal(result.entry.command, "/bin/sh");
  assert.deepEqual(result.entry.args, [result.launcherPath]);
  assert.deepEqual(result.entry.env, {}, "Node mode must be set by the launcher itself");
  assert.equal(result.launcherScript, buildSitesMcpLauncherScript({
    electronPath: input.executablePath, bridgePath: path.join(input.resourcesDir, "app.asar", "bin", "mcp-bridge.ts"), userDataDir: input.userDataDir,
  }));
});

test("Windows bridge command uses registration argv and explicitly enables Electron Node mode", () => {
  const input = { executablePath: String.raw`C:\Program Files\Tovu\Tovu.exe`, resourcesDir: String.raw`C:\Program Files\Tovu\resources`, userDataDir: String.raw`C:\Temp\user data`, platform: "win32" as const };
  const result = buildSitesBridgeCommand(input);
  const bridgePath = path.join(input.resourcesDir, "app.asar", "bin", "mcp-bridge.ts");
  const registration = buildSitesMcpRegistration({ launcherPath: input.executablePath, platform: input.platform, bridgePath, userDataDir: input.userDataDir });
  assert.equal(result.entry.command, registration.command);
  assert.deepEqual(result.entry.args, [bridgePath, "--user-data-dir", input.userDataDir]);
  assert.deepEqual(result.entry.env, { ELECTRON_RUN_AS_NODE: "1" });
  assert.equal(result.launcherScript, undefined);
});

test("reply parser correlates ids and rejects malformed/error replies", () => {
  const result = { serverInfo: { name: "jini-mcp" } };
  assert.deepEqual(parseBridgeReply({ line: JSON.stringify({ jsonrpc: "2.0", id: 1, result }), id: 1 }), result);
  for (const message of [{ jsonrpc: "2.0", method: "notifications/message" }, { jsonrpc: "2.0", id: 99, result }]) {
    assert.equal(parseBridgeReply({ line: JSON.stringify(message), id: 1 }), undefined);
  }
  for (const line of ["", "noise", "null", "[]", '{"id":1,"result":{}}', '{"jsonrpc":"2.0","id":1,"result":null}', '{"jsonrpc":"2.0","id":1,"error":{"code":-1}}']) {
    assert.throws(() => parseBridgeReply({ line, id: 1 }));
  }
});

test("identity and required tool assertions cannot pass on an empty or wrong roster", () => {
  const valid = { initialize: { serverInfo: { name: "jini-mcp" } }, tools: { tools: [{ name: "execute_delegated_tool" }] }, serverName: "jini-mcp", toolName: "execute_delegated_tool" };
  assert.doesNotThrow(() => assertBridgeReplies(valid));
  assert.throws(() => assertBridgeReplies({ ...valid, initialize: { serverInfo: { name: "other" } } }), /initialize did not identify jini-mcp/);
  for (const tools of [{}, { tools: [] }, { tools: [null, { name: "other" }] }]) {
    assert.throws(() => assertBridgeReplies({ ...valid, tools }), /tools\/list did not include execute_delegated_tool/);
  }
});

const entry: BridgeCommand = {
  label: "fixture", command: "/shipped/Tovu", args: ["bridge.js"], env: { ELECTRON_RUN_AS_NODE: "1" },
  serverName: "jini-mcp", toolName: "execute_delegated_tool",
};

/** In-memory child-process port: no module mocks, real processes, network, or packaged app. */
function fakeBridge(mode: "ok" | "bad-tool" | "silent" | "close" | "error" | "malformed" | "notify-first" | "flood" | "error-string") {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
  const sent: Record<string, unknown>[] = [];
  const signals: (NodeJS.Signals | number | undefined)[] = [];
  const kill = (signal?: NodeJS.Signals | number) => {
    signals.push(signal);
    queueMicrotask(() => child.emit("close", null, "SIGKILL"));
    return true;
  };
  child.stdin.on("data", (bytes: Buffer) => {
    const message = JSON.parse(bytes.toString()) as Record<string, unknown>;
    sent.push(message);
    queueMicrotask(() => {
      if (mode === "silent") return;
      if (mode === "close") { child.stderr.write("fixture loader failure"); child.emit("close", 1); return; }
      if (mode === "error") { child.emit("error", new Error("fixture spawn error")); return; }
      if (mode === "malformed") { child.stdout.write("not-json\n"); return; }
      if (mode === "error-string") { child.emit("error", "fixture bare-string failure"); return; }
      if (mode === "flood") {
        child.stderr.write("e".repeat(70_000));
        child.stderr.write("late stderr detail");
        child.stdout.write("x".repeat(1_000_001));
        return;
      }
      if (mode === "notify-first" && message.method === "initialize") {
        child.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info" } })}\n`);
      }
      if (message.method === "initialize") {
        const reply = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "jini-mcp" } } });
        child.stdout.write(reply.slice(0, 10));
        child.stdout.write(`${reply.slice(10)}\n`);
      } else if (message.method === "tools/list") {
        child.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: mode === "bad-tool" ? [] : [{ name: "execute_delegated_tool" }] } })}\n`);
      }
    });
  });
  let spawnOptions: unknown;
  const spawnBridge = ((command: string, args: string[], options: unknown) => {
    assert.equal(command, entry.command);
    assert.deepEqual(args, entry.args);
    spawnOptions = options;
    return Object.assign(child, { kill });
  }) as unknown as typeof spawn;
  return { spawnBridge, sent, signals, options: () => spawnOptions };
}

test("handshake sends initialize, initialized, tools/list in order and kills the child on success", async () => {
  const fake = fakeBridge("ok");
  await smokeBridge({ entry, hostEnv: { PATH: "/bin", NODE_PATH: "/dev" } }, { spawnBridge: fake.spawnBridge, cwd: "/isolated/gate" });
  assert.deepEqual(fake.sent.map(message => message.method), ["initialize", "notifications/initialized", "tools/list"]);
  assert.deepEqual(fake.signals, ["SIGKILL"]);
  assert.deepEqual(fake.options(), { env: { PATH: "/bin", ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["pipe", "pipe", "pipe"], cwd: "/isolated/gate" });
});

test("failed roster, close, spawn, framing and watchdog all fail and kill the child", async () => {
  for (const [mode, expected] of [
    ["bad-tool", /tools\/list did not include execute_delegated_tool/],
    ["close", /fixture loader failure/], ["error", /fixture spawn error/],
    ["malformed", /fixture:/], ["silent", /MCP watchdog exceeded 10 ms/],
  ] as const) {
    const fake = fakeBridge(mode);
    await assert.rejects(smokeBridge({ entry, hostEnv: {} }, { spawnBridge: fake.spawnBridge, watchdogMs: 10 }), expected);
    assert.deepEqual(fake.signals, ["SIGKILL"], mode);
  }
});


test("a server notification arriving before the initialize reply is skipped, not mistaken for the reply", async () => {
  const fake = fakeBridge("notify-first");
  await smokeBridge({ entry, hostEnv: {} }, { spawnBridge: fake.spawnBridge });
  assert.deepEqual(fake.sent.map(message => message.method), ["initialize", "notifications/initialized", "tools/list"]);
  assert.deepEqual(fake.signals, ["SIGKILL"]);
});

test("runaway stdout fails at the buffer limit and oversized stderr is replaced, never echoed", async () => {
  const fake = fakeBridge("flood");
  await assert.rejects(smokeBridge({ entry, hostEnv: {} }, { spawnBridge: fake.spawnBridge }), (error: Error) => {
    assert.match(error.message, /^fixture: MCP stdout exceeded smoke buffer limit\n\[oversized stderr omitted\]$/);
    assert.ok(!error.message.includes("late stderr detail"));
    return true;
  });
  assert.deepEqual(fake.signals, ["SIGKILL"]);
});

test("a spawn error raised as a bare string still names the entry and the cause", async () => {
  const fake = fakeBridge("error-string");
  await assert.rejects(smokeBridge({ entry, hostEnv: {} }, { spawnBridge: fake.spawnBridge }), {
    message: "fixture: fixture bare-string failure",
  });
  assert.deepEqual(fake.signals, ["SIGKILL"]);
});

test("bridge failures redact split native stderr and retain exit code and signal", async () => {
  const secret = ["ghp", "_", "x".repeat(36)].join("");
  const homePath = path.join(os.homedir(), "private/addon.node");
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
  let killed = false;
  const spawnBridge = (() => {
    queueMicrotask(() => {
      child.stderr.write(`FATAL ERROR: native load ${secret.slice(0, 5)}`);
      child.stderr.write(`${secret.slice(5)} ${homePath}\n` + "safe detail ".repeat(1000));
      child.emit("close", 9, "SIGABRT");
    });
    return Object.assign(child, { kill: () => { killed = true; return true; } });
  }) as unknown as typeof spawn;
  await assert.rejects(smokeBridge({ entry, hostEnv: {} }, { spawnBridge }), (error: Error) => {
    assert.match(error.message, /code 9, signal SIGABRT.*FATAL ERROR/s);
    assert.ok(!error.message.includes(secret));
    assert.ok(!error.message.includes(homePath));
    assert.ok(error.message.length <= 2_000);
    return true;
  });
  assert.equal(killed, true);
  assert.throws(() => parseJiniEntries({ stdout: `invalid ${secret} ${homePath}` }), (error: Error) => {
    assert.ok(!error.message.includes(secret));
    assert.ok(!error.message.includes(homePath));
    return true;
  });
});
