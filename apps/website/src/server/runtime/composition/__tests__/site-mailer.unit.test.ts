import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTempSiteLayoutFixture } from '#src/__tests__/fixtures/site-layout-context';
import type { ChatDeleteSurfaceDeps } from '#src/contracts/core/chat-delete-grant';
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemorySettingsRepo, type SettingsRepoPort } from "@jini-ai/core/settings";
import type { MailCapturePort, MailSendLedgerPort, MailProviderSetting } from "@jini-ai/platform/mail";
import type { MailAdapterRegistry } from "@jini-ai/agent-plugins/lifecycle/mail";
import type { SetAgentPluginEnabledInput } from "@jini-ai/core/contracts/headless/plugin-host";

import { createSettingsPrincipalLookup, set } from "#src/features/settings/index";
import { ensureMailProviderSettings, readMailProviderSetting, writeMailProviderSetting } from "@jini-ai/cms/settings/site/mail-provider";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.env";
import { createSiteMailer, type SiteMailerRequired } from "../site-mailer.js";
import { SETTINGS_WRITE_POLICIES } from "#src/features/settings/settings-write-policies";

/**
 * @file `createSiteMailer` composes the settings-backed provider port (waiting for the definitions),
 * the first-boot system write, the delivery policy with the site's test mode, and the sender read.
 */

const WS = "ws-site-mailer";
const MESSAGE = { workspaceId: WS, to: { email: "reader@example.com" }, from: { email: "news@example.com" }, subject: "hi", text: "hi" };
const OPTIONS = { idempotencyKey: "k1", workspaceId: WS, sourceContext: { module: "forms" } };

function ledger(): MailSendLedgerPort & { reserved: string[] } {
  const reserved: string[] = [];
  return { reserved, reserve: async ({ recipient }) => { reserved.push(recipient); return { status: "reserved" }; }, mark: async () => {} };
}

