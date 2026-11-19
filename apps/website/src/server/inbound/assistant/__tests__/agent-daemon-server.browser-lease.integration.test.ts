import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { tmpdir } from "node:os";
import test from "node:test";
import ts from "typescript";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { ensureSettingDefinitions, getEffective, InMemorySettingsRepo, set, SCOPE_BIT } from "@jini-ai/core/settings";
import { createInMemoryEventLog, createRunLifecycle, type AgentExecutorRunInput, type RunLifecycle } from "@jini-ai/daemon";
import { createExclusiveRunLease, type ExclusiveRunLease } from "@jini-ai/daemon/exclusive-run-lease";
import { failRunBeforeStart } from "#src/assistant/agent-session-preset";
import { assistantCliPermissions } from "@tovu/contracts/assistant-native-fallbacks";
import { DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, readAssistantRuntimePreferences } from "#src/assistant/runtime-preferences";
import { ADMIN_INTERFACE_NAMESPACE, ensureAdminInterfaceSettingDefinitions, USE_CLAUDE_IN_CHROME_KEY } from "#src/features/settings/admin-interface";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { BROWSER_BUSY_GUIDANCE, CLAUDE_IN_CHROME_ALLOWED_TOOLS, CLAUDE_IN_CHROME_GUIDANCE, buildAssistantRuntimeGuidance } from "../assistant-runtime-guidance.js";
import { daemonEntrySource } from "./helpers/daemon-entry-source.js";
import { captureDaemonRun } from "./helpers/daemon-source.js";

/**
 * @file Tool-call fix S17: one Claude in Chrome integration at a time per daemon, and a default that
 * follows the owner. Runs go through the daemon's real `onStarted` source (see
 * `helpers/daemon-source.ts`); only the executor, the settings read and the lifecycle are fakes.
 */

const OWNER = "daemon-test-principal";

interface LaunchedRun { readonly launched: AgentExecutorRunInput; readonly guidance: string }

interface LaunchOptions {
  principal?: string; agentId?: string; useClaudeInChrome?: boolean; runId?: string; lease?: ExclusiveRunLease;
  lifecycle?: RunLifecycle; executorSettles?: Promise<unknown>; terminalFailure?: boolean; bindings?: Record<string, unknown>;
}

/** One run through the real launch assembly with the person's stored Chrome preference. The executor
 * is the harness's own: it reports the launch and then stays pending until `executorSettles` settles,
 * which is how a child process that is still running looks to the scope. */
async function launchRun({ principal = OWNER, agentId = "claude", useClaudeInChrome = true, runId, lease, lifecycle, executorSettles, terminalFailure, bindings = {} }: LaunchOptions = {}): Promise<LaunchedRun> {
  let guidance = "";
  const launched = await captureDaemonRun({ prompt: "Check my pages", principalId: principal }, {
    ...(runId ? { runId } : {}), ...(lifecycle ? { lifecycle } : {}), ...(executorSettles ? { executorSettles } : {}), ...(terminalFailure ? { terminalFailure } : {}), request: { agentId },
    bindings: {
      routeDeps: {
        ownerPrincipalId: Promise.resolve(OWNER), siteBinding: { dir: tmpdir() }, workspaceId: `ws-${runId ?? "run"}`,
        toolAttemptAuditSink: { append: async () => {} }, settingsRepo: {}, siteTitleReady: Promise.resolve(),
        getEffective: async (input: { key: string }) => ({ value: input.key === USE_CLAUDE_IN_CHROME_KEY ? useClaudeInChrome : undefined, sourceLayer: "user", defVersion: 1 }),
      },
      assistantRuntimeGuidanceContext: { run: (input: Parameters<typeof buildAssistantRuntimeGuidance>[0]["input"], fn: () => unknown) => { guidance = buildAssistantRuntimeGuidance({ input }); return fn(); } },
      assistantCliCapabilitiesContext: new AsyncLocalStorage(),
      probeAssistantChrome: async () => true,
      readAssistantCliPermissions: async () => assistantCliPermissions({ enabled: true }),
      optional: { browserLease: lease },
      ...bindings,
    },
  });
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

const SYSTEM_PRINCIPAL = "system-settings-migration";

/** An empty settings ledger with its write ports. */
function ledgerDeps() {
  return {
    settingsRepo: new InMemorySettingsRepo(),
    clock: { nowIso: () => "2026-11-17T00:00:00.000Z", nowMs: () => Date.parse("2026-11-17T00:00:00.000Z") },
    ids: { newId: (() => { let next = 0; return () => `lease-test-id-${++next}`; })() },
    principals: createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) }),
  };
}

