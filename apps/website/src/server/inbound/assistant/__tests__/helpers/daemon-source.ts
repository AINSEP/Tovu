import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { AgentExecutorRunInput } from "@jini-ai/daemon";

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
export function evaluateDaemonExpression<T>(expression: ts.Expression, bindings: Record<string, unknown>): T {
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
  options: { hookPresent?: boolean; runActiveContexts?: RunActiveContextStore } = {},
): Promise<AgentExecutorRunInput> {
  let resolve!: (input: AgentExecutorRunInput) => void;
  let reject!: (error: Error) => void;
  const captured = new Promise<AgentExecutorRunInput>((yes, no) => { resolve = yes; reject = no; });
  const timer = setTimeout(() => reject(new Error("onStarted did not call the executor")), 1000);
  const bindings = {
    parseRunStartContextRef, buildPageContextPromptBlock, assemblePromptWithPluginPrefix,
    agentCarriesOwnMemory, resolveResumeSessionField, wouldForcedColdStartLoseConversationContext,
    agentAcceptsHostMintedSessionId, resolveHostMintedSessionId, resolveNewSessionField,
    ASSISTANT_DISALLOWED_TOOLS, ASSISTANT_SETTING_SOURCES, resolveAssistantRunSettings,
    DEFAULT_AGENT_ID: "claude",
    principalByRunId: new Map(),
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
    console: { error: (...args: unknown[]) => reject(new Error(args.map(String).join(" "))) },
    // `run()` takes Jini's (required, optional) pair; the executor reassembles one
    // AgentExecutorRunInput from them, so the capture does the same.
    agentExecutor: { run: async (required: AgentExecutorRunInput, optional: Partial<AgentExecutorRunInput> = {}) => resolve({ ...required, ...optional }) },
  };
  try {
    assert.equal(context.conversationId, undefined, "this harness covers runs without session I/O");
    const onStarted = evaluateDaemonExpression<(input: unknown) => void>(daemonInitializer("onStarted"), bindings);
    onStarted({
      request: { contextRef: JSON.stringify({ principalId: "daemon-test-principal", ...context }) },
      run: { id: "daemon-test-run" },
      lifecycle: { waitForTerminal: () => new Promise(() => {}) },
    });
    return await captured;
  } finally {
    clearTimeout(timer);
  }
}
