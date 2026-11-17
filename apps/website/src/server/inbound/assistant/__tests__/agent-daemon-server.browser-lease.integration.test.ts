import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { tmpdir } from "node:os";
import test from "node:test";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { getEffective, InMemorySettingsRepo } from "@jini-ai/core/settings";
import type { AgentExecutorRunInput } from "@jini-ai/daemon";
import { assistantCliPermissions } from "#src/assistant/assistant-subagents-policy";
import { DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, readAssistantRuntimePreferences } from "#src/assistant/runtime-preferences";
import { ADMIN_INTERFACE_NAMESPACE, ensureAdminInterfaceSettingDefinitions, USE_CLAUDE_IN_CHROME_KEY } from "#src/features/settings/admin-interface";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { CLAUDE_IN_CHROME_ALLOWED_TOOLS, CLAUDE_IN_CHROME_GUIDANCE, buildAssistantRuntimeGuidance } from "../assistant-runtime-guidance.js";
import { captureDaemonRun } from "./helpers/daemon-source.js";

/**
 * @file Tool-call fix S17: one Claude in Chrome integration at a time per daemon, and a default that
 * follows the owner. Runs go through the daemon's real `onStarted` source (see
 * `helpers/daemon-source.ts`); only the executor, the settings read and the lifecycle are fakes.
 */

const OWNER = "daemon-test-principal";

interface LaunchedRun { readonly launched: AgentExecutorRunInput; readonly guidance: string }

/** One run through the real launch assembly with the person's stored Chrome preference. */
async function launchRun({ principal = OWNER, agentId = "claude", useClaudeInChrome = true }: {
  principal?: string; agentId?: string; useClaudeInChrome?: boolean;
} = {}): Promise<LaunchedRun> {
  const guidanceContext = new AsyncLocalStorage<Parameters<typeof buildAssistantRuntimeGuidance>[0]["input"]>();
  let guidance = "";
  let launched: AgentExecutorRunInput | undefined;
  await captureDaemonRun({ prompt: "Check my pages", principalId: principal }, { request: { agentId }, bindings: {
    routeDeps: {
      ownerPrincipalId: Promise.resolve(OWNER), siteBinding: { dir: tmpdir() }, workspaceId: "ws",
      toolAttemptAuditSink: { append: async () => {} }, settingsRepo: {}, siteTitleReady: Promise.resolve(),
      getEffective: async (_deps: unknown, input: { key: string }) => ({ value: input.key === USE_CLAUDE_IN_CHROME_KEY ? useClaudeInChrome : undefined, sourceLayer: "user", defVersion: 1 }),
    },
    assistantRuntimeGuidanceContext: guidanceContext, assistantCliCapabilitiesContext: new AsyncLocalStorage(),
    probeAssistantChrome: async () => true,
    readAssistantCliPermissions: async () => assistantCliPermissions({ enabled: true }),
    agentExecutor: { run: async (required: AgentExecutorRunInput, optional: Partial<AgentExecutorRunInput> = {}) => {
      launched = { ...required, ...optional };
      guidance = buildAssistantRuntimeGuidance({ input: guidanceContext.getStore() });
      throw new Error("captured launch without starting a process");
    } },
  } }).catch(error => assert.match(error.message, /captured launch/));
  assert.ok(launched, "the launch reached the executor");
  return { launched, guidance };
}

test("two owner runs back to back with the preference on both launch with Chrome and the allow-list", async () => {
  for (let run = 0; run < 2; run++) {
    const { launched, guidance } = await launchRun();
    assert.equal(launched.chromeIntegration, true, `run ${run}`);
    assert.deepEqual(launched.allowedTools, CLAUDE_IN_CHROME_ALLOWED_TOOLS, `run ${run}`);
    assert.ok(guidance.includes(CLAUDE_IN_CHROME_GUIDANCE), `run ${run}`);
  }
});

test("a non-owner run launches without Chrome and a runtime without the flag gets none", async () => {
  const nonOwner = await launchRun({ principal: "someone-else" });
  assert.equal(nonOwner.launched.chromeIntegration, false);
  assert.equal(nonOwner.launched.allowedTools, undefined);
  const unsupported = await launchRun({ agentId: "codex" });
  assert.equal("chromeIntegration" in unsupported.launched, false);
  assert.equal(unsupported.launched.allowedTools, undefined);
});

/** A ledger that registered the real definitions, as a freshly booted site has. */
async function freshRegisteredLedger() {
  const deps = {
    settingsRepo: new InMemorySettingsRepo(),
    clock: { nowIso: () => "2026-11-17T00:00:00.000Z", nowMs: () => Date.parse("2026-11-17T00:00:00.000Z") },
    ids: { newId: (() => { let next = 0; return () => `lease-test-id-${++next}`; })() },
    principals: createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) }),
  };
  await ensureAdminInterfaceSettingDefinitions(deps, { systemPrincipalId: "system-settings-migration" });
  return deps;
}

test("the Chrome default has two owners today, and both say on", async () => {
  const { settingsRepo } = await freshRegisteredLedger();
  const preferenceDeps = { settingsRepo, getEffective, settingsReady: Promise.resolve(), workspaceId: "ws" };
  // Owner 1: the registered definition. The effective read finds it with no stored choice.
  const effective = await getEffective({ repo: settingsRepo }, { namespace: ADMIN_INTERFACE_NAMESPACE, key: USE_CLAUDE_IN_CHROME_KEY, scopeContext: { workspaceId: "ws", principalId: OWNER } });
  assert.equal(effective?.value, true);
  assert.equal((await readAssistantRuntimePreferences({ deps: preferenceDeps, principalId: OWNER })).useClaudeInChrome, true);
  // Owner 2: the fallback object, used when the definition cannot be read at all.
  const unregistered = { ...preferenceDeps, settingsRepo: new InMemorySettingsRepo() };
  assert.equal((await readAssistantRuntimePreferences({ deps: unregistered, principalId: OWNER })).useClaudeInChrome, true);
  assert.equal(DEFAULT_ASSISTANT_RUNTIME_PREFERENCES.useClaudeInChrome, true);
});
