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
import { readAssistantSubagentsEnabled } from "../../../../assistant/subagent-settings.js";

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
  assert.deepEqual(input.disallowedTools, ASSISTANT_DISALLOWED_TOOLS);
  assert.deepEqual(input.settingSources, ASSISTANT_SETTING_SOURCES);
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
  assert.equal(args[settingsIndex + 1], input.settings);
});

test("onStarted disables auto-memory through Claude launch settings even when the hook file is absent", async () => {
  const input = await captureDaemonRun({ prompt: "Find a page" });
  assert.equal(input.settings, '{"autoMemoryEnabled":false}');
  const def = getAgentDef({ id: "claude" });
  assert.ok(def);
  const args = def.buildArgs({ prompt: input.prompt, imagePaths: [] }, { extraAllowedDirs: [], options: input });
  const settingsIndex = args.indexOf("--settings");
  assert.ok(settingsIndex >= 0);
  assert.equal(args[settingsIndex + 1], input.settings);
});

test("the Claude setting allows Agent and Task; other runtimes and every other isolation keep their grant", async () => {
  for (const agentId of ["claude", "codex", "gemini", "byok"]) {
    for (const subagentsEnabled of [false, true]) {
      const expected = agentId === "claude" && subagentsEnabled
        ? ASSISTANT_DISALLOWED_TOOLS.filter((tool) => tool !== "Task" && tool !== "Agent") : ASSISTANT_DISALLOWED_TOOLS;
      assert.deepEqual(resolveAssistantDisallowedTools({ agentId, subagentsEnabled }), expected);
      const input = await captureDaemonRun({ prompt: "Delegate this" }, { hookPresent: true,
        request: { agentId }, bindings: { readAssistantSubagentsEnabled: async () => subagentsEnabled } });
      assert.deepEqual(input.disallowedTools, expected);
      assert.deepEqual(input.settingSources, ASSISTANT_SETTING_SOURCES);
      assert.ok(input.settings, "the no-system-search guard stays wired");
      assert.equal(input.permissionMode, "bypassPermissions");
    }
  }
  assert.ok(ASSISTANT_DISALLOWED_TOOLS.includes("Task"), "the resolver must not mutate the default list");
});

test("real per-launch reads apply enable AND revoke without restarting the daemon", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  let id = 0;
  const clock = { nowMs: () => 0 };
  const ids = { newId: () => `subag-launch-${++id}` };
  const principals = { findActiveById: async () => null };
  await ensureSettingDefinitions({ settingsRepo, clock, ids, principals }, {
    namespace: "core.assistant-subagents", definitions: [{ key: "enabled", schema: { type: "boolean" }, defaultValue: true }], systemPrincipalId: "boot",
  });
  const routeDeps = { settingsRepo, getEffective, settingsUiTabsReady: Promise.resolve(), workspaceId: "ws-daemon-test" };
  const launch = () => captureDaemonRun({ prompt: "Delegate this" }, { bindings: { routeDeps, readAssistantSubagentsEnabled } });
  for (const tool of ["Agent", "Task"]) assert.equal((await launch()).disallowedTools?.includes(tool), false);
  for (const value of [true, false]) {
    await set({ deps: { repo: settingsRepo, clock, ids, principals, authorize: async () => ({ allowed: true, reason: "owner" }) },
      input: { namespace: "core.assistant-subagents", key: "enabled", scope: "workspace", workspaceId: routeDeps.workspaceId,
        authWorkspaceId: routeDeps.workspaceId, callerPrincipalId: "owner", value } });
    for (const tool of ["Agent", "Task"]) assert.equal((await launch()).disallowedTools?.includes(tool), !value);
  }
});


test("a failed fresh subagent read still launches Claude with every default tool restriction", async () => {
  const warnings: string[] = [];
  const routeDeps = { workspaceId: "ws-daemon-test", settingsRepo: new InMemorySettingsRepo(),
    settingsUiTabsReady: Promise.resolve(), getEffective: async () => { throw new Error("settings unavailable"); } };
  const input = await captureDaemonRun({ prompt: "Delegate this" }, { bindings: {
    routeDeps,
    readAssistantSubagentsEnabled: (required: Parameters<typeof readAssistantSubagentsEnabled>[0]) =>
      readAssistantSubagentsEnabled(required, { warn: message => warnings.push(message) }),
  } });
  assert.deepEqual(input.disallowedTools, ASSISTANT_DISALLOWED_TOOLS);
  assert.equal(input.permissionMode, "bypassPermissions");
  assert.deepEqual(input.settingSources, ASSISTANT_SETTING_SOURCES);
  assert.deepEqual(warnings, ["[agent-daemon] subagent settings unavailable; delegation remains OFF."]);
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
  const assistantSubagentsContext = new AsyncLocalStorage<boolean>();
  const augmenter = evaluateDaemonExpression<{ systemOverlay(input: { agentId: string; turnIndex: number }): string }>(
    daemonInitializer("assistantPromptAugmenter"), {
      buildBaseSystemOverlay, buildAssistantSubagentsOverlay, assistantSubagentsContext,
      bashProhibitionEnabled: false, customInstructionsCache: { readOverlay: () => "Owner custom guidance" },
    });
  const observed: { enabled: boolean; overlay: string; tools: readonly string[] }[] = [];
  await Promise.all([true, false].map(enabled => captureDaemonRun({ prompt: "Import posts" }, { bindings: {
    assistantSubagentsContext, readAssistantSubagentsEnabled: async () => enabled,
    agentExecutor: { run: async (_required: unknown, optional: { disallowedTools: readonly string[] }) => {
      // Read after an async boundary so a process-wide last-value cache cannot satisfy this test.
      await Promise.resolve();
      observed.push({ enabled, overlay: augmenter.systemOverlay({ agentId: "claude", turnIndex: 0 }), tools: optional.disallowedTools });
      throw new Error("captured launch without starting a process");
    } },
  } }).catch(error => assert.match(error.message, /captured launch/))));
  assert.equal(observed.length, 2);
  for (const { enabled, overlay, tools } of observed) {
    assert.ok(overlay.includes(enabled ? "may spawn subagents" : "cannot spawn subagents"));
    assert.ok(overlay.includes("Owner custom guidance"));
    for (const tool of ["Agent", "Task"]) assert.equal(tools.includes(tool), !enabled);
  }
  assert.equal(assistantSubagentsContext.getStore(), undefined);
});
