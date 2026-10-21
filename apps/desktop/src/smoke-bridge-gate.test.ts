/**
 * @file `scripts/smoke-bridge.ts` — the release gate wrapper around `src/smoke-bridge.ts` — over
 * fake ports for the packaged app (existence, isolation copy, resolver spawn, per-bridge smoke). The
 * temp directory the gate writes its launcher into is real; nothing packaged is ever run.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { formatGateFailure, runSmokeBridgeGate } from "../scripts/smoke-bridge.ts";
import type { SmokeBridgeGatePorts } from "../scripts/smoke-bridge.ts";
import type { BridgeCommand } from "./smoke-bridge.ts";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "smoke-bridge.ts");
const APP = "/release/Tovu.app";
const SITE = { command: "/Tovu", args: ["/site/serve.js"], env: { ELECTRON_RUN_AS_NODE: "1", JINI_RUN_ID: "release-smoke" } };
const DESKTOP = { ...SITE, args: ["/app.asar/serve.js"] };

/** Ports that succeed unless a test overrides one; `smoked` and `printed` record what happened. */
function ports(overrides: Partial<SmokeBridgeGatePorts> = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-smoke-gate-"));
  const smoked: BridgeCommand[] = [];
  const printed: string[] = [];
  const resolverCalls: unknown[][] = [];
  const base: SmokeBridgeGatePorts = {
    exists: () => true,
    readDirectory: () => assert.fail("--app needs no directory listing"),
    isolate: async ({ targets, run }) => run(targets, directory),
    spawnResolver: ((command: string, args: string[], options: unknown) => {
      resolverCalls.push([command, args, options]);
      return { status: 0, signal: null, stdout: JSON.stringify([SITE, DESKTOP]), stderr: "", pid: 1, output: [] };
    }) as SmokeBridgeGatePorts["spawnResolver"],
    smoke: async ({ entry }) => { smoked.push(entry); },
    out: (text) => printed.push(text),
    env: { PATH: "/bin" },
    platform: "darwin",
  };
  return { ports: { ...base, ...overrides }, directory, smoked, printed, resolverCalls };
}

test("all three shipped bridges are smoked from the isolated copy, each reported, and the user-data dir is removed", async () => {
  const fixture = ports();
  await runSmokeBridgeGate({ argv: ["--app", APP] }, fixture.ports);

  assert.deepEqual(fixture.smoked.map((entry) => entry.label), ["site jini-mcp", "desktop jini-mcp", "tovu-desktop"]);
  assert.equal(fixture.smoked[2]!.command, "/bin/sh", "the sites bridge runs through the written POSIX launcher");
  assert.equal(fixture.printed.length, 3);
  assert.ok(fixture.printed.every((line) => /^smoke-bridge: OK — .+ initialize \+ tools\/list\n$/.test(line)));
  const [command, args, options] = fixture.resolverCalls[0] as [string, string[], { cwd: string; env: NodeJS.ProcessEnv; encoding: string }];
  assert.equal(command, path.join(APP, "Contents", "MacOS", "Tovu"));
  assert.equal(args[0], "-e");
  assert.equal(options.cwd, fixture.directory);
  assert.equal(options.env.ELECTRON_RUN_AS_NODE, "1");
  // The disposable user-data dir lived under the isolated directory and is gone afterwards; the
  // POSIX launcher the sites bridge execs was written there with it.
  assert.deepEqual(fs.readdirSync(fixture.directory).filter((name) => name.startsWith("tovu-release-smoke-")), []);
});

test("a Windows package needs no launcher script and still smokes every bridge", async () => {
  const fixture = ports({ platform: "win32" });
  await runSmokeBridgeGate({ argv: ["--app", APP] }, fixture.ports);
  assert.equal(fixture.smoked.length, 3);
  assert.deepEqual(fixture.smoked[2]!.env, { ELECTRON_RUN_AS_NODE: "1" });
});

test("a missing executable or node_modules is refused before anything is copied", async () => {
  for (const missing of ["MacOS", "node_modules"]) {
    const fixture = ports({ exists: (target) => !target.includes(missing), isolate: async () => assert.fail("must not isolate") });
    await assert.rejects(runSmokeBridgeGate({ argv: ["--app", APP] }, fixture.ports), { message: "smoke-bridge: packaged executable or node_modules is missing" });
  }
});

test("a failed resolver run fails the gate with its status or spawn error, signal and stderr", async () => {
  const failed = ports({ spawnResolver: (() => ({ status: 3, signal: null, stdout: "", stderr: "boom", pid: 1, output: [] })) as SmokeBridgeGatePorts["spawnResolver"] });
  await assert.rejects(runSmokeBridgeGate({ argv: ["--app", APP] }, failed.ports), { message: "smoke-bridge: packaged resolver failed: 3 (signal none)\nboom" });

  const spawnError = ports({ spawnResolver: (() => ({ status: null, signal: "SIGKILL", stdout: "", stderr: undefined, pid: 0, output: [], error: new Error("spawnSync ETIMEDOUT") })) as unknown as SmokeBridgeGatePorts["spawnResolver"] });
  await assert.rejects(runSmokeBridgeGate({ argv: ["--app", APP] }, spawnError.ports), { message: "smoke-bridge: packaged resolver failed: spawnSync ETIMEDOUT (signal SIGKILL)\n" });
  assert.deepEqual(spawnError.smoked, []);
});

test("one failing bridge stops the gate and still removes the user-data dir", async () => {
  const fixture = ports({ smoke: async ({ entry }) => { if (entry.label === "desktop jini-mcp") throw new Error("desktop jini-mcp: watchdog"); } });
  await assert.rejects(runSmokeBridgeGate({ argv: ["--app", APP] }, fixture.ports), { message: "desktop jini-mcp: watchdog" });
  assert.equal(fixture.printed.length, 1);
  assert.deepEqual(fs.readdirSync(fixture.directory).filter((name) => name.startsWith("tovu-release-smoke-")), []);
});

test("formatGateFailure prints an Error's message or a non-Error value, redacted and bounded", () => {
  assert.equal(formatGateFailure(new Error("smoke-bridge: nope")), "smoke-bridge: nope\n");
  assert.equal(formatGateFailure("bare failure"), "bare failure\n");
  const secret = ["ghp", "_", "y".repeat(36)].join("");
  const line = formatGateFailure(new Error(`leaked ${secret} ${"z".repeat(5000)}`));
  assert.ok(!line.includes(secret));
  assert.ok(line.length <= 2_001);
});

test("the real entry with no target prints the usage refusal and exits 1", () => {
  const child = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", timeout: 60_000 });
  assert.equal(child.status, 1);
  assert.equal(child.stderr, "smoke-bridge: --platform-dir <dir> or --app <Tovu.app> is required\n");
});
