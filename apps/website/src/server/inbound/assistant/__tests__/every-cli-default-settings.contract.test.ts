/**
 * @file Contract: every CLI Jini registers, launched with Tovu's real default chat settings, either
 * starts or is refused with a message that names the CLI and each OFF switch.
 * Owner 2026-10-27: since 10-23 "Your MCP servers" defaults OFF, and Jini's launch guard refused
 * every CLI except Claude and Codex with "This CLI has no native-tool policy and audit adapter".
 * Nobody noticed for days. This covers the whole class, not one CLI:
 * - CLIs come from Jini's real `AGENT_DEFS`, so a new CLI is covered without editing this file.
 * - The launch input comes from the daemon's real `onStarted`/`launchAgentRun` source (see
 *   `helpers/daemon-source.ts`) with the real settings reader over an empty settings ledger, i.e.
 *   a fresh local install: owner, not hosted, nothing saved.
 * - Jini's real executor runs it, with only OS effects replaced (launch path = node's own binary,
 *   `--help` probe, Claude version probe, bridge staging files, spawn). No CLI process starts.
 * Tovu resolves `@jini-ai/daemon` to its dist, so a Jini launch fix shows here only after the
 * daemon package is rebuilt.
 */
import assert from "node:assert/strict";
import type { ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { AGENT_DEFS, createAgentRuntimeState, type RuntimeAgentDef } from "@jini-ai/agent-runtime";
import { createAgentExecutor, createInMemoryEventLog, createRunLifecycle, type AgentExecutorRunInput, type McpJsonInjectionOptions } from "@jini-ai/daemon";
import { readAssistantCliPermissions } from "#src/assistant/subagent-settings";
import { ASSISTANT_CLI_CAPABILITIES } from "#src/contracts/headless/index";
import { resolveAgentPermissionMode } from "#src/contracts/core/agent-permission-mode";
import { resolveBundledHostSignals } from "#src/features/agent-plugins/host-signals";
import { captureDaemonRun, daemonFunction, evaluateDaemonStatements } from "./helpers/daemon-source.js";

/** The refusal that told a Gemini user nothing; no CLI may ever be refused with it again. */
const OLD_GENERIC_REFUSAL = "no native-tool policy and audit adapter";
const REFUSAL_CODE = "NATIVE_TOOL_POLICY_UNSUPPORTED";

type Outcome = { kind: "started" } | { kind: "refused"; code: unknown; message: string };
interface Row { id: string; name: string; offSwitches: readonly string[]; outcome: Outcome; problem: string | null }

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill() { return true; }
}

/** Tovu's launch input for `agentId` on a fresh local install. The permission mode is the daemon's
 * own `resolvePermissionMode` source over an empty env, not the helper's fixed "bypass". */
async function captureDefaultLaunch({ agentId, siteDir }: { agentId: string; siteDir: string }, _optional = {}): Promise<AgentExecutorRunInput> {
  const resolvePermissionMode = await evaluateDaemonStatements<() => "bypass" | "restricted">([daemonFunction("resolvePermissionMode")],
    { resolveAgentPermissionMode, resolveBundledHostSignals, process: { env: {} } }, "resolvePermissionMode");
  return captureDaemonRun({ prompt: "hello" }, { request: { agentId }, bindings: {
    routeDeps: {
      ownerPrincipalId: Promise.resolve("daemon-test-principal"), workspaceId: "ws-every-cli", siteBinding: { dir: siteDir },
      toolAttemptAuditSink: { append: async () => {} }, settingsRepo: {},
      settingsUiTabsReady: Promise.resolve(), siteTitleReady: Promise.resolve(),
      // An empty ledger: no saved Full CLI access, per-switch choices or runtime preferences.
      getEffective: async () => null,
    },
    readAssistantCliPermissions, resolvePermissionMode,
  }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: "ok", unsubscribe() {} }) } });
}

/** Tovu's bridge staging (`agent-daemon-server` always passes `mcpJsonInjection`) with every file
 * effect faked. Codex can only turn personal MCP off inside a run-scoped CODEX_HOME it stages. */
const fakeBridgeStaging: McpJsonInjectionOptions = {
  command: "host-bridge", daemonUrl: "http://site", linkSessionStore: async () => {}, removeDir: async () => {},
  mkdtemp: async ({ prefix }) => `/fake-tmp/${prefix}x`, writeFile: async () => {},
  readFile: async ({ path: file }) => { throw Object.assign(new Error(`ENOENT ${file}`), { code: "ENOENT" }); },
};