async function rig(optional: { capture?: MailCapturePort; testMode?: unknown } = {}) {
  const clock = { nowIso: () => "2026-10-21T00:00:00.000Z", nowMs: () => 0 };
  let n = 0;
  const ids = { newId: () => `id-${++n}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  let release: () => void = () => {};
  const settingsReady = new Promise<void>((done) => { release = done; }).then(() => ensureMailProviderSettings({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" }));
  const sendLedger = ledger();
  const lines: string[] = [];
  const keyring = new InMemoryKeyring();
  const required: SiteMailerRequired = {
    resolve: {
      workspaceId: WS, mode: "local", customCredentialRepo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer({ keyring }),
      httpClient: { send: async () => { throw new Error("unused"); } }, loadMailAdapters: async () => ({ list: () => [], refusals: [] }), log: (line) => lines.push(line),
    },
    settings: { repo: settingsRepo, deps: { clock, ids, principals }, systemPrincipalId: "system", authorize: async ({ principalId }) => ({ allowed: principalId === "owner", reason: principalId === "owner" ? "grant" : "no_grant" }) },
    settingsReady,
    delivery: { ledger: sendLedger, suppression: { isSuppressed: async () => false, suppress: async () => {} }, ...(optional.capture ? { capture: optional.capture } : {}) },
    readSenderEmail: async () => "news@example.com",
  };
  return { required, release, settingsRepo, sendLedger, lines, keyring };
}

test("reads wait for the settings definitions, then the first boot writes unconfigured as the system principal", async () => {
  const { required, release, settingsRepo, sendLedger, lines } = await rig();
  const resolved = createSiteMailer(required);
  let settled = false;
  void resolved.ready.then(() => { settled = true; });
  await new Promise((done) => setImmediate(done));
  assert.equal(settled, false, "nothing resolves before the definitions are registered");
  release();
  await resolved.ready;
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: null, bulk: null });
  // Local mode: the unconfigured lane logs through the console provider, behind the delivery policy.
  assert.equal((await resolved.mailer.send(MESSAGE, OPTIONS)).ok, true);
  assert.deepEqual(sendLedger.reserved, ["reader@example.com"]);
  assert.match(lines[0]!, /\[mail:console\]/);
  const status = await resolved.status();
  assert.deepEqual(status.warnings, []);
  assert.equal(status.state, "unconfigured");
});

test("the site's test mode is applied through the capture store", async () => {
  const captured: string[] = [];
  const { required, release, settingsRepo } = await rig({ capture: { capture: async ({ message }) => { captured.push(message.to.email); return { id: "c1" }; } } });
  release();
  await required.settingsReady;
  await set({ deps: { ...required.settings.deps, repo: settingsRepo, authorize: async () => ({ allowed: true, reason: "test" }) }, input: {
    namespace: "core.mail", key: "testMode", scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value: { mode: "capture" },
  } });
  const result = await createSiteMailer(required).mailer.send(MESSAGE, OPTIONS);
  assert.equal(result.ok && result.providerMessageId, "captured:c1");
  assert.deepEqual(captured, ["reader@example.com"]);
});

test("selectProvider writes both lanes as the calling principal, through its own authorization", async () => {
  const { required, release, settingsRepo } = await rig();
  release();
  const mailer = createSiteMailer(required);
  await mailer.selectProvider({ id: "smtp", principalId: "owner" });
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: "smtp", bulk: "smtp" });
  await assert.rejects(mailer.selectProvider({ id: "console", principalId: "intruder" }));
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: "smtp", bulk: "smtp" });
});

test("a successful switch drops the cached status at once; a refused one leaves it cached", async () => {
  const { required, release } = await rig();
  release();
  const mailer = createSiteMailer(required);
  const before = await mailer.status();
  assert.equal(before.lanes[0]!.providerId, null);
  await assert.rejects(mailer.selectProvider({ id: "console", principalId: "intruder" }));
  assert.equal(await mailer.status(), before, "a failed write keeps the cached report");
  await mailer.selectProvider({ id: "smtp", principalId: "owner" });
  assert.equal((await mailer.status()).lanes[0]!.providerId, "smtp", "no TTL wait after a switch");
});

test("production mail bindings share provider/credential/settings/sender/test-mode and readiness owners", async () => {
  const { createCustomCredential } = await import("#src/features/custom-credentials/index");
  const { planMailTestSend, runMailTestSend } = await import("@jini-ai/platform/mail/test-send");
  const { readMailUseReadiness } = await import("@jini-ai/platform/mail/use-readiness");
  const { required, release, settingsRepo, keyring } = await rig({ capture: { capture: async () => ({ id: "bound" }) } });
  const actualDestinations: string[] = [];
  required.resolve.mode = "production";
  required.resolve.loadMailAdapters = async () => ({ refusals: [], list: () => [{ pluginId: "p", descriptor: { schemaVersion: 2, id: "fake", label: "Fake", module: "a.mjs", credentialLabel: "Fake key", credentialKeys: ["token"], feedback: false }, module: {
    id: "fake", capabilities: { hosted: true, feedback: false, domainVerification: true }, credentialKeys: ["token"],
    domainStatus: async () => ({ status: "ok", value: { domain: "example.com", state: "verified" } }), domainRequirements: async () => ({ status: "ok", value: { purpose: "mail", domain: "example.com", providerId: "fake", records: [] } }),
    create: () => ({ capabilities: () => ({ driver: "fake", supportsAttachments: true, supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1 }), send: async (message: typeof MESSAGE) => { actualDestinations.push(message.to.email); return { ok: true, providerMessageId: "m1", acceptedAt: "2026-10-22T00:00:00Z" }; }, sendBatch: async () => [] }),
  } as never }] });
  release(); await required.settingsReady;
  await createCustomCredential({ repo: required.resolve.customCredentialRepo, sealer: required.resolve.sealer, keyring, clock: required.settings.deps.clock, idGen: { newId: () => "cred" } }, { workspaceId: WS, label: "Fake key", category: "ops", baseUrl: "https://fake.example.com", connection: { token: "fake-token" } });
  const site = createSiteMailer(required, { durableOutboxReady: () => false });
  await site.selectProvider({ id: "fake", principalId: "owner" });
  const bindings = site.operations;
  assert.equal(await bindings.mailTestProvider!(), "fake");
  assert.equal((await site.describeProviders()).providers.find(p => p.id === "fake")!.credential.saved, true);
  assert.equal((await bindings.mailSenderDomainVerification()).state, "verified");
  assert.equal((await bindings.mailSenderIdentity!.resolve({ workspaceId: WS, fallback: { email: "no-reply@site.local" } })).email, "news@example.com");
  const deps = { workspaceId: WS, mailer: site.mailer, ...bindings };
  const plan = await planMailTestSend({ deps, principalId: "owner", to: "chosen@example.com" });
  const sent = await runMailTestSend({ deps, principalId: "owner", plan, ref: "bound-request" }); assert.equal(sent.outcome, "accepted");
  assert.deepEqual(actualDestinations, ["chosen@example.com"]);
  const readiness = await readMailUseReadiness({ ...deps, formDefinitionRepo: { list: async () => [{ notify: { enabled: true, recipients: ["chosen@example.com"] } }] as never } });
  assert.deepEqual(readiness.uses.map(row => [row.use, row.state]), [["sign_in", "ready"], ["form_notifications", "blocked"]]);
  await set({ deps: { ...required.settings.deps, repo: settingsRepo, authorize: async () => ({ allowed: true, reason: "test" }) }, input: { namespace: "core.mail", key: "testMode", scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value: { mode: "capture" } } });
  const capturePlan = await planMailTestSend({ deps, principalId: "owner", to: "other@example.com" });
  assert.equal((await runMailTestSend({ deps, principalId: "owner", plan: capturePlan, ref: "capture-request" })).outcome, "captured");
  assert.deepEqual(actualDestinations, ["chosen@example.com"]);
});

test("production binding settings and credential-store failures fail closed through public operations", async () => {
  const { planMailTestSend } = await import("@jini-ai/platform/mail/test-send");
  const { required, release } = await rig(); release(); await required.settingsReady;
  const base = required.settings.repo;
  required.settings.repo = Object.assign(Object.create(base), { findActiveDefinition: async () => { throw new Error("settings unavailable"); } });
  const site = createSiteMailer(required);
  await assert.rejects(planMailTestSend({ deps: { workspaceId: WS, mailer: site.mailer, ...site.operations }, principalId: "owner", to: "x@example.com" }), /settings unavailable/);
  const another = await rig(); another.release(); await another.required.settingsReady;
  another.required.resolve.customCredentialRepo = Object.assign(Object.create(another.required.resolve.customCredentialRepo), { listByWorkspace: async () => { throw new Error("store unavailable"); } });
  await assert.rejects(createSiteMailer(another.required).describeProviders(), /store unavailable/);
});

const PLUGIN_TOGGLE: SetAgentPluginEnabledInput = {
  workspaceId: WS, pluginId: "mail-package", enabled: false, actor: "owner",
  agentPluginLayout: { root: "unused", workspacesDir: "unused", forWorkspace: () => { throw new Error("the injected toggle owns activation"); } },
};

/** Provider ids deliberately differ from their owning plugin's id. */
function mailAdapters(): ReturnType<MailAdapterRegistry["list"]> {
  return [["mail-package", "first_adapter"], ["mail-package", "second_adapter"], ["other-package", "other_adapter"], ["mail-package", "smtp"], ["mail-package", "console"]].map(([pluginId, id]) => ({
    pluginId: pluginId!, descriptor: { id: id!, label: id!, module: "a.mjs", credentialLabel: `${id} key` },
    module: { create: () => { throw new Error("no credential is saved"); } },
  }));
}

for (const [before, expected] of [
  [{ transactional: "first_adapter", bulk: "second_adapter" }, { transactional: null, bulk: null }],
  [{ transactional: "first_adapter", bulk: "other_adapter" }, { transactional: null, bulk: "other_adapter" }],
  [{ transactional: "smtp", bulk: "second_adapter" }, { transactional: "smtp", bulk: null }],
  [{ transactional: "console", bulk: "other_adapter" }, { transactional: "console", bulk: "other_adapter" }],
  [{ transactional: "smtp", bulk: "console" }, { transactional: "smtp", bulk: "console" }],
  [{ transactional: null, bulk: null }, { transactional: null, bulk: null }],
] satisfies [MailProviderSetting, MailProviderSetting][]) {
  test(`disable clears only owned selections and is idempotent: ${JSON.stringify(before)}`, async () => {
    const { required, release, settingsRepo } = await rig();
    release(); await required.settingsReady;
    await writeMailProviderSetting({ writePolicies: SETTINGS_WRITE_POLICIES, deps: { ...required.settings.deps, repo: settingsRepo, authorize: required.settings.authorize }, workspaceId: WS, callerPrincipalId: "owner", value: before });
    let active = true;
    required.resolve.loadMailAdapters = async () => ({ refusals: [], list: () => mailAdapters().filter(adapter => active || adapter.pluginId !== PLUGIN_TOGGLE.pluginId) });
    const calls: SetAgentPluginEnabledInput[] = [];
    let writes = 0;
    required.settings.authorize = async () => { writes++; return { allowed: true, reason: "test" }; };
    const site = createSiteMailer(required, { setAgentPluginEnabled: async (input) => {
      calls.push(input); active = input.enabled;
      return { pluginId: input.pluginId, enabled: input.enabled, warnings: [] };
    } });
    await site.ready;
    await site.status();
    await site.setAgentPluginEnabled(PLUGIN_TOGGLE);
    assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), expected);
    assert.equal(writes, JSON.stringify(before) === JSON.stringify(expected) ? 0 : 1);
    const writesAfterDisable = writes;
    await site.setAgentPluginEnabled(PLUGIN_TOGGLE);
    assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), expected);
    assert.equal(writes, writesAfterDisable, "repeat disable adds no settings write");
    assert.deepEqual(calls, [PLUGIN_TOGGLE, PLUGIN_TOGGLE]);
    assert.deepEqual((await site.status()).lanes.map(lane => lane.providerId), [expected.transactional, expected.bulk]);
  });
}

test("enabling or a rejected disable leaves lane selections untouched", async () => {
  const { required, release, settingsRepo } = await rig(); release(); await required.settingsReady;
  const before = { transactional: "first_adapter", bulk: "second_adapter" };
  await writeMailProviderSetting({ writePolicies: SETTINGS_WRITE_POLICIES, deps: { ...required.settings.deps, repo: settingsRepo, authorize: required.settings.authorize }, workspaceId: WS, callerPrincipalId: "owner", value: before });
  required.resolve.loadMailAdapters = async () => ({ refusals: [], list: mailAdapters });
  const site = createSiteMailer(required, { setAgentPluginEnabled: async (input) => {
    if (!input.enabled) throw new Error("activation refused");
    return { pluginId: input.pluginId, enabled: true, warnings: [] };
  } });
  await site.ready;
  await site.setAgentPluginEnabled({ ...PLUGIN_TOGGLE, enabled: true });
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), before);
  await assert.rejects(site.setAgentPluginEnabled(PLUGIN_TOGGLE), /activation refused/);
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), before);
});

for (const mode of ["local", "production"] as const) {
  test(`disable returns mail to the existing unconfigured policy in ${mode}`, async () => {
    const { required, release, lines } = await rig(); release(); await required.settingsReady;
    required.resolve.mode = mode;
    let active = true;
    required.resolve.loadMailAdapters = async () => ({ refusals: [], list: () => active ? mailAdapters() : [] });
    const site = createSiteMailer(required, { setAgentPluginEnabled: async (input) => {
      active = input.enabled;
      return { pluginId: input.pluginId, enabled: input.enabled, warnings: [] };
    } });
    await site.ready;
    await site.selectProvider({ id: "first_adapter", principalId: "owner" });
    await site.status();
    await site.setAgentPluginEnabled(PLUGIN_TOGGLE);
    assert.equal((await site.status()).state, "unconfigured");
    const result = await site.mailer.send(MESSAGE, OPTIONS);
    if (mode === "local") {
      assert.equal(result.ok, true);
      assert.match(lines.at(-1)!, /\[mail:console\]/);
    } else {
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.errorCode, "MAIL_UNCONFIGURED");
    }
  });
}


test("provider selection snapshot binds the approved revision, including an intervening same-value write", async () => {
  const { required, release, settingsRepo } = await rig(); release();
  const mailer = createSiteMailer(required);
  await mailer.selectProvider({ id: "smtp", principalId: "owner" });
  const snapshot = await mailer.readProviderSelection();
  assert.deepEqual(snapshot.setting, { transactional: "smtp", bulk: "smtp" });
  assert.ok(snapshot.revisionSeq > 0);
  await mailer.selectProvider({ id: "smtp", principalId: "owner" });
  await assert.rejects(mailer.selectProvider({ id: "different", principalId: "owner", expectedRevisionSeq: snapshot.revisionSeq }), /Setting revision changed/);
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), snapshot.setting);
  const current = await mailer.readProviderSelection();
  assert.ok(current.revisionSeq > snapshot.revisionSeq);
  await mailer.selectProvider({ id: "different", principalId: "owner", expectedRevisionSeq: current.revisionSeq });
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: "different", bulk: "different" });
});


test("mail provider access card refuses an intervening selection at the real settings writer", async () => {
  const { createSurfaceExchangeStore } = await import("@jini-ai/daemon/surface-exchanges");
  const { buildMailStatusRegistrations } = await import("#src/features/mail-status/tool-registrations");
  const { required, release, settingsRepo } = await rig(); release();
  const mailer = createSiteMailer(required);
  await mailer.selectProvider({ id: "old", principalId: "owner" });
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: { schedule: () => () => {} }, clock: { nowMs: () => 1 },
    idGenerator: { newId: () => "mail-card" }, defaultChannel: "mcp-ui" });
  const surfaces: ChatDeleteSurfaceDeps = { surfaceExchanges, assertAccessApprover: async () => {} };
  const registration = buildMailStatusRegistrations({ workspaceId: WS, mailer: mailer.mailer,
    authorize: async () => ({ allowed: true, reason: "fixture" }),
    mailProviderControl: { check: async () => ({ ok: true, label: "Requested" }), select: mailer.selectProvider, readSelection: mailer.readProviderSelection },
  }, surfaces).find(r => r.descriptor.id === "mail_set_provider")!;
  await assert.rejects(registration.handler({ executionId: "mail-test", principal: { id: "owner" }, run: { id: "run" }, input: { providerId: "requested" }, signal: new AbortController().signal }, {
    emitSurface: async () => {
      assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: "old", bulk: "old" });
      await mailer.selectProvider({ id: "concurrent", principalId: "owner" });
      assert.equal(surfaceExchanges.deliver({ exchangeId: "mail-card", principalId: "owner", params: { decision: "confirm" } }, { toolId: "mail_set_provider" }).ok, true);
    },
  }), /mail provider selection changed while this card was open/);
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: "concurrent", bulk: "concurrent" });
  assert.equal(surfaceExchanges.size(), 0);
});


test("disable cleanup preserves a concurrent provider selection without overwriting its lanes", async () => {
  const { required, release, settingsRepo } = await rig(); release(); await required.settingsReady;
  const deps = { ...required.settings.deps, repo: settingsRepo, authorize: required.settings.authorize };
  await writeMailProviderSetting({ writePolicies: SETTINGS_WRITE_POLICIES, deps, workspaceId: WS, callerPrincipalId: "owner", value: { transactional: "first_adapter", bulk: "other_adapter" } });
  required.resolve.loadMailAdapters = async () => ({ refusals: [], list: mailAdapters });
  const site = createSiteMailer(required, { setAgentPluginEnabled: async input => ({ pluginId: input.pluginId, enabled: input.enabled, warnings: [] }) });
  await site.ready;
  let changed = false;
  required.settings.authorize = async () => {
    if (!changed) {
      changed = true;
      await writeMailProviderSetting({ writePolicies: SETTINGS_WRITE_POLICIES, deps, workspaceId: WS, callerPrincipalId: "owner", value: { transactional: "new_provider", bulk: "new_provider" } });
    }
    return { allowed: true, reason: "test" };
  };
  assert.deepEqual(await site.setAgentPluginEnabled(PLUGIN_TOGGLE), { pluginId: "mail-package", enabled: false, warnings: [] });
  assert.equal(changed, true, "the other writer runs after the cleanup snapshot");
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: "new_provider", bulk: "new_provider" });
});

for (const takeover of [false, true]) test(`disable retries selective cleanup and preserves ${takeover ? "a new owner of the same provider id" : "the other writer's lane"}`, async () => {
  const { required, release, settingsRepo } = await rig(); release(); await required.settingsReady;
  const deps = { ...required.settings.deps, repo: settingsRepo, authorize: required.settings.authorize };
  await writeMailProviderSetting({ writePolicies: SETTINGS_WRITE_POLICIES, deps, workspaceId: WS, callerPrincipalId: "owner", value: { transactional: "first_adapter", bulk: "other_adapter" } });
  let active = true;
  required.resolve.loadMailAdapters = async () => ({ refusals: [], list: () => active ? mailAdapters() : [] });
  const site = createSiteMailer(required, { setAgentPluginEnabled: async input => {
    active = input.enabled;
    return { pluginId: input.pluginId, enabled: active, warnings: [] };
  } });
  await site.ready;
  let changed = false;
  required.settings.authorize = async () => {
    if (!changed) {
      changed = true;
      if (takeover) required.resolve.loadMailAdapters = async () => ({ refusals: [], list: () => mailAdapters().filter(adapter => adapter.pluginId === 'other-package').map(adapter => ({ ...adapter, descriptor: { ...adapter.descriptor, id: 'first_adapter' } })) });
      await writeMailProviderSetting({ writePolicies: SETTINGS_WRITE_POLICIES, deps, workspaceId: WS, callerPrincipalId: "owner", value: { transactional: "first_adapter", bulk: "new_provider" } });
    }
    return { allowed: true, reason: "test" };
  };
  assert.deepEqual(await site.setAgentPluginEnabled(PLUGIN_TOGGLE), { pluginId: "mail-package", enabled: false, warnings: [] });
  assert.equal(active, false);
  assert.equal(changed, true);
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: takeover ? "first_adapter" : null, bulk: "new_provider" });
});

test("a disable retry clears missing owned adapters and preserves a newer live provider with the same id", async () => {
  const { required, release, settingsRepo } = await rig(); release(); await required.settingsReady;
  const deps = { ...required.settings.deps, repo: settingsRepo, authorize: required.settings.authorize };
  const before = { transactional: "first_adapter", bulk: "second_adapter" };
  await writeMailProviderSetting({ writePolicies: SETTINGS_WRITE_POLICIES, deps, workspaceId: WS, callerPrincipalId: "owner", value: before });
  let active = true;
  required.resolve.loadMailAdapters = async () => ({ refusals: [], list: () => active ? mailAdapters() : [] });
  const site = createSiteMailer(required, { setAgentPluginEnabled: async input => {
    active = input.enabled;
    return { pluginId: input.pluginId, enabled: active, warnings: [] };
  } });
  await site.ready;
  let conflict = true;
  required.settings.authorize = async () => {
    if (conflict) await writeMailProviderSetting({ writePolicies: SETTINGS_WRITE_POLICIES, deps, workspaceId: WS, callerPrincipalId: "owner", value: before });
    return { allowed: true, reason: "test" };
  };
  await assert.rejects(site.setAgentPluginEnabled(PLUGIN_TOGGLE), /Setting revision changed/);
  assert.equal(active, false);
  conflict = false;
  required.resolve.loadMailAdapters = async () => ({ refusals: [], list: () => mailAdapters().filter(adapter => adapter.pluginId === 'other-package').map(adapter => ({ ...adapter, descriptor: { ...adapter.descriptor, id: 'first_adapter' } })) });
  await site.setAgentPluginEnabled(PLUGIN_TOGGLE);
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: "first_adapter", bulk: null });
});


test("disable cleanup recovers an inactive plugin's provider ownership after a fresh mailer boot and preserves a newer active owner", async t => {
  const fixture = createTempSiteLayoutFixture({}); t.after(fixture.cleanup);
  const layout = fixture.deps.agentPluginLayout;
  const workspace = layout.forWorkspace({ workspaceId: WS });
  const digest = 'a'.repeat(64);
  const pluginDir = path.join(workspace.pluginPackagesDir({ pluginId: PLUGIN_TOGGLE.pluginId }), digest);
  await mkdir(pluginDir, { recursive: true });
  await writeFile(path.join(pluginDir, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: PLUGIN_TOGGLE.pluginId, version: '1.0.0', extensions: { tovu: { id: 'test/mail-package' } } }));
  await writeFile(path.join(pluginDir, 'jini-mail-adapters.json'), JSON.stringify({ schemaVersion: 1, adapters: [{ id: 'firstadapter', label: 'Mail', module: 'mail.mjs', credentialLabel: 'Mail key' }, { id: 'sharedid', label: 'Shared', module: 'mail.mjs', credentialLabel: 'Shared key' }] }));
  await writeFile(path.join(workspace.root, 'bundled-digests.json'), JSON.stringify({ schemaVersion: 1, plugins: { [PLUGIN_TOGGLE.pluginId]: { archiveDigest: digest } } }));
  await writeFile(path.join(workspace.root, 'activations.json'), JSON.stringify({ schemaVersion: 1, plugins: { [PLUGIN_TOGGLE.pluginId]: { enabled: false, origin: 'bundled', updatedAt: '2026-10-21T00:00:00Z', updatedBy: 'owner' } } }));
  const { required, release, settingsRepo } = await rig(); release(); await required.settingsReady;
  await writeMailProviderSetting({ writePolicies: SETTINGS_WRITE_POLICIES, deps: { ...required.settings.deps, repo: settingsRepo, authorize: required.settings.authorize }, workspaceId: WS, callerPrincipalId: 'owner', value: { transactional: 'firstadapter', bulk: 'sharedid' } });
  required.resolve.loadMailAdapters = async () => ({ refusals: [], list: () => mailAdapters().filter(adapter => adapter.pluginId === 'other-package').map(adapter => ({ ...adapter, descriptor: { ...adapter.descriptor, id: 'sharedid' } })) });
  const site = createSiteMailer(required, { setAgentPluginEnabled: async input => ({ pluginId: input.pluginId, enabled: input.enabled, warnings: [] }) });
  await site.ready;
  await site.setAgentPluginEnabled({ ...PLUGIN_TOGGLE, agentPluginLayout: layout });
  assert.deepEqual(await readMailProviderSetting({ settingsRepo, workspaceId: WS }), { transactional: null, bulk: 'sharedid' });
});

/** The Email page's "Send test" path: the route's purpose-gated site mailer, the real wrapper and the real plan. */
async function testSendRig(optional: { mode: "local" | "production"; select: string | null; keySaved?: boolean; testMode?: { mode: "redirect"; to: string } | { mode: "capture" }; wrapRepo?: (repo: SettingsRepoPort) => SettingsRepoPort }) {
  const { createCustomCredential } = await import("#src/features/custom-credentials/index");
  const { wrapPositionalMailerWithPurposeGate } = await import("@jini-ai/platform/mail");
  const { required, release, settingsRepo, keyring } = await rig({ capture: { capture: async () => ({ id: "kept" }) } });
  const destinations: string[] = [];
  required.resolve.mode = optional.mode;
  required.resolve.loadMailAdapters = async () => ({ refusals: [], list: () => [{ pluginId: "p", descriptor: { schemaVersion: 2, id: "fake", label: "Fake", module: "a.mjs", credentialLabel: "Fake key", credentialKeys: ["token"], feedback: false }, module: {
    id: "fake", capabilities: { hosted: true, feedback: false, domainVerification: false }, credentialKeys: ["token"],
    create: () => ({ capabilities: () => ({ driver: "fake-driver", supportsAttachments: true, supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1 }), send: async (message: typeof MESSAGE) => { destinations.push(message.to.email); return { ok: true, providerMessageId: "m1", acceptedAt: "2026-10-22T00:00:00Z" }; }, sendBatch: async () => [] }),
  } as never }] });
  release(); await required.settingsReady;
  if (optional.keySaved !== false) await createCustomCredential({ repo: required.resolve.customCredentialRepo, sealer: required.resolve.sealer, keyring, clock: required.settings.deps.clock, idGen: { newId: () => "cred" } }, { workspaceId: WS, label: "Fake key", category: "ops", baseUrl: "https://fake.example.com", connection: { token: "fake-token" } });
  if (optional.wrapRepo) required.settings.repo = optional.wrapRepo(required.settings.repo);
  const site = createSiteMailer(required, { durableOutboxReady: () => false });
  if (optional.select !== null) await site.selectProvider({ id: optional.select, principalId: "owner" });
  const setTestMode = (value: { mode: "redirect"; to: string } | { mode: "capture" }) => set({ deps: { ...required.settings.deps, repo: settingsRepo, authorize: async () => ({ allowed: true, reason: "test" }) }, input: { namespace: "core.mail", key: "testMode", scope: "workspace", workspaceId: WS, callerPrincipalId: "owner", value } });
  if (optional.testMode) await setTestMode(optional.testMode);
  const mailer = wrapPositionalMailerWithPurposeGate({ inner: site.mailer, mode: optional.mode, durableOutboxReady: () => false });
  return { site, destinations, setTestMode, deps: { workspaceId: WS, mailer, ...site.operations } };
}

for (const scenario of [
  { name: "a configured provider", mode: "production", select: "fake", sends: ["owner@example.com"] },
  { name: "a configured provider with a redirect test mode", mode: "production", select: "fake", testMode: { mode: "redirect", to: "qa@example.com" } as const, sends: ["qa@example.com"] },
  { name: "the local console fallback while no provider is chosen", mode: "local", select: null, sends: [] },
  { name: "the console provider chosen on purpose", mode: "local", select: "console", sends: [] },
  { name: "a chosen provider whose key is not saved yet (local mode prints to the console instead)", mode: "local", select: "fake", keySaved: false, sends: [] },
] as const) {
  test(`Send test is accepted by the delivery policy for ${scenario.name}`, async () => {
    const { planMailTestSend, runMailTestSend } = await import("@jini-ai/platform/mail/test-send");
    const { site, deps, destinations } = await testSendRig({ mode: scenario.mode, select: scenario.select, ...("keySaved" in scenario ? { keySaved: scenario.keySaved } : {}), ...("testMode" in scenario ? { testMode: scenario.testMode } : {}) });
    await site.ready;
    const owned = { ...deps, userRepo: { findByPrincipalId: async () => ({ principalId: "owner", workspaceId: WS, username: "owner", email: "owner@example.com", passwordHash: "x" }) } as never };
    const plan = await planMailTestSend({ deps: owned, principalId: "owner" });
    const result = await runMailTestSend({ deps: owned, principalId: "owner", plan, ref: "send-test-click" });
    assert.notEqual(result.outcome === "failed" && result.errorCode, "MAIL_TEST_APPROVAL_CHANGED", JSON.stringify({ result, approval: plan.approval }));
    assert.notEqual(result.outcome, "failed", JSON.stringify({ result, approval: plan.approval }));
    assert.deepEqual(destinations, scenario.sends);
  });
}

for (const change of ["provider", "test mode"] as const) {
  test(`Send test is still refused by the delivery policy when the ${change} really changes after approval`, async () => {
    const { planMailTestSend } = await import("@jini-ai/platform/mail/test-send");
    const { site, deps, destinations, setTestMode } = await testSendRig({ mode: "production", select: "fake" });
    await site.ready;
    const plan = await planMailTestSend({ deps: { ...deps, userRepo: { findByPrincipalId: async () => ({ principalId: "owner", workspaceId: WS, username: "owner", email: "owner@example.com", passwordHash: "x" }) } as never }, principalId: "owner" });
    if (change === "provider") await site.selectProvider({ id: "console", principalId: "owner" }); else await setTestMode({ mode: "redirect", to: "qa@example.com" });
    // Straight to the mailer: the operation's own re-plan would catch this first, and this pins the second, send-time check.
    const result = await deps.mailer.send(
      { workspaceId: WS, to: { email: "owner@example.com" }, from: plan.approval.from, subject: "t", text: "t" },
      { mailTestApproval: plan.approval, idempotencyKey: `pin-${change}`, workspaceId: WS, sourceContext: { module: "mail", ref: change }, purpose: "transactional", lane: "interactive" },
    );
    assert.equal(!result.ok && result.errorCode, "MAIL_TEST_APPROVAL_CHANGED");
    assert.deepEqual(destinations, []);
  });
}

/** Serves a different provider selection to exactly the Nth read of `core.mail.provider` while armed, as a
 *  racing settings write would be seen by one read and not the next. Writes and other keys pass through. */
function flickeringProviderRepo(flicker: { armed: boolean; reads: number; atRead: number; value: MailProviderSetting }): (repo: SettingsRepoPort) => SettingsRepoPort {
  return (repo) => new Proxy(repo, { get(target, prop) {
    const member = Reflect.get(target, prop) as unknown;
    if (typeof member !== "function") return member;
    const call = member as (this: SettingsRepoPort, query: never) => Promise<unknown>;
    // Definitions are cached after the first lookup, so the provider setting is recognised by its value shape.
    if (prop === "getWorkspaceValue") return async (query: never) => {
      const record = await call.call(target, query) as { valueJson: unknown } | null;
      if (!flicker.armed || !record || typeof record.valueJson !== "object" || record.valueJson === null || !("transactional" in record.valueJson)) return record;
      flicker.reads++;
      return flicker.reads === flicker.atRead ? { ...record, valueJson: flicker.value } : record;
    };
    return member.bind(target);
  } });
}

test("provider selection changing between a settings read and the lane resolution plans the RESOLVED provider, with no false 'configuration changed'", async () => {
  const { planMailTestSend, runMailTestSend } = await import("@jini-ai/platform/mail/test-send");
  // One provider read while planning sees console; every other read (and the send) sees the saved "fake".
  const flicker = { armed: false, reads: 0, atRead: Number.POSITIVE_INFINITY, value: { transactional: "console", bulk: "console" } as MailProviderSetting };
  const { site, deps, destinations } = await testSendRig({ mode: "local", select: "fake", wrapRepo: flickeringProviderRepo(flicker) });
  await site.ready;
  const owned = { ...deps, userRepo: { findByPrincipalId: async () => ({ principalId: "owner", workspaceId: WS, username: "owner", email: "owner@example.com", passwordHash: "x" }) } as never };
  // Calibrate: how many provider reads does one plan make? Flicker the one BEFORE the last. The last read is
  // the one the plan's provider id is built from; an earlier read that is not that resolution must not matter.
  flicker.armed = true;
  await planMailTestSend({ deps: owned, principalId: "owner" });
  assert.ok(flicker.reads >= 2, "a plan reads the provider setting more than once, so there is an earlier read to flicker");
  flicker.atRead = flicker.reads - 1;
  flicker.reads = 0;
  const plan = await planMailTestSend({ deps: owned, principalId: "owner" });
  flicker.armed = false;
  assert.equal(plan.approval.providerId, "fake", "the approval names the provider the resolution used, not a second settings read");
  const result = await runMailTestSend({ deps: owned, principalId: "owner", plan, ref: "flicker-click" });
  assert.notEqual(result.outcome === "failed" && result.errorCode, "MAIL_TEST_APPROVAL_CHANGED", JSON.stringify({ result, approval: plan.approval }));
  assert.equal(result.outcome, "accepted");
  assert.deepEqual(destinations, ["owner@example.com"]);
});
