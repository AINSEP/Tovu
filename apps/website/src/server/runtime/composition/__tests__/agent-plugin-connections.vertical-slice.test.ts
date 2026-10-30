import { withExtensionApprovalPolicy } from "../../../../assistant/assistant-tool-approval-policy.js";
/**
 * @file The ONE vertical-slice proof for the G6b wiring: `composeAgentPluginConnections` (what both
 * composition roots call) carries a fake provider plugin ("acme-office", a test fixture) from
 * `agent_plugin_connect`'s sign-in through the public callback to an executable tool call and an
 * admin-surface action, both answered with a token from the shared connection port. Plus the
 * security pins for that port. Only the fake provider's hosts resolve (to a local server); any other
 * host throws.
 *
 * G9's vendor-neutrality proof also lives here (the "end to end" test): the same fixture plugin's
 * whole surface (connection, a confirmed write tool, an admin surface and a push form destination
 * that delivers with the OAuth connectionRef) runs through the real Jini + Tovu seams, with no
 * production code that knows the provider. The grep half of the proof is `../../../../features/
 * api-connections/__tests__/vendor-neutrality.test.ts`.
 *
 * Phase-B pin: the token memory Jini keeps per plugin generation survives across calls through
 * Tovu's real wiring (boot-time tool registration, handler reload before every surface bootstrap).
 * Phase-B (B6) pins: the composition gives the tool projection and the surface handler host ONE
 * token memory (a token either seam obtained is withheld from the other), and the handler host's
 * `hostKind` comes from the same runtime detection the API connections use, whatever a caller says.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createAdminSurfaceActionDispatcher, defineAdminSurfaceContribution } from "@jini-ai/agent-plugins/admin-surfaces";
import { WITHHELD_OUTPUT_MESSAGE } from "@jini-ai/agent-plugins/lifecycle/tools";

import { registerAgentPluginExecutableTools } from "#src/features/agent-plugins/executable-tools/register";
import { ADMIN_SURFACES_FILENAME } from "#src/features/agent-plugins/admin-surfaces/surfaces";
import { runApiConnectionConnect } from "#src/features/api-connections/connect";
import { createOAuthFormDeliveryConnectionPort } from "#src/features/api-connections/form-delivery-connection";
import { loadFormDestinationRegistry, type FormDestinationKit } from "#src/features/form-destinations/index";
import { applyToolApprovalPolicy } from "#src/assistant/tool-approval-policy";
import { startConfirmingCall } from "#src/features/agent-plugins/executable-tools/__tests__/fixtures";

import { WORKSPACE, PLUGIN, PUBLIC_URL, accessToken, refreshToken, appended, providerOrigin, loadContributions, allowAll, compose, connectForRef, followConsent, providerUrlOf, startAcmeProvider, stopAcmeProvider, type AcmeComposition } from "./fixtures/acme-provider.js";

before(startAcmeProvider);
after(stopAcmeProvider);

test("vertical slice: connect -> public callback -> executable tool call -> admin-surface action, all through the composition", async () => {
  const composition = await compose();
  const connectionRef = await connectForRef(composition);

  const registry = createToolRegistry({});
  const { refusals } = await registerAgentPluginExecutableTools({ withExtensionApprovalPolicy,
    registry, workspaceId: WORKSPACE, host: composition.agentPluginTools, authorize: allowAll, isActive: async () => true,
    applyApproval: ({ registration }) => registration,
  });
  assert.deepEqual(refusals, []);
  const toolResult = await createToolExecutor({ registry }).execute({ toolId: "p_acme_office__whoami", principal: { id: "admin-1" }, run: { id: "run-1" }, input: { connectionRef } });
  assert.equal(toolResult.status, "completed", String(toolResult.error));
  assert.deepEqual(toolResult.output, { name: "Ada" });

  const context = { workspaceId: WORKSPACE, principalId: "admin-1", pluginId: PLUGIN, surfaceId: "account" };
  assert.equal(await composition.adminSurfaceHost.bootstrapData({ context }), null, "opening the surface loads its handlers");
  const [surface] = (await loadContributions({ workspaceId: WORKSPACE, definition: defineAdminSurfaceContribution({ filename: ADMIN_SURFACES_FILENAME }) })).items;
  const dispatcher = createAdminSurfaceActionDispatcher({ descriptor: surface!.descriptor, handlers: composition.adminSurfaceHost.handlersFor({ pluginId: PLUGIN, surfaceId: "account" }) });
  const answer = await dispatcher.dispatch({ action: "whoami", payload: {}, context });
  assert.deepEqual(answer, { ok: true, result: { name: "Ada" } });
  assert.ok(!JSON.stringify([toolResult.output, answer]).includes(accessToken), "no token in any answer");
});

test("vertical slice: a surface reads status, starts a pick sign-in, takes its callback field once, saves state, and a tool reads it", async () => {
  const composition = await compose({ TOVU_ACME_OFFICE_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OFFICE_OAUTH_WEB_CLIENT_SECRET: "s".repeat(24), TOVU_PUBLIC_URL: PUBLIC_URL, TOVU_API_CONNECTION_CALLBACK_ORIGINS: PUBLIC_URL, TOVU_ACME_CHOOSER_APP_ID: "app-123" });
  await connectForRef(composition);
  const context = { workspaceId: WORKSPACE, principalId: "admin-1", pluginId: PLUGIN, surfaceId: "account" };
  await composition.adminSurfaceHost.bootstrapData({ context });
  const [surface] = (await loadContributions({ workspaceId: WORKSPACE, definition: defineAdminSurfaceContribution({ filename: ADMIN_SURFACES_FILENAME }) })).items;
  const dispatcher = createAdminSurfaceActionDispatcher({ descriptor: surface!.descriptor, handlers: composition.adminSurfaceHost.handlersFor({ pluginId: PLUGIN, surfaceId: "account" }) });
  const dispatch = (action: string, payload: unknown = {}) => dispatcher.dispatch({ action, payload, context });

  assert.deepEqual(await dispatch("status"), { ok: true, result: { state: "connected", accountLabel: "Ada", grantedScopeSetIds: [], appId: "app-123" } });
  // The action route's collection: the host page gets only the link the host issued in this request.
  const begun = await composition.adminSurfaceHost.signIns!.collect({ run: () => dispatch("begin-pick") });
  assert.equal(begun.value.ok, true);
  const { attemptId } = (begun.value as { result: { attemptId: string } }).result;
  assert.equal(begun.signIns.length, 1);
  const link = new URL(begun.signIns[0]!.authorizationUrl);
  assert.equal(link.origin, PUBLIC_URL, "the host page is offered the host's own sign-in link (F1)");
  assert.equal(providerUrlOf(link.href).searchParams.get("pick_mode"), "one", "the declared start parameter reaches the provider");
  assert.equal((await followConsent(link.href, { picked_ids: "T1" })).status, 200);

  assert.deepEqual(await dispatch("take-pick", { attemptId }), { ok: true, result: { saved: true } });
  assert.deepEqual(await dispatch("take-pick", { attemptId }), { ok: false, error: { code: "nothing-picked", message: "Nothing was picked. Pick again.", retryable: false } }, "callback fields are taken once");

  const registry = createToolRegistry({});
  await registerAgentPluginExecutableTools({ withExtensionApprovalPolicy, registry, workspaceId: WORKSPACE, host: composition.agentPluginTools, authorize: allowAll, isActive: async () => true, applyApproval: ({ registration }) => registration });
  const read = await createToolExecutor({ registry }).execute({ toolId: "p_acme_office__selection", principal: { id: "admin-1" }, run: { id: "run-2" }, input: {} });
  assert.equal(read.status, "completed", String(read.error));
  assert.deepEqual(read.output, { selection: { tableId: "T1" } });
});

test("security: the shared connection port refuses another workspace's target and reads no account for it", async () => {
  const composition = await compose();
  const connectionRef = await connectForRef(composition);
  const { connections } = composition.agentPluginTools;
  assert.equal((await connections.readAccount({ workspaceId: WORKSPACE, pluginId: PLUGIN, connectionRef }))?.displayName, "Ada");
  await assert.rejects(connections.getAccessToken({ workspaceId: "ws-2", pluginId: PLUGIN, connectionRef }), { code: "connection-not-found", message: /not available to this plugin/ });
  assert.equal(await connections.readAccount({ workspaceId: "ws-2", pluginId: PLUGIN, connectionRef }), null);
  assert.equal(await connections.readAccount({ workspaceId: WORKSPACE, pluginId: "other-plugin", connectionRef }), null);
  // H1: the ref chat now receives is still refused for any plugin that does not declare it.
  await assert.rejects(connections.getAccessToken({ workspaceId: WORKSPACE, pluginId: "other-plugin", connectionRef }), { code: "connection-not-found", message: /not available to this plugin/ });
});

test("security: a token a plugin kept in module scope is withheld in a LATER tool call, surface call and state write (one memory per generation)", async () => {
  const composition = await compose();
  const connectionRef = await connectForRef(composition);
  const registry = createToolRegistry({});
  await registerAgentPluginExecutableTools({ withExtensionApprovalPolicy,
    registry, workspaceId: WORKSPACE, host: composition.agentPluginTools, authorize: allowAll, isActive: async () => true, applyApproval: ({ registration }) => registration,
  });
  const executor = createToolExecutor({ registry });
  const call = (toolId: string, input: unknown, id: string) => executor.execute({ toolId, principal: { id: "admin-1" }, run: { id }, input });
  assert.equal((await call("p_acme_office__whoami", { connectionRef }, "run-1")).status, "completed");
  const leaked = await call("p_acme_office__last_token", {}, "run-2");
  assert.notEqual(leaked.status, "completed");
  assert.match(String(leaked.error), new RegExp(WITHHELD_OUTPUT_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(!JSON.stringify(leaked).includes(accessToken));

  const context = { workspaceId: WORKSPACE, principalId: "admin-1", pluginId: PLUGIN, surfaceId: "account" };
  await composition.adminSurfaceHost.bootstrapData({ context });
  const [surface] = (await loadContributions({ workspaceId: WORKSPACE, definition: defineAdminSurfaceContribution({ filename: ADMIN_SURFACES_FILENAME }) })).items;
  const dispatch = (action: string) => createAdminSurfaceActionDispatcher({ descriptor: surface!.descriptor, handlers: composition.adminSurfaceHost.handlersFor({ pluginId: PLUGIN, surfaceId: "account" }) })
    .dispatch({ action, payload: {}, context });
  assert.deepEqual(await dispatch("whoami"), { ok: true, result: { name: "Ada" } });
  // Tovu reloads the handlers before every bootstrap; an unchanged plugin keeps its generation and its memory.
  await composition.adminSurfaceHost.bootstrapData({ context });
  const surfaceLeak = await dispatch("last-token");
  const stateLeak = await dispatch("save-last-token");
  assert.deepEqual([surfaceLeak.ok, stateLeak.ok], [false, false]);
  assert.ok(!JSON.stringify([surfaceLeak, stateLeak]).includes(accessToken), JSON.stringify([surfaceLeak, stateLeak]));
  const saved = await composition.apiConnections.host.pluginState.readerFor({ workspaceId: WORKSPACE, pluginId: PLUGIN }).get({ key: "cached" });
  assert.equal(saved, null, "the token was not written to plugin state");
});

/** Loads the fixture surface's handlers through the composition and returns a dispatcher for it. */
async function surfaceDispatch(composition: AcmeComposition, context: Readonly<Record<string, unknown>> = {}) {
  const fullContext = { workspaceId: WORKSPACE, principalId: "admin-1", pluginId: PLUGIN, surfaceId: "account", ...context };
  await composition.adminSurfaceHost.bootstrapData({ context: fullContext });
  const [surface] = (await loadContributions({ workspaceId: WORKSPACE, definition: defineAdminSurfaceContribution({ filename: ADMIN_SURFACES_FILENAME }) })).items;
  const dispatcher = createAdminSurfaceActionDispatcher({ descriptor: surface!.descriptor, handlers: composition.adminSurfaceHost.handlersFor({ pluginId: PLUGIN, surfaceId: "account" }) });
  return (action: string) => dispatcher.dispatch({ action, payload: {}, context: fullContext });
}