/** Runs Tovu's captured input through Jini's real executor until it reaches spawn or is refused. */
async function launchWithFakeProcess({ def, launch }: { def: RuntimeAgentDef; launch: AgentExecutorRunInput }, _optional = {}): Promise<Outcome> {
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const child = new FakeChild();
  let markSpawned!: () => void;
  const reachedSpawn = new Promise<Outcome>(resolve => { markSpawned = () => resolve({ kind: "started" }); });
  const executor = createAgentExecutor({ lifecycle }, {
    hostEnv: {}, runtimeState: createAgentRuntimeState({}), mcpJsonInjection: fakeBridgeStaging,
    getAgentDef: ({ id }) => (id === def.id ? def : null),
    // A real file: Claude and Codex canonicalize the launch path for their folder-limited read
    // exceptions, and a missing path refuses the launch (FILESYSTEM_POLICY_UNSUPPORTED) before spawn.
    resolveAgentLaunch: () => ({ selectedPath: process.execPath, pathResolvedPath: process.execPath, configuredOverridePath: null,
      launchPath: process.execPath, launchKind: "selected", childPathPrepend: [], diagnostic: null }),
    applyAgentLaunchEnv: ({ env }) => env, ensureAgentCapabilities: async () => {},
    assertClaudeFilesystemSupport: async () => true,
    spawn: (() => {
      queueMicrotask(() => child.emit("spawn"));
      markSpawned();
      return child as unknown as ChildProcess;
    }) as unknown as typeof nodeSpawn,
  });
  const { run } = await lifecycle.start({ contextRef: "every-cli-defaults" });
  const { runId: _capturedRunId, agentId, prompt, cwd, ...optional } = launch;
  const running = executor.run({ runId: run.id, agentId, prompt, cwd }, optional);
  // A post-spawn protocol handshake (ACP, pi RPC) never completes against a fake child, so the
  // outcome is whichever comes first: spawn, or a pre-spawn rejection.
  const refused = running.then<Outcome, Outcome>(
    () => ({ kind: "refused", code: undefined, message: "run resolved without reaching spawn" }),
    (error: { code?: unknown; message?: unknown }) => ({ kind: "refused", code: error.code, message: String(error.message) }));
  try {
    return await Promise.race([reachedSpawn, refused]);
  } finally {
    child.emit("close", 0, null);
  }
}

/** Why a row breaks the contract, or null. Pure, O(s) for s OFF switches. */
function contractProblem({ def, offSwitches, outcome }: { def: RuntimeAgentDef; offSwitches: readonly string[]; outcome: Outcome }, _optional = {}): string | null {
  if (outcome.kind === "started") return null;
  if (outcome.message.includes(OLD_GENERIC_REFUSAL)) return `refused with the old generic message: "${outcome.message}"`;
  if (outcome.code !== REFUSAL_CODE) return `failed with ${String(outcome.code)}: "${outcome.message}"`;
  const missing = [def.name, ...offSwitches].filter(word => !outcome.message.includes(word));
  return missing.length > 0 ? `refusal does not name ${missing.map(word => `'${word}'`).join(", ")}: "${outcome.message}"` : null;
}

/** One line per CLI, so a failure shows which CLI broke and how. */
function formatTable(rows: readonly Row[], _optional = {}): string {
  const lines = rows.map(({ id, name, offSwitches, outcome, problem }) => [
    id.padEnd(12), name.padEnd(20), (outcome.kind === "started" ? "started" : `refused ${String(outcome.code)}`).padEnd(40),
    `OFF: ${offSwitches.join(", ") || "none"}`, problem ? `BROKEN: ${problem}` : "ok",
  ].join(" | "));
  return ["Every registered CLI under Tovu's default chat settings:", ...lines].join("\n");
}

test("every registered CLI starts, or is refused naming the CLI and each OFF switch, under Tovu's default chat settings", async t => {
  const siteDir = realpathSync(mkdtempSync(path.join(tmpdir(), "tovu-every-cli-")));
  t.after(() => rmSync(siteDir, { recursive: true, force: true }));
  const rows: Row[] = [];
  for (const def of AGENT_DEFS) {
    const launch = await captureDefaultLaunch({ agentId: def.id, siteDir }, {});
    assert.equal(launch.agentId, def.id);
    const offSwitches = ASSISTANT_CLI_CAPABILITIES.filter(({ key }) => launch.nativeCapabilities?.[key] === false).map(({ label }) => label);
    const outcome = await launchWithFakeProcess({ def, launch }, {});
    rows.push({ id: def.id, name: def.name, offSwitches, outcome, problem: contractProblem({ def, offSwitches, outcome }, {}) });
  }
  const table = formatTable(rows, {});
  t.diagnostic(table);
  assert.deepEqual(rows.filter(row => row.problem !== null).map(row => `${row.id}: ${row.problem}`), [], table);
  for (const id of ["claude", "codex"]) {
    assert.equal(rows.find(row => row.id === id)?.outcome.kind, "started", `${id} must start under the defaults\n${table}`);
  }
});