/** A ledger that registered the real definitions, as a freshly booted site has. */
async function freshRegisteredLedger() {
  const deps = ledgerDeps();
  await ensureAdminInterfaceSettingDefinitions(deps, { systemPrincipalId: SYSTEM_PRINCIPAL });
  return deps;
}

const WORKSPACE = "workspace-1";

/** Reads one person's runtime preferences the way a launch does, over the ledger's real getEffective. */
const preferencesFor = ({ settingsRepo, principalId }: { settingsRepo: InMemorySettingsRepo; principalId: string }) =>
  readAssistantRuntimePreferences({ deps: { settingsRepo, getEffective, settingsReady: Promise.resolve(), workspaceId: WORKSPACE }, principalId });

/** The person's own saved choice, written through the real write service. */
async function saveChoice({ ledger, principalId, value }: { ledger: Awaited<ReturnType<typeof freshRegisteredLedger>>; principalId: string; value: boolean }) {
  const deps = { repo: ledger.settingsRepo, clock: ledger.clock, ids: ledger.ids, authorize: async () => ({ allowed: true, reason: "test" }), principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) } };
  await set({ deps, input: { namespace: ADMIN_INTERFACE_NAMESPACE, key: USE_CLAUDE_IN_CHROME_KEY, scope: "user" as const, workspaceId: WORKSPACE, principalId, callerPrincipalId: principalId, authWorkspaceId: WORKSPACE, value } });
}

test("OD-4: Chrome is off by default from both owners of the default", async () => {
  const { settingsRepo } = await freshRegisteredLedger();
  // Owner 1: the registered definition answers when nothing is stored.
  const effective = await getEffective({ deps: { repo: settingsRepo }, namespace: ADMIN_INTERFACE_NAMESPACE, key: USE_CLAUDE_IN_CHROME_KEY, scopeContext: { workspaceId: WORKSPACE, principalId: OWNER } });
  assert.deepEqual(effective, { value: false, sourceLayer: "default", defVersion: 1 });
  assert.equal((await preferencesFor({ settingsRepo, principalId: OWNER })).useClaudeInChrome, false);
  // Owner 2: the fallback object answers when the definition cannot be read at all.
  assert.equal((await preferencesFor({ settingsRepo: new InMemorySettingsRepo(), principalId: OWNER })).useClaudeInChrome, false);
  assert.equal(DEFAULT_ASSISTANT_RUNTIME_PREFERENCES.useClaudeInChrome, false);
});

test("OD-4: a stored true stays true and a stored false stays false, with no migration", async () => {
  const ledger = await freshRegisteredLedger();
  await saveChoice({ ledger, principalId: "alice", value: true });
  await saveChoice({ ledger, principalId: "bob", value: false });
  assert.equal((await preferencesFor({ settingsRepo: ledger.settingsRepo, principalId: "alice" })).useClaudeInChrome, true);
  assert.equal((await preferencesFor({ settingsRepo: ledger.settingsRepo, principalId: "bob" })).useClaudeInChrome, false);
  assert.equal((await preferencesFor({ settingsRepo: ledger.settingsRepo, principalId: "carol" })).useClaudeInChrome, false);
});

