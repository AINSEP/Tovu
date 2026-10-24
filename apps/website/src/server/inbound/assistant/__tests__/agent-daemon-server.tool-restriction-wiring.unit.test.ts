import { buildAssistantFilesystemNotices } from "../assistant-filesystem-notices.js";
import { assistantCliPermissions } from "#src/contracts/headless/assistant-subagents-policy";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";
import { getAgentDef } from "@jini-ai/agent-runtime";
import { ASSISTANT_DISALLOWED_TOOLS, ASSISTANT_SETTING_SOURCES, resolveAssistantDisallowedTools, buildAssistantSubagentsOverlay, buildBaseSystemOverlay } from "../assistant-system-overlay.js";
import { captureDaemonRun, daemonSource, evaluateDaemonStatements, daemonInitializer, evaluateDaemonExpression } from "./helpers/daemon-source.js";
import { AsyncResource, AsyncLocalStorage } from "node:async_hooks";
import ts from "typescript";
import { createChatDeleteScope } from "../../../../assistant/permanent-delete-tool-gate.js";
import { InMemorySettingsRepo, ensureSettingDefinitions, getEffective, set } from "@jini-ai/core/settings";
import { readAssistantCliPermissions } from "../../../../assistant/subagent-settings.js";
import { buildAssistantRuntimeGuidance } from "../assistant-runtime-guidance.js";

/**
 * @file Wiring proof for Finding 2 of SEC-assistant-env-isolation-2026-09-07: reads the SOURCE of
 * `agent-daemon-server.ts` rather than importing it, same reason and same style as
 * `agent-daemon-server.session-resume-wiring.unit.test.ts` next to this file (that file opens a
 * real SQLite connection and binds a real port as an import-time side effect).
 *
 * A restricted-tool constant that exists but is never passed into `agentExecutor.run()` would leave
 * the assistant exactly as unrestricted as before the fix, even though `ASSISTANT_DISALLOWED_TOOLS`
 * itself (asserted directly in `assistant-system-overlay.unit.test.ts`) is correct in isolation —
 * this file is the one that would fail if that wiring were ever removed or the field were renamed
 * without updating the runtime plumbing (`AgentExecutorRunInput.disallowedTools`).
 */

const DAEMON_ENTRY_SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

describe("Finding 2 wiring — the spawned assistant's tool grant is actually restricted, not just prompted", () => {
  test("imports the shared tool policy resolver from assistant-system-overlay.ts", () => {
    assert.match(
      DAEMON_ENTRY_SOURCE,
      /import\s*\{[^}]*resolveAssistantDisallowedTools[^}]*\}\s*from\s*["'][^"']*assistant-system-overlay(\.js)?["']/,
      "agent-daemon-server.ts must import the shared resolver, not hardcode a second copy of the list",
    );
  });


  test("agentExecutor.run() receives hook settings when the guard exists", async () => {
    const input = await captureDaemonRun({ prompt: "Search safely" }, { hookPresent: true });
    assert.deepEqual(JSON.parse(input.settings!), {
      autoMemoryEnabled: false,
      hooks: { PreToolUse: [{ matcher: "Bash|Glob|Grep", hooks: [
        { type: "command", command: "/home/daemon-test/.claude/hooks/no-system-search", timeout: 5 },
      ] }] },
    });
  });

  test("agentExecutor.run() receives only the assistant setting sources", async () => {
    const input = await captureDaemonRun({ prompt: "Review settings" });
    assert.deepEqual(input.settingSources, ASSISTANT_SETTING_SOURCES);
  });
});

test("onStarted hands the executor the enforced tool restrictions", async () => {
  const input = await captureDaemonRun({ prompt: "Review this page" });
  assert.equal(input.filesystemRoot, input.cwd, 'the host supplies the site folder as a mandatory runtime boundary');
  assert.deepEqual(input.disallowedTools, ASSISTANT_DISALLOWED_TOOLS);
  assert.deepEqual(input.settingSources, ASSISTANT_SETTING_SOURCES);
});

test('native Windows shell launches emit the required value-free limitation notice', async () => {
  const warnings: unknown[][] = [];
  // Owner launches subscribe to tool-gap events before dispatch, including on Windows.
  await captureDaemonRun({ prompt: 'Review this page' }, { bindings: {
    process: { platform: 'win32', env: {} },
    routeDeps: { ownerPrincipalId: Promise.resolve('daemon-test-principal'), toolAttemptAuditSink: { append: async () => {} } },
    console: { warn: (...args: unknown[]) => warnings.push(args), error() {}, log() {} },
  }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: 'ok' }) } });
  assert.deepEqual(warnings, [['[agent-daemon] shell is not folder-limited on this platform']]);
});