// Jini withholds a result naming an issued token as its generic `action-failed`, never the result itself.
const WITHHELD = { ok: false, error: { code: "action-failed", message: "The action failed. Try again; if it keeps failing, check the server log.", retryable: true } };

test("security: one token memory across seams: a token a TOOL obtained is withheld from a surface answer", async () => {
  const composition = await compose();
  const connectionRef = await connectForRef(composition);
  const registry = createToolRegistry({});
  await registerAgentPluginExecutableTools({ withExtensionApprovalPolicy, registry, workspaceId: WORKSPACE, host: composition.agentPluginTools, authorize: allowAll, isActive: async () => true, applyApproval: ({ registration }) => registration });
  assert.equal((await createToolExecutor({ registry }).execute({ toolId: "p_acme_office__whoami", principal: { id: "admin-1" }, run: { id: "run-1" }, input: { connectionRef } })).status, "completed");
  const answer = await (await surfaceDispatch(composition))("tool-token");
  assert.deepEqual(answer, WITHHELD);
  assert.ok(!JSON.stringify(answer).includes(accessToken));
});

test("security: one token memory across seams: a token a SURFACE handler obtained is withheld from a tool's output", async () => {
  const composition = await compose();
  await connectForRef(composition);
  assert.deepEqual(await (await surfaceDispatch(composition))("whoami"), { ok: true, result: { name: "Ada" } });
  const registry = createToolRegistry({});
  await registerAgentPluginExecutableTools({ withExtensionApprovalPolicy, registry, workspaceId: WORKSPACE, host: composition.agentPluginTools, authorize: allowAll, isActive: async () => true, applyApproval: ({ registration }) => registration });
  const leaked = await createToolExecutor({ registry }).execute({ toolId: "p_acme_office__last_token", principal: { id: "admin-1" }, run: { id: "run-2" }, input: {} });
  assert.notEqual(leaked.status, "completed");
  assert.match(String(leaked.error), new RegExp(WITHHELD_OUTPUT_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(!JSON.stringify(leaked).includes(accessToken));
});

test("security: surface handlers get the host kind from the runtime the API connections use, never from the caller's context", async () => {
  const desktop = await compose({ ELECTRON_RUN_AS_NODE: "1", TOVU_ACME_OFFICE_OAUTH_DESKTOP_CLIENT_ID: "acme-desktop-client" });
  assert.deepEqual(await (await surfaceDispatch(desktop, { hostKind: "hosted" }))("host-kind"), { ok: true, result: { name: "desktop" } });
  assert.deepEqual(await (await surfaceDispatch(await compose(), { hostKind: "desktop" }))("host-kind"), { ok: true, result: { name: "hosted" } });
});

test("security: desktop admits only its plaintext loopback redirect, and completes the sign-in itself", async () => {
  const composition = await compose({ ELECTRON_RUN_AS_NODE: "1", TOVU_ACME_OFFICE_OAUTH_DESKTOP_CLIENT_ID: "acme-desktop-client" });
  const { host } = composition.apiConnections;
  assert.equal(host.runtime, "desktop");
  const [connection] = await host.listConnections({ pluginId: PLUGIN });
  let redirectUri = "";
  const connected = await runApiConnectionConnect({
    deps: composition.apiConnections, connection, actorId: "admin-1", signal: new AbortController().signal, pollIntervalMs: 5, waitTimeoutMs: 5_000,
    showSignIn: async ({ signInUrl }) => {
      redirectUri = new URL(signInUrl).searchParams.get("redirect_uri") ?? "";
      await followConsent(signInUrl);
    },
  });
  assert.equal(connected.status, "connected");
  assert.match(redirectUri, /^http:\/\/127\.0\.0\.1:\d+\//);
  const hosted = await compose({ TOVU_ACME_OFFICE_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OFFICE_OAUTH_WEB_CLIENT_SECRET: "s".repeat(24) });
  const service = hosted.apiConnections.host.serviceFor({ connection, redirectUri });
  await assert.rejects(service.start({ workspaceId: WORKSPACE, actorId: "admin-1", intent: "connect", scopeSetIds: [], redirectUri }), { message: /must use https/ });
});

/** The form-destination kit: the fake provider's API host goes to the local server; anything else throws. */
const formKit: FormDestinationKit = {
  async fetch(url, init) {
    const target = new URL(url);
    if (target.hostname !== "api.acme.test") throw new Error(`unexpected outbound host ${target.hostname}`);
    return fetch(`${providerOrigin}${target.pathname}`, init);
  },
  timeouts: {},
};

test("vendor neutrality end to end: a second provider plugin connects, stores sealed tokens, runs a confirmed write tool, a surface action and a push form delivery", async () => {
  appended.length = 0;
  const composition = await compose();
  const connectionRef = await connectForRef(composition);
  const stored = await composition.vaultRepo.list({ workspaceId: WORKSPACE, kind: "api-connection", ownerKey: "tovu", principalId: null });
  assert.ok(stored.some((row) => row.sealed !== null), "the token set is in the vault, sealed");
  assert.ok(!JSON.stringify(stored).includes(accessToken) && !JSON.stringify(stored).includes(refreshToken), "no plaintext token in any vault row");

  // A write tool asks first, through Tovu's own approval owner, and names the account and table.
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) };
  const registry = createToolRegistry({});
  const { refusals } = await registerAgentPluginExecutableTools({ withExtensionApprovalPolicy,
    registry, workspaceId: WORKSPACE, host: composition.agentPluginTools, authorize: allowAll, isActive: async () => true,
    applyApproval: ({ registration }, { disclose }) => applyToolApprovalPolicy({ registration, surfaces }, { disclose }),
  });
  assert.deepEqual(refusals, []);
  const call = await startConfirmingCall({ executor: createToolExecutor({ registry }), surfaces }, "p_acme_office__append_row", { connectionRef, table: "Leads", values: ["Ada"] });
  assert.deepEqual(call.rows, [["Connection ref", connectionRef], ["Table", "Leads"], ["Values", "Ada"], ["Account", "Ada"], ["Affects", "table Leads"]]);
  assert.equal(appended.length, 0, "nothing is written before the human confirms");
  call.answer("confirm");
  const written = await call.pending;
  assert.equal(written.status, "completed", String(written.error));
  assert.deepEqual(written.output, { appended: 1 });
  assert.deepEqual(appended.splice(0), [{ table: "Leads", idempotencyKey: undefined, body: { values: ["Ada"] } }]);

  const context = { workspaceId: WORKSPACE, principalId: "admin-1", pluginId: PLUGIN, surfaceId: "account" };
  await composition.adminSurfaceHost.bootstrapData({ context });
  const [surface] = (await loadContributions({ workspaceId: WORKSPACE, definition: defineAdminSurfaceContribution({ filename: ADMIN_SURFACES_FILENAME }) })).items;
  const dispatcher = createAdminSurfaceActionDispatcher({ descriptor: surface!.descriptor, handlers: composition.adminSurfaceHost.handlersFor({ pluginId: PLUGIN, surfaceId: "account" }) });
  assert.deepEqual(await dispatcher.dispatch({ action: "whoami", payload: {}, context }), { ok: true, result: { name: "Ada" } });

  // Push form delivery: the binding stores only the connectionRef; the OAuth port resolves the token per attempt.
  const destinations = await loadFormDestinationRegistry({ workspaceId: WORKSPACE }, { loadContributions });
  assert.deepEqual(destinations.refusals, []);
  const destination = destinations.get("acme-office-rows");
  const credentialFor = createOAuthFormDeliveryConnectionPort({
    hostFor: ({ workspaceId }) => (workspaceId === WORKSPACE ? composition.apiConnections.host : null),
    adapterPluginId: async ({ adapterId }) => destinations.get(adapterId)?.pluginId ?? null,
  });
  // The binding freezes the account it was set up with (`config.accountId`), as every OAuth binding must.
  const binding = { bindingId: "binding-1", adapterId: "acme-office-rows", connectionRef, enabled: true, config: { table: "Signups", accountId: "acct-1" } };
  const credential = await credentialFor({ workspaceId: WORKSPACE, connectionRef: binding.connectionRef, adapterId: binding.adapterId }, { binding });
  assert.ok(credential, "the plugin's own connectionRef yields a credential");
  // The frozen job per the forms-multidest contract; Tovu's FormDestinationModule type gains
  // `binding`/`idempotencyKey` and the result type with that contract's adapter ABI (F4), so the
  // call passes a non-literal object.
  const job = {
    binding, idempotencyKey: JSON.stringify(["submission-1", "binding-1"]),
    snapshot: { form: { slug: "signup", fields: [{ name: "email", required: true, label: "Email" }] }, submission: { id: "submission-1", answers: { email: "ada@example.test" }, submittedAt: "2026-10-20T08:00:00.000Z" } },
  };
  const deliverInput = { kit: formKit, credential, ...job.snapshot, binding: job.binding, idempotencyKey: job.idempotencyKey };
  assert.deepEqual(await destination!.module.deliver!(deliverInput), { ok: true });
  assert.deepEqual(appended, [{
    table: "Signups", idempotencyKey: job.idempotencyKey,
    body: { values: { _submission_id: "submission-1", submitted_at: "2026-10-20T08:00:00.000Z", Email: "ada@example.test" } },
  }]);
  assert.ok(!JSON.stringify([written, call.html]).includes(accessToken), "no token in the tool result or the confirmation card");
});

test("security: the composition gives the assistant's tool registrar and the admin screen's connections ONE frozen-account map, so an admin action the assistant runs is pinned", async () => {
  const composition = await compose();
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) };
  const registry = createToolRegistry({});
  const registered = await registerAgentPluginExecutableTools({ withExtensionApprovalPolicy,
    registry, workspaceId: WORKSPACE, host: composition.agentPluginTools, authorize: allowAll, isActive: async () => true,
    applyApproval: ({ registration }, { disclose }) => applyToolApprovalPolicy({ registration, surfaces }, { disclose }),
  });
  try {
    await composition.adminSurfaceHost.bootstrapData({ context: { workspaceId: WORKSPACE, principalId: "admin-1", pluginId: PLUGIN, surfaceId: "account" } });
    const f = { executor: createToolExecutor({ registry }), surfaces };
    // Approved while the account was not connected: the card froze no account for this call.
    const call = await startConfirmingCall(f, "p_acme_office__account_whoami", { payload: {} });
    assert.deepEqual(call.rows.filter(([label]) => label === "Account"), []);
    await connectForRef(composition);
    call.answer("confirm");
    const refused = await call.pending;
    // The registrar froze this call's accounts in the map the screen's connections port reads, so the
    // account connected while the card waited gets no token. A second map would see an unfrozen call.
    assert.deepEqual((refused.output as { ok?: boolean } | undefined)?.ok, false, JSON.stringify(refused));
    // Approved with the account shown: the same action gets its token.
    const shown = await startConfirmingCall(f, "p_acme_office__account_whoami", { payload: {} });
    assert.deepEqual(shown.rows.filter(([label]) => label === "Account"), [["Account", "Ada"]]);
    shown.answer("confirm");
    assert.deepEqual((await shown.pending).output, { ok: true, result: { name: "Ada" } });
  } finally { registered.dispose(); }
});