test("OD-4: a site that booted with the old default flips to off on its next boot and keeps stored choices", async () => {
  const ledger = ledgerDeps();
  // The state an installed site is in: its first boot stored `true` as the definition's default.
  await ensureSettingDefinitions(ledger, { namespace: ADMIN_INTERFACE_NAMESPACE, systemPrincipalId: SYSTEM_PRINCIPAL, definitions: [
    { key: USE_CLAUDE_IN_CHROME_KEY, schema: { type: "boolean" }, defaultValue: true, scopes: SCOPE_BIT.user | SCOPE_BIT.workspace },
  ] });
  assert.equal((await preferencesFor({ settingsRepo: ledger.settingsRepo, principalId: "carol" })).useClaudeInChrome, true);
  await saveChoice({ ledger, principalId: "alice", value: true });
  await ensureAdminInterfaceSettingDefinitions(ledger, { systemPrincipalId: SYSTEM_PRINCIPAL });
  assert.equal((await preferencesFor({ settingsRepo: ledger.settingsRepo, principalId: "carol" })).useClaudeInChrome, false);
  assert.equal((await preferencesFor({ settingsRepo: ledger.settingsRepo, principalId: "alice" })).useClaudeInChrome, true);
});

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

/** A started run in a real in-memory lifecycle, so terminal records drive the release like production. */
async function startedLifecycle({ runId }: { runId: string }): Promise<RunLifecycle> {
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  await lifecycle.rehydrate({});
  await lifecycle.start({ contextRef: `browser-lease-${runId}` }, { runId });
  return lifecycle;
}

/** Bindings the scope's end-of-run cleanup needs; the fake timer never fires. */
const CLEANUP_BINDINGS: Record<string, unknown> = {
  failRunBeforeStart, console: { error() {}, warn() {}, log() {} },
  runOwners: { record() {}, forget() {} }, runCredentials: { revoke() {} }, RUN_OWNER_RETENTION_MS: 0, attachmentStore: undefined,
  setTimeout: () => ({ unref() { return this; } }),
};

/** An owner run in its own site scope that keeps the browser until its lifecycle ends. */
async function holdingRun({ lease, runId }: { lease: ExclusiveRunLease; runId: string }) {
  const lifecycle = await startedLifecycle({ runId });
  const run = await launchRun({ lease, runId, lifecycle, executorSettles: new Promise(() => {}), bindings: CLEANUP_BINDINGS });
  assert.equal(run.launched.chromeIntegration, true, `${runId} launches with the browser`);
  assert.equal(lease.holder(), runId, `${runId} holds the browser`);
  return { lifecycle, ...run };
}

/** The next owner run, in a different site scope sharing the daemon's lease. */
const nextRun = async ({ lease }: { lease: ExclusiveRunLease }) => launchRun({ lease, runId: "run-next", bindings: CLEANUP_BINDINGS });

test("a second concurrent owner run in another site scope launches without Chrome and is told why", async () => {
  const lease = createExclusiveRunLease({});
  await holdingRun({ lease, runId: "run-site-a" });
  const second = await launchRun({ lease, runId: "run-site-b", bindings: CLEANUP_BINDINGS });
  assert.equal(second.launched.chromeIntegration, false);
  assert.equal(second.launched.allowedTools, undefined);
  assert.ok(second.guidance.includes("Another chat is using the browser integration. Use web_screenshot_page and page tools."));
  assert.equal(second.guidance.includes(CLAUDE_IN_CHROME_GUIDANCE), false);
  assert.equal(BROWSER_BUSY_GUIDANCE, "Another chat is using the browser integration. Use web_screenshot_page and page tools.");
});

for (const outcome of ["succeeded", "failed", "cancelled"] as const) {
  test(`the browser is released when the holder's run ends ${outcome}`, async () => {
    const lease = createExclusiveRunLease({});
    const { lifecycle } = await holdingRun({ lease, runId: "run-holder" });
    await lifecycle.finish({ runId: "run-holder", status: outcome, code: null, signal: null, resumable: false });
    await flush();
    assert.equal(lease.holder(), undefined);
    assert.equal((await nextRun({ lease })).launched.chromeIntegration, true);
  });
}

/** A real lease that also records who asked, so a test can tell "claimed then released" from "never claimed". */
function observedLease(): { lease: ExclusiveRunLease; asked: string[] } {
  const real = createExclusiveRunLease({});
  const asked: string[] = [];
  return { asked, lease: { ...real, acquire: (required) => { asked.push(required.runId); return real.acquire(required); } } };
}