test("onStarted forwards the exact search hook settings through to Claude launch arguments", async () => {
  const input = await captureDaemonRun({ prompt: "Find a page" }, { hookPresent: true });
  assert.ok(input.settings);
  assert.deepEqual(JSON.parse(input.settings), {
    autoMemoryEnabled: false,
    hooks: { PreToolUse: [{ matcher: "Bash|Glob|Grep", hooks: [
      { type: "command", command: "/home/daemon-test/.claude/hooks/no-system-search", timeout: 5 },
    ] }] },
  });
  const def = getAgentDef({ id: "claude" });
  assert.ok(def);
  const args = def.buildArgs({ prompt: input.prompt, imagePaths: [] }, { extraAllowedDirs: [], options: input });
  const settingsIndex = args.indexOf("--settings");
  assert.ok(settingsIndex >= 0);
  const emitted = JSON.parse(args[settingsIndex + 1]!);
  assert.equal(emitted.autoMemoryEnabled, false);
  assert.equal(emitted.permissions.blockReadsOutsideWorkingDirectories, true);
  assert.deepEqual(emitted.hooks, JSON.parse(input.settings!).hooks);
});

test("onStarted disables auto-memory through Claude launch settings even when the hook file is absent", async () => {
  const input = await captureDaemonRun({ prompt: "Find a page" });
  assert.equal(input.settings, '{"autoMemoryEnabled":false}');
  const def = getAgentDef({ id: "claude" });
  assert.ok(def);
  const args = def.buildArgs({ prompt: input.prompt, imagePaths: [] }, { extraAllowedDirs: [], options: input });
  const settingsIndex = args.indexOf("--settings");
  assert.ok(settingsIndex >= 0);
  const emitted = JSON.parse(args[settingsIndex + 1]!);
  assert.equal(emitted.autoMemoryEnabled, false);
  assert.equal(emitted.permissions.blockReadsOutsideWorkingDirectories, true);
  assert.deepEqual(emitted.hooks, JSON.parse(input.settings!).hooks);
});

test("a non-owner cannot use a true owner setting to change any provider's grant", async () => {
  for (const agentId of ["claude", "codex"]) {
    const input = await captureDaemonRun({ prompt: "Delegate this" }, { request: { agentId },
      bindings: { readAssistantCliPermissions: async () => { throw new Error("must not read"); } } });
    assert.deepEqual(input.disallowedTools, ASSISTANT_DISALLOWED_TOOLS);
    assert.equal(input.cliParity, false);
    assert.deepEqual(input.settingSources, ASSISTANT_SETTING_SOURCES);
  }
});

test("real per-launch reads apply enable AND revoke without restarting the daemon", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  let id = 0;
  const clock = { nowMs: () => 0 };
  const ids = { newId: () => `subag-launch-${++id}` };
  const principals = { findActiveById: async () => null };
  await ensureSettingDefinitions({ settingsRepo, clock, ids, principals }, {
    namespace: "core.assistant-full-cli", definitions: [{ key: "enabled", schema: { type: "boolean" }, defaultValue: true }], systemPrincipalId: "boot",
  });
  const routeDeps = { settingsRepo, getEffective, settingsUiTabsReady: Promise.resolve(), workspaceId: "ws-daemon-test", ownerPrincipalId: Promise.resolve("daemon-test-principal"), siteBinding: { dir: "/site" }, toolAttemptAuditSink: { append: async () => {} } };
  const launch = () => captureDaemonRun({ prompt: "Delegate this" }, { bindings: { routeDeps, readAssistantCliPermissions }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: "ok" }) } });
  for (const tool of ["Agent", "Task"]) assert.equal((await launch()).disallowedTools?.includes(tool), false);
  for (const value of [true, false]) {
    await set({ deps: { repo: settingsRepo, clock, ids, principals, authorize: async () => ({ allowed: true, reason: "owner" }) },
      input: { namespace: "core.assistant-full-cli", key: "enabled", scope: "workspace", workspaceId: routeDeps.workspaceId,
        authWorkspaceId: routeDeps.workspaceId, callerPrincipalId: "owner", value } });
    for (const tool of ["Agent", "Task"]) assert.equal((await launch()).disallowedTools?.includes(tool), !value);
  }
});


test("a failed fresh subagent read still launches Claude with every default tool restriction", async () => {
  const warnings: string[] = [];
  const routeDeps = { workspaceId: "ws-daemon-test", ownerPrincipalId: Promise.resolve("daemon-test-principal"), siteBinding: { dir: "/site" }, toolAttemptAuditSink: { append: async () => {} }, settingsRepo: new InMemorySettingsRepo(),
    settingsUiTabsReady: Promise.resolve(), getEffective: async () => { throw new Error("settings unavailable"); } };
  const input = await captureDaemonRun({ prompt: "Delegate this" }, { bindings: {
    routeDeps,
    readAssistantCliPermissions: (required: Parameters<typeof readAssistantCliPermissions>[0]) =>
      readAssistantCliPermissions(required, { warn: message => warnings.push(message) }),
  }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: "ok" }) } });
  assert.deepEqual(input.disallowedTools, ASSISTANT_DISALLOWED_TOOLS);
  assert.equal(input.permissionMode, "bypass");
  assert.deepEqual(input.settingSources, ASSISTANT_SETTING_SOURCES);
  assert.deepEqual(warnings, ["[agent-daemon] Full CLI access settings unavailable; access remains OFF."]);
});

