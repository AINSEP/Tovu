import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { AgentExecutorRunInput, RunLifecycle } from "@jini-ai/daemon";

import { createEarlySessionCapture } from "../../early-run-session.js";
import type { AgentSessionStore } from "#src/assistant/persistence/agent-session-store";
import { parseRunStartContextRef } from "#src/assistant/run-start-context";
import { buildPageContextPromptBlock } from "#src/assistant/run-page-context";
import { createRunActiveContextStore, type RunActiveContextStore } from "#src/assistant/run-active-context";
import { assemblePromptWithPluginPrefix } from "../../plugin-prompt-prefix.js";
import { agentCarriesOwnMemory, resolveResumeSessionField, wouldForcedColdStartLoseConversationContext } from "../../agent-session-resume.js";
import { agentAcceptsHostMintedSessionId, resolveHostMintedSessionId, resolveNewSessionField } from "../../agent-session-binding.js";
import { createConversationStartLock } from "../../conversation-start-lock.js";
import { ASSISTANT_DISALLOWED_TOOLS, ASSISTANT_SETTING_SOURCES, resolveAssistantRunSettings } from "../../assistant-system-overlay.js";

export const daemonSource = ts.createSourceFile(
  "agent-daemon-server.ts",
  readFileSync(path.join(import.meta.dirname, "../../agent-daemon-server.ts"), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
);

export function daemonInitializer(name: string): ts.Expression {
  for (const statement of daemonSource.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find((entry) => entry.name.getText(daemonSource) === name);
    if (declaration?.initializer) return declaration.initializer;
  }
  throw new Error(`No module-level initializer for ${name}`);
}

/** Execute the actual source expression, with its external dependencies supplied by the test.
 * AST boundaries exclude comments and nested lookalikes. This avoids booting the entry script's
 * database, listeners, federation and agent processes, without duplicating its run assembly. */
export function evaluateDaemonExpression<T>(expression: ts.Node, bindings: Record<string, unknown>): T {
  const code = ts.transpileModule(`return (${expression.getText(daemonSource)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), code)(...Object.values(bindings)) as T;
}

/** Run the complete onStarted callback through its async continuation to the executor boundary.
 * Only unrelated lifecycle/attachment/plugin I/O is faked; decode, prompt rendering, session
 * decisions and hook-settings generation are real. No daemon/server/CLI is started. */
export async function captureDaemonRun(
  context: Record<string, unknown>,
  options: { hookPresent?: boolean; runActiveContexts?: RunActiveContextStore; bindings?: Record<string, unknown>; lifecycle?: unknown; terminalFailure?: boolean; request?: Record<string, unknown> } = {},
): Promise<AgentExecutorRunInput> {
  let resolve!: (input: AgentExecutorRunInput) => void;
  let reject!: (error: Error) => void;
  const captured = new Promise<AgentExecutorRunInput>((yes, no) => { resolve = yes; reject = no; });
  const timer = setTimeout(() => reject(new Error("onStarted did not call the executor")), 1000);
  const fixtureDeps = options.bindings?.routeDeps as { agentSessions?: AgentSessionStore } | undefined;
  const bindings = {
    captureEarlySession: createEarlySessionCapture({ sessions: fixtureDeps?.agentSessions ?? { getSessionId: async () => null, setSessionId: async () => {}, clearSessionId: async () => {} }, readStart: async () => null }, {}),
    parseRunStartContextRef, buildPageContextPromptBlock, assemblePromptWithPluginPrefix,
    agentCarriesOwnMemory, resolveResumeSessionField, wouldForcedColdStartLoseConversationContext,
    agentAcceptsHostMintedSessionId, resolveHostMintedSessionId, resolveNewSessionField,
    ASSISTANT_DISALLOWED_TOOLS, ASSISTANT_SETTING_SOURCES, resolveAssistantRunSettings,
    DEFAULT_AGENT_ID: "claude",
    principalByRunId: new Map(),
    messageAttachmentRefsByRunId: new Map(),
    runOwners: { record() {} },
    runActiveContexts: options.runActiveContexts ?? createRunActiveContextStore(),
    frontendControl: { bindOnStarted() {} },
    customInstructionsCache: { refresh: async () => {} },
    resolveAttachmentRunFields: async () => ({}),
    resolveAgentPluginPromptPrefix: async () => "",
    buildCapabilityManifestPrefix: () => "",
    resolveCapabilityManifestArm: () => "off",
    toolExtensions: undefined,
    conversationStartLock: createConversationStartLock(),
    routeDeps: { workspaceId: "ws-daemon-test" },
    randomUUID: () => "unused-session-id",
    process: { env: {}, cwd: () => "/tmp/daemon-test" },
    resolvePermissionMode: () => "bypassPermissions",
    homedir: () => "/home/daemon-test",
    existsSync: (file: string) => options.hookPresent === true && file === "/home/daemon-test/.claude/hooks/no-system-search",
    failRunBeforeStart: async (_lifecycle: unknown, _id: string, message: string) => { reject(new Error(message)); },
    console: { error: (...args: unknown[]) => { if (!options.terminalFailure) reject(new Error(args.map(String).join(" "))); }, log() {} },
    // `run()` takes Jini's (required, optional) pair; the executor reassembles one
    // AgentExecutorRunInput from them, so the capture does the same.
    agentExecutor: { run: async (required: AgentExecutorRunInput, optional: Partial<AgentExecutorRunInput> = {}) => resolve({ ...required, ...optional }) },
    ...options.bindings,
  };
  try {
    if (!options.bindings?.routeDeps) assert.equal(context.conversationId, undefined, "session I/O requires explicit fixture ports");
    if (options.terminalFailure) {
      assert.ok(options.lifecycle, "terminal failure capture requires a real lifecycle");
      void (options.lifecycle as Pick<RunLifecycle, "waitForTerminal">).waitForTerminal({ runId: "daemon-test-run" }).then((status) => {
        if (status.state === "failed") reject(new Error("onStarted failed the run before executor dispatch"));
      });
    }
    const onStarted = evaluateDaemonExpression<(input: unknown) => void>(daemonInitializer("onStarted"), bindings);
    onStarted({
      request: { contextRef: JSON.stringify({ principalId: "daemon-test-principal", ...context }), ...options.request },
      run: { id: "daemon-test-run" },
      lifecycle: options.lifecycle ?? { waitForTerminal: () => new Promise(() => {}) },
    });
    return await captured;
  } finally {
    clearTimeout(timer);
  }
}

/** Select only direct statements: a commented-out or unreachable lookalike cannot satisfy a seam. */
export function daemonFunction(name: string): ts.FunctionDeclaration {
  const declaration = daemonSource.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration && ts.isFunctionDeclaration(declaration), `No module-level function ${name}`);
  return declaration;
}

export function daemonVariableStatement(statements: readonly ts.Statement[], name: string): ts.VariableStatement {
  const statement = statements.find((entry) => ts.isVariableStatement(entry) && entry.declarationList.declarations.some((declaration) => declaration.name.getText(daemonSource) === name));
  assert.ok(statement && ts.isVariableStatement(statement), `No direct variable statement ${name}`);
  return statement;
}

export function evaluateDaemonStatements<T>(statements: readonly ts.Statement[], bindings: Record<string, unknown>, result = "undefined"): Promise<T> {
  const code = ts.transpileModule(`return (async () => { ${statements.map((statement) => statement.getText(daemonSource)).join("\n")} return (${result}); })();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), code)(...Object.values(bindings)) as Promise<T>;
}
