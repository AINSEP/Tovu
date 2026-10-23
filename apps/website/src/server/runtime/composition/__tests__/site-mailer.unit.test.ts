import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemorySettingsRepo } from "@jini-ai/core/settings";
import type { MailCapturePort, MailSendLedgerPort, MailProviderSetting } from "@jini-ai/platform/mail";
import type { MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import type { SetAgentPluginEnabledInput } from "#src/features/agent-plugins/set-enabled";

import { createSettingsPrincipalLookup, set } from "#src/features/settings/index";
import { ensureMailProviderSettings, readMailProviderSetting, writeMailProviderSetting } from "#src/features/settings/mail-provider";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createSiteMailer, type SiteMailerRequired } from "../site-mailer.js";

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
      workspaceId: WS, mode: "local", customCredentialRepo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring),
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
  const { planMailTestSend, runMailTestSend } = await import("#src/features/mail-status/test-send");
  const { readMailUseReadiness } = await import("#src/features/mail-status/use-readiness");
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
  const { planMailTestSend } = await import("#src/features/mail-status/test-send");
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
    await writeMailProviderSetting({ deps: { ...required.settings.deps, repo: settingsRepo, authorize: required.settings.authorize }, workspaceId: WS, callerPrincipalId: "owner", value: before });
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
  await writeMailProviderSetting({ deps: { ...required.settings.deps, repo: settingsRepo, authorize: required.settings.authorize }, workspaceId: WS, callerPrincipalId: "owner", value: before });
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