test("catalog grants survive a parser continuation using the pre-existing request resource", async () => {
  // Current raw-body binds its callback to preserve context. Keep the grant independent of
  // parser implementations that resume on the stream's pre-existing resource; no server starts.
  const stream = new AsyncResource("request-stream-fixture");
  const policy = { enabled: true, allowedToolIds: ["trash_empty"] };
  const deleteScope = createChatDeleteScope({ readPolicy: async ({ principalId }) => { assert.equal(principalId, "owner"); return policy; } });
  type Middleware = (req: { parsed?: boolean; get(name: string): string | undefined }, res: object, next: (error?: unknown) => void) => void;
  const stack: Middleware[] = [];
  const statements = daemonSource.statements.filter(statement => ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) && statement.expression.expression.getText(daemonSource) === "app.use" &&
    (statement.getText(daemonSource).includes("express.json(") || statement.getText(daemonSource).includes("deleteScope.fresh(")));
  assert.equal(statements.length, 2, "capture the real JSON parser and grant middleware registrations");
  try {
    await evaluateDaemonStatements(statements, {
      app: { use: (...args: unknown[]) => { stack.push(args.at(-1) as Middleware); } },
      express: { json: () => ((req, _res, next) => {
        queueMicrotask(() => stream.runInAsyncScope(() => { req.parsed = true; next(); }));
      }) as Middleware },
      DELEGATED_TOOL_CALLS_PATH: "/api/delegated-tools/call", RUN_PRINCIPAL_HEADER: "x-tovu-principal-id", deleteScope,
    });
    await new Promise<void>((resolve, reject) => {
      const req: { parsed?: boolean; get(name: string): string | undefined } = {
        get: name => name === "x-tovu-principal-id" ? "owner" : undefined,
      };
      let index = 0;
      const next = (error?: unknown) => {
        if (error) { reject(error); return; }
        const middleware = stack[index++];
        if (middleware) { middleware(req, {}, next); return; }
        try { assert.equal(req.parsed, true); assert.deepEqual(deleteScope.policy(), policy); resolve(); }
        catch (failure) { reject(failure); }
      };
      next();
    });
  } finally { stream.emitDestroy(); }
});


test("the real prompt augmenter receives the same fresh grant as each concurrent launch", async () => {
  const assistantCliCapabilitiesContext = new AsyncLocalStorage<ReturnType<typeof assistantCliPermissions>["capabilities"]>();
  const augmenter = evaluateDaemonExpression<{ systemOverlay(input: { agentId: string; turnIndex: number }): string }>(
    daemonInitializer("assistantPromptAugmenter"), {
      getAgentDef, buildAssistantFilesystemNotices, buildBaseSystemOverlay, buildAssistantSubagentsOverlay, assistantCliPermissions, assistantCliCapabilitiesContext,
      assistantNativeToolsContext: new AsyncLocalStorage<boolean>(),
      bashProhibitionEnabled: false, customInstructionsCache: { readOverlay: () => "Owner custom guidance" },
      buildAssistantRuntimeGuidance, assistantRuntimeGuidanceContext: new AsyncLocalStorage(),
    });
  const observed: { enabled: boolean; overlay: string; tools: readonly string[] }[] = [];
  await Promise.all([true, false].map(enabled => captureDaemonRun({ prompt: "Import posts" }, { bindings: {
    routeDeps: { ownerPrincipalId: Promise.resolve("daemon-test-principal"), siteBinding: { dir: "/site" }, workspaceId: "ws", toolAttemptAuditSink: { append: async () => {} } },
    assistantCliCapabilitiesContext, readAssistantCliPermissions: async () => assistantCliPermissions({ enabled }),
    agentExecutor: { run: async (_required: unknown, optional: { disallowedTools: readonly string[] }) => {
      // Read after an async boundary so a process-wide last-value cache cannot satisfy this test.
      await Promise.resolve();
      observed.push({ enabled, overlay: augmenter.systemOverlay({ agentId: "claude", turnIndex: 0 }), tools: optional.disallowedTools });
      throw new Error("captured launch without starting a process");
    } },
  }, lifecycle: { waitForTerminal: () => new Promise(() => {}), stream: async () => ({ kind: "ok" }) } }).catch(error => assert.match(error.message, /captured launch/))));
  assert.equal(observed.length, 2);
  for (const { enabled, overlay, tools } of observed) {
    assert.ok(overlay.includes(enabled
      ? "Native agents/subagents/Task are available for this chat."
      : "Native agents/subagents/Task are unavailable for this chat."));
    assert.ok(overlay.includes("Owner custom guidance"));
    for (const tool of ["Agent", "Task"]) assert.equal(tools.includes(tool), !enabled);
  }
  assert.equal(assistantCliCapabilitiesContext.getStore(), undefined);
});
