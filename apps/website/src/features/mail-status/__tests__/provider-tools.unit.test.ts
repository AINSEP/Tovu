import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyTool, type ToolExecutionContext, type ToolExecutionOptions } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/core/primitives";

import { ConsoleMailerAdapter } from "../../members/index.js";
import type { MailProviderConfiguration, MailProviderConfigurationReport, MailProviderControl } from "../../../platform/mail/mail-status.js";
import { buildMailProviderRegistrations, contributeMailProviderTools, currentLanesDetail, mailProviderDerivedRisk, readCurrentLanes, asToolInputError, type MailProviderToolDeps } from "../provider-tool-registrations.js";
import { buildMailStatusRegistrations } from "../tool-registrations.js";

/**
 * @file The provider configuration tools (`mail_list_providers`, `mail_configure_provider`) and
 * the phase-2 parts of `mail_set_provider` and `system_get_mail_status`: per-action permissions,
 * the credential_save hand-off that keeps secrets out of tool arguments, the split-lane warning,
 * the re-check at the moment of the switch, and the status `refresh` flag.
 */

const ctx: ToolExecutionContext = { executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input: {}, signal: new AbortController().signal };

const PROVIDER: MailProviderConfiguration = {
  id: "fakemail", label: "Fake", origin: "plugin", hosted: true, lanes: [], capabilities: { feedback: false, domainVerification: false },
  credential: { required: true, saved: false, label: "Tovu Mail — Fake API" }, selectable: false, refusal: "no key",
  setup: { fields: [{ key: "baseUrl", label: "API", type: "url", required: true, defaultValue: "https://api.fake.test" }] },
};

function report(providers: MailProviderConfiguration[], setting = { transactional: "smtp", bulk: "smtp" }): MailProviderConfigurationReport {
  return { setting, providers, refusals: [] };
}

function providerTools(overrides: Partial<MailProviderToolDeps> = {}, grants = ["admin.forms.manage", "custom-credentials.write"]) {
  const allowed = new Set(grants);
  const deps: MailProviderToolDeps = {
    workspaceId: "ws", authorize: async ({ permission }) => ({ allowed: allowed.has(permission), reason: "fixture grant" }),
    mailProviderControl: { check: async () => ({ ok: true, label: "Fake" }), select: async () => {}, describe: async () => report([PROVIDER]) },
    ...overrides,
  };
  const registrations = buildMailProviderRegistrations(deps);
  return { registrations, call: (name: string, input: unknown = {}) => registrations.find((r) => r.descriptor.id === name)!.handler({ ...ctx, input }) };
}

test("both provider tools are read-only with derived none risk under their own contributor", () => {
  const { registrations } = providerTools();
  for (const registration of registrations) {
    assert.equal(isReadOnlyTool({ descriptor: registration.descriptor }), true);
    assert.equal(mailProviderDerivedRisk.get(registration.descriptor.id), "none");
  }
  const contributor = contributeMailProviderTools();
  assert.deepEqual([contributor.domain, contributor.build, contributor.risk], ["system-mail-providers", buildMailProviderRegistrations, mailProviderDerivedRisk]);
});

test("mail_list_providers returns the shared DTO; it needs admin.forms.manage and a control", async () => {
  assert.deepEqual(await providerTools().call("mail_list_providers"), report([PROVIDER]));
  await assert.rejects(providerTools({}, ["custom-credentials.write"]).call("mail_list_providers"), /MAIL_PROVIDERS_FORBIDDEN: .*admin\.forms\.manage/);
  await assert.rejects(providerTools({ mailProviderControl: undefined }).call("mail_list_providers"), { name: "ToolInputError", message: /configuration is unavailable on this server/ });
});

test("mail_configure_provider hands creation to credential_save with only non-secret prefill, and never activates", async () => {
  const result = await providerTools().call("mail_configure_provider", { providerId: " fakemail " }) as Record<string, unknown>;
  assert.equal(result.activated, false);
  assert.deepEqual(result.credential, { action: "create", label: "Tovu Mail — Fake API", category: "ops", baseUrl: "https://api.fake.test" });
  assert.match(JSON.stringify(result.credentialSetup), /credential_save/);
  assert.match(JSON.stringify(result.credentialSetup), /Tovu Mail — Fake API/);
  const saved = { ...PROVIDER, credential: { required: true, saved: true, label: "Tovu Mail — Fake API", credentialId: "cred-1" }, setup: { fields: [] } };
  const rotation = await providerTools({ mailProviderControl: { check: async () => ({ ok: true, label: "Fake" }), select: async () => {}, describe: async () => report([saved]) } }).call("mail_configure_provider", { providerId: "fakemail" }) as Record<string, unknown>;
  assert.deepEqual(rotation.credential, { action: "rotate", label: "Tovu Mail — Fake API", category: "ops", credentialId: "cred-1" });
  assert.match(JSON.stringify(rotation.credentialSetup), /"target":"Tovu Mail — Fake API"/);
  assert.deepEqual(result.followUps, []);
  assert.deepEqual(rotation.followUps, []);
});

