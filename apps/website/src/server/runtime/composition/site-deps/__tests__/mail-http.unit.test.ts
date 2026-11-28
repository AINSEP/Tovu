import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { notifyExternalMcpRosterChanged } from "../../../../../assistant/external-mcp-roster-change.js";

/**
 * @file `composeMailHttp`'s mailer ports and the publish peer client: the sender reads go through
 * the mail-sender setting (the composition's workspace for the From address, the caller's for the
 * configured sender), the durable-outbox readiness and plugin enable are forwarded with the
 * composed lifecycle, and an injected publish peer client is used as-is instead of a built one.
 * The site mailer, mail-sender read, outbox readiness and plugin enable are recorders.
 */

type MailerRequired = { readSenderEmail: () => Promise<string>; readConfiguredSender: (required: { workspaceId: string }) => Promise<unknown> };
type MailerOptional = { durableOutboxReady: (required: unknown) => unknown; setAgentPluginEnabled: (input: unknown) => unknown };
const handed: { required?: MailerRequired; optional?: MailerOptional } = {};
const senderReads: Array<{ settingsRepo: unknown; workspaceId: string; getEffective: unknown }> = [];
const outboxReads: unknown[] = [];
const enables: unknown[][] = [];
mock.module(new URL("../../site-mailer.js", import.meta.url).href, { namedExports: {
  createSiteMailer: (required: MailerRequired, optional: MailerOptional) => { handed.required = required; handed.optional = optional; return { mailer: "recorded" }; },
} });
const mailSender = await import("@jini-ai/cms/settings/site/mail-sender");
mock.module("@jini-ai/cms/settings/site/mail-sender", { namedExports: { ...mailSender,
  readMailSenderSetting: async (input: (typeof senderReads)[number]) => { senderReads.push(input); return { email: `news@${input.workspaceId}.test`, name: "Bakery" }; },
} });
const readiness = await import("@jini-ai/cms/forms/site/mail-outbox-readiness");
mock.module("@jini-ai/cms/forms/site/mail-outbox-readiness", { namedExports: { ...readiness,
  formsMailOutboxReady: (required: unknown) => { outboxReads.push(required); return { ready: true }; },
} });
const setEnabled = await import("#src/features/agent-plugins/set-enabled");
mock.module("#src/features/agent-plugins/set-enabled", { namedExports: { ...setEnabled,
  setAgentPluginEnabled: (...args: unknown[]) => { enables.push(args); return Promise.resolve({ enabled: true }); },
} });
const { getEffective } = await import("@jini-ai/core/settings");
const { composeMailHttp } = await import("../mail-http.js");

type Required = Parameters<typeof composeMailHttp>[0];
const settingsRepo = { repo: "settings" };
const lifecycle = { loadPluginContributions: async () => [] };

function compose(overrides: Required["overrides"]) {
  return composeMailHttp({
    workspaceId: "site-7", customCredentialSetRepo: {}, siteAssistantSecretSealer: {}, observability: undefined,
    agentPluginLifecycle: lifecycle, externalMcpServerRepo: {}, runtimeMode: "production", settingsRepo,
    clock: { nowMs: () => 7, nowIso: () => "2031-02-03T04:05:06.000Z" }, idGen: { newId: () => "id-1" },
    settingsPrincipals: {}, identity: { authorize: async () => ({ allowed: true }) }, siteTitleReady: new Promise(() => {}),
    kernel: {}, originRegistry: {}, overrides,
  } as unknown as Required);
}

test("the mailer's sender reads use the mail-sender setting: this workspace's From address, the caller's configured sender", async () => {
  compose({});
  const required = handed.required;
  assert.ok(required, "the site mailer was composed");
  assert.equal(await required.readSenderEmail(), "news@site-7.test");
  assert.deepEqual(await required.readConfiguredSender({ workspaceId: "site-9" }), { email: "news@site-9.test", name: "Bakery" });
  assert.deepEqual(senderReads, [{ settingsRepo, workspaceId: "site-7", getEffective }, { settingsRepo, workspaceId: "site-9", getEffective }]);
});

test("the mailer's outbox readiness and plugin enable forward to the forms outbox and the composed lifecycle", async () => {
  const result = compose({});
  const optional = handed.optional;
  assert.ok(optional, "the site mailer was composed");
  assert.deepEqual(optional.durableOutboxReady({ purpose: "newsletter" }), { ready: true });
  assert.deepEqual(outboxReads, [{ purpose: "newsletter" }]);
  assert.deepEqual(result.mailDurableOutboxReady({ purpose: "forms" } as never), { ready: true }, "the same readiness is returned");
  assert.deepEqual(await optional.setAgentPluginEnabled({ pluginId: "resend", enabled: true }), { enabled: true });
  assert.deepEqual(enables, [[{ pluginId: "resend", enabled: true }, { lifecycle, notifyRosterChanged: notifyExternalMcpRosterChanged }]]);
});

test("an injected publish peer client is used as-is; without one a guarded client is built", () => {
  const injected = { send: async () => ({ status: 204 }) };
  assert.equal(compose({ publishContentPeerHttpClient: injected } as unknown as Required["overrides"]).publishContentPeerHttpClient, injected);
  const built = compose({}).publishContentPeerHttpClient;
  assert.notEqual(built, injected);
  assert.equal(typeof built.send, "function", "the built client can send");
});