test("the browser is released when the launch fails after the run claimed it", async () => {
  const { lease, asked } = observedLease();
  const lifecycle = await startedLifecycle({ runId: "run-holder" });
  await assert.rejects(launchRun({ lease, runId: "run-holder", lifecycle, terminalFailure: true, bindings: { ...CLEANUP_BINDINGS,
    readLoginShellEnvironment: async () => { throw new Error("login shell unavailable"); } } }), /failed the run before executor dispatch/);
  await flush();
  assert.deepEqual(asked, ["run-holder"], "the run claimed the browser before the launch failed");
  assert.equal((await lifecycle.get({ runId: "run-holder" }))?.state, "failed");
  assert.equal(lease.holder(), undefined);
  assert.equal((await nextRun({ lease })).launched.chromeIntegration, true);
});

test("the browser is released when the executor's run settles without any terminal event", async () => {
  const lease = createExclusiveRunLease({});
  let childExited!: () => void;
  const executorSettles = new Promise<void>(resolve => { childExited = resolve; });
  await launchRun({ lease, runId: "run-holder", executorSettles });
  assert.equal(lease.holder(), "run-holder");
  childExited();
  await flush();
  assert.equal(lease.holder(), undefined);
  assert.equal((await nextRun({ lease })).launched.chromeIntegration, true);
});

test("the browser is released when the scope is disposed while its run holds the lease", async () => {
  // dispose() cancels every live run and waits for its child to exit; the terminal record can lag it.
  const lease = createExclusiveRunLease({});
  let childExited!: () => void;
  const executorSettles = new Promise<void>(resolve => { childExited = resolve; });
  const lifecycle = await startedLifecycle({ runId: "run-holder" });
  await launchRun({ lease, runId: "run-holder", lifecycle, executorSettles, bindings: CLEANUP_BINDINGS });
  assert.equal(lease.holder(), "run-holder");
  await lifecycle.cancel({ runId: "run-holder" });
  childExited();
  await flush();
  assert.equal(lease.holder(), undefined);
  assert.equal((await nextRun({ lease })).launched.chromeIntegration, true);
});

/** A lease that only records who asked, to show which runs never claim the browser. */
function recordingLease(): { lease: ExclusiveRunLease; asked: string[] } {
  const asked: string[] = [];
  return { asked, lease: { acquire: ({ runId }) => { asked.push(runId); return { granted: true }; }, release() {}, holder: () => undefined } };
}

test("a non-owner run, an unsupported runtime and a preference that is off never ask for the browser", async () => {
  const { lease, asked } = recordingLease();
  await launchRun({ lease, runId: "run-non-owner", principal: "someone-else" });
  await launchRun({ lease, runId: "run-codex", agentId: "codex" });
  await launchRun({ lease, runId: "run-pref-off", useClaudeInChrome: false });
  assert.deepEqual(asked, []);
  await launchRun({ lease, runId: "run-owner" });
  assert.deepEqual(asked, ["run-owner"]);
});

/** The daemon process hosts every site scope, so the lease is made once, at the entry. */
test("the daemon entry makes one lease and hands the same object to every site scope", () => {
  const leaseCalls: ts.CallExpression[] = [];
  const scopeCalls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(daemonEntrySource) === "createExclusiveRunLease") leaseCalls.push(node);
    if (ts.isCallExpression(node) && node.expression.getText(daemonEntrySource) === "createSiteScope") scopeCalls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(daemonEntrySource);
  assert.equal(leaseCalls.length, 1);
  const declaration = leaseCalls[0]!.parent;
  assert.ok(ts.isVariableDeclaration(declaration) && declaration.name.getText(daemonEntrySource) === "browserLease");
  assert.ok(ts.isVariableStatement(declaration.parent.parent), "the lease is a module-level statement, not made per scope");
  assert.equal(scopeCalls.length, 2, "the shared-host factory and the standalone mount are the only scope creators");
  for (const call of scopeCalls) {
    const options = call.arguments[1];
    assert.ok(options && ts.isObjectLiteralExpression(options));
    assert.ok(options.properties.some(property => ts.isShorthandPropertyAssignment(property) && property.name.text === "browserLease"), call.getText(daemonEntrySource).slice(0, 80));
  }
});