test("mail_configure_provider names the username follow-up for a provider whose form declares one, on creation only", async () => {
  const login = { ...PROVIDER, setup: { fields: [...PROVIDER.setup.fields, { key: "username", label: "Username", type: "text" as const, required: true }] } };
  const describe = async () => report([login]);
  const result = await providerTools({ mailProviderControl: { check: async () => ({ ok: true, label: "Fake" }), select: async () => {}, describe } }).call("mail_configure_provider", { providerId: "fakemail" }) as { followUps: { tool: string; args: unknown }[] };
  assert.deepEqual(result.followUps.map((f) => [f.tool, f.args]), [["custom_credential_set_username", { label: "Tovu Mail — Fake API" }]]);
  const rotating = { ...login, credential: { required: true, saved: true, label: "Tovu Mail — Fake API", credentialId: "cred-1" } };
  const rotation = await providerTools({ mailProviderControl: { check: async () => ({ ok: true, label: "Fake" }), select: async () => {}, describe: async () => report([rotating]) } }).call("mail_configure_provider", { providerId: "fakemail" }) as { followUps: unknown[] };
  assert.deepEqual(rotation.followUps, []);
});

test("mail_configure_provider refuses bad input, unknown providers, a missing grant", async () => {
  const f = providerTools();
  await assert.rejects(f.call("mail_configure_provider", { providerId: "" }), /providerId must be an installed provider id from mail_list_providers/);
  await assert.rejects(f.call("mail_configure_provider", { providerId: 1 }), /providerId must be/);
  await assert.rejects(f.call("mail_configure_provider", { providerId: "nope" }), { name: "ToolInputError", message: /'nope' is not an installed mail provider/ });
  await assert.rejects(providerTools({}, ["admin.forms.manage"]).call("mail_configure_provider", { providerId: "fakemail" }), /custom-credentials\.write/);
});

test("asToolInputError passes other errors through unchanged", async () => {
  const boom = new Error("boom");
  await assert.rejects(asToolInputError(async () => { throw boom; }), (err) => err === boom);
});

test("readCurrentLanes and currentLanesDetail: a split setup is named before it is flattened", async () => {
  const bare: MailProviderControl = { check: async () => ({ ok: true, label: "x" }), select: async () => {} };
  assert.equal(await readCurrentLanes({ control: bare }), undefined);
  assert.equal(await readCurrentLanes({ control: { ...bare, describe: async () => { throw new Error("down"); } } }), undefined);
  assert.deepEqual(await readCurrentLanes({ control: { ...bare, describe: async () => report([], { transactional: "a", bulk: "b" }) } }), { transactional: "a", bulk: "b" });
  assert.deepEqual(currentLanesDetail({}), []);
  assert.deepEqual(currentLanesDetail({ current: { transactional: "smtp", bulk: "smtp" } }), []);
  assert.deepEqual(currentLanesDetail({ current: { transactional: "smtp", bulk: null } }), [{ label: "Currently", value: "Transactional: smtp; bulk: none. Both lanes will use the new provider." }]);
  assert.match(currentLanesDetail({ current: { transactional: null, bulk: "x" } })[0]!.value, /^Transactional: none; bulk: x\./);
});

function statusTools(control: MailProviderControl, mailStatus?: (optional?: { refresh?: boolean }) => Promise<never>) {
  let count = 0;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => `exchange-${++count}` }, defaultChannel: "mcp-ui" });
  const cards: unknown[] = [];
  const confirm = (toolId: string, before?: () => void): ToolExecutionOptions => ({ emitSurface: async (surface: unknown) => {
    cards.push(surface);
    before?.();
    store.deliver({ exchangeId: `exchange-${count}`, principalId: "owner", params: { decision: "confirm" } }, { toolId });
  } });
  const registrations = buildMailStatusRegistrations({ workspaceId: "ws", mailer: new ConsoleMailerAdapter(), authorize: async () => ({ allowed: true, reason: "grant" }), mailProviderControl: control, ...(mailStatus ? { mailStatus } : {}) }, { surfaceExchanges: store });
  const call = (name: string, input: unknown, options: ToolExecutionOptions = {}) => registrations.find((r) => r.descriptor.id === name)!.handler({ ...ctx, input }, options);
  return { call, confirm, cards };
}

test("mail_set_provider shows a split-lane setup on its card and re-checks the provider at the moment of the switch", async () => {
  const selected: string[] = [];
  let available = true;
  let invalidated = 0;
  const control: MailProviderControl = {
    check: async () => (available ? { ok: true, label: "Fake" } : { ok: false, reason: "'fakemail' has no saved credential" }),
    select: async ({ id }) => { selected.push(id); },
    describe: async () => report([], { transactional: "smtp", bulk: "other" }),
    invalidate: () => { invalidated += 1; },
  };
  const f = statusTools(control);
  assert.deepEqual(await f.call("mail_set_provider", { providerId: "fakemail" }, f.confirm("mail_set_provider")), { set: true, providerId: "fakemail" });
  assert.match(JSON.stringify(f.cards[0]), /Transactional: smtp; bulk: other\. Both lanes will use the new provider\./);
  assert.deepEqual([selected, invalidated], [["fakemail"], 1]);
  // The key disappears while the card is open: the switch refuses and writes nothing.
  await assert.rejects(f.call("mail_set_provider", { providerId: "fakemail" }, f.confirm("mail_set_provider", () => { available = false; })), /Cannot switch to 'fakemail' has no saved credential\. Nothing was changed\./);
  assert.deepEqual(selected, ["fakemail"]);
});

test("system_get_mail_status passes refresh through only when it is true", async () => {
  const seen: unknown[] = [];
  const control: MailProviderControl = { check: async () => ({ ok: true, label: "x" }), select: async () => {} };
  const f = statusTools(control, async (optional) => { seen.push(optional); return {} as never; });
  await f.call("system_get_mail_status", {});
  await f.call("system_get_mail_status", { refresh: true });
  await f.call("system_get_mail_status", { refresh: "yes" });
  assert.deepEqual(seen, [{ refresh: false }, { refresh: true }, { refresh: false }]);
});
