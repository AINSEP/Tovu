import type { api as pluginApi, AdminAgentPlugin } from "@/lib/api";
import { vi } from "vitest";

import type { EmailApi, EmailTemplateDetail, EmailTemplatePreview, MailActivityItem, MailDnsStatus, MailProviderConfiguration, MailSuppressionEntry, MailSuppressionRemovalPlan } from "../email-api";

/** @file Email fixtures and typed fake API ports. No fake ever delegates to the network. */
export const MAIL_PLUGIN: AdminAgentPlugin = { pluginId: "mail-plugin", displayName: "Example Mail", summary: "Send site email.", provides: ["outbound-mail"], origin: "bundled", enabled: false, version: "1", description: null, keywords: [], skills: [], mcpServerIds: [] };
export const AT = "2026-10-22T12:00:00Z";
export const PROVIDER: MailProviderConfiguration = {
  id: "hosted", label: "Hosted Mail", origin: "plugin", hosted: true, lanes: [],
  capabilities: { feedback: true, domainVerification: true },
  credential: { required: true, saved: false }, selectable: false, refusal: "Save a key first.",
  setup: { fields: [{ key: "token", label: "Access key", type: "secret", required: true }, { key: "baseUrl", label: "Server URL", type: "url", required: false }], helpUrl: "https://example.com/keys" },
};
export const DNS: MailDnsStatus = {
  state: "checked", senderDomain: "example.com", providerId: "hosted",
  providerVerification: { state: "pending", domain: "example.com", providerId: "hosted" },
  dns: { overall: "Mismatch", checkedAt: AT, records: [
    { type: "TXT", host: "example.com", name: "SPF", expected: "v=spf1 include:example.net ~all", observed: ["v=spf1 -all"], status: "Mismatch", purpose: "mail" },
    { type: "CNAME", host: "key._domainkey.example.com", name: "DKIM", expected: "key.example.net", observed: [], status: "Unknown", purpose: "mail" },
  ] },
};
export const TEMPLATE: EmailTemplateDetail = {
  id: "template-1", name: "Welcome", subject: "Hi {{name}}", fields: [{ name: "name", sample: "Ada" }],
  version: 2, updatedAt: AT, html: "<html><head><title>Hi {{name}}</title></head><body>Hello {{name}}</body></html>", undeclaredFields: [],
};
export const PREVIEW: EmailTemplatePreview = {
  subject: "Hi Ada", html: "<p>Hello Ada</p>", missingFields: [], undeclaredFields: [], mode: "admin", scriptsStripped: false,
};
export const ACTIVITY: MailActivityItem = {
  id: "send-1", recipient: "ada@example.com", use: "sign_in", outcome: "accepted", lane: "transactional", providerId: "hosted", errorCode: null, createdAt: AT, updatedAt: AT,
};
export const BLOCK: MailSuppressionEntry = { address: "ada@example.com", scope: "all", reason: "bounced", createdAt: AT, revision: "block-rev-1" };
export const PLAN: MailSuppressionRemovalPlan = {
  address: BLOCK.address, scope: BLOCK.scope, reason: "Address fixed", suppressionReason: BLOCK.reason, suppressedAt: AT, revision: BLOCK.revision,
  warnings: ["This address may bounce again."],
};

/** Fresh spies per case; each scenario changes only the needed API response. */
export function createEmailFake(_required = {}, _optional = {}) {
  return {
    listAgentPlugins: vi.fn<typeof pluginApi.listAgentPlugins>().mockResolvedValue({ agentPlugins: [] }),
    setAgentPluginEnabled: vi.fn<typeof pluginApi.setAgentPluginEnabled>().mockResolvedValue({ agentPlugin: { ...MAIL_PLUGIN, enabled: true } }),
    listProviders: vi.fn<EmailApi["listProviders"]>().mockResolvedValue({ setting: { transactional: null, bulk: null }, providers: [PROVIDER], refusals: [] }),
    saveProviderKey: vi.fn<EmailApi["saveProviderKey"]>().mockResolvedValue({ provider: { ...PROVIDER, credential: { required: true, saved: true } } }),
    activateProvider: vi.fn<EmailApi["activateProvider"]>().mockResolvedValue({ set: true, providerId: PROVIDER.id, label: PROVIDER.label }),
    readSender: vi.fn<EmailApi["readSender"]>().mockResolvedValue({ data: [{ key: "senderName", value: "Example" }, { key: "senderEmail", value: "hello@example.com" }] }),
    saveSender: vi.fn<EmailApi["saveSender"]>().mockResolvedValue({}),
    readDns: vi.fn<EmailApi["readDns"]>().mockResolvedValue(DNS),
    verifyDns: vi.fn<EmailApi["verifyDns"]>().mockResolvedValue(DNS),
    readUses: vi.fn<EmailApi["readUses"]>().mockResolvedValue({ checkedAt: AT, uses: [] }),
    sendTest: vi.fn<EmailApi["sendTest"]>().mockResolvedValue({ sent: true, result: { to: BLOCK.address, from: "hello@example.com", driver: "hosted", at: AT, outcome: "accepted", providerMessageId: "msg-1" } }),
    listActivity: vi.fn<EmailApi["listActivity"]>().mockResolvedValue({ access: "full", items: [], nextCursor: null, empty: "none_recorded" }),
    getActivity: vi.fn<EmailApi["getActivity"]>().mockResolvedValue({ activity: ACTIVITY, feedback: [] }),
    listSuppressions: vi.fn<EmailApi["listSuppressions"]>().mockResolvedValue({ items: [], nextCursor: null, empty: "none_recorded" }),
    removeSuppression: vi.fn<EmailApi["removeSuppression"]>().mockResolvedValue({ removed: false, confirmationRequired: true, plan: PLAN }),
    readFeedback: vi.fn<EmailApi["readFeedback"]>().mockResolvedValue({ available: false, providers: [] }),
    listTemplates: vi.fn<EmailApi["listTemplates"]>().mockResolvedValue({ templates: [TEMPLATE] }),
    createTemplate: vi.fn<EmailApi["createTemplate"]>().mockResolvedValue(TEMPLATE),
    getTemplate: vi.fn<EmailApi["getTemplate"]>().mockResolvedValue(TEMPLATE),
    saveTemplateHtml: vi.fn<EmailApi["saveTemplateHtml"]>().mockImplementation(async (input) => ({ ...TEMPLATE, html: input.html, version: input.expectedVersion + 1 })),
    renameTemplate: vi.fn<EmailApi["renameTemplate"]>().mockImplementation(async (input) => ({ ...TEMPLATE, name: input.name, version: input.expectedVersion + 1 })),
    trashTemplate: vi.fn<EmailApi["trashTemplate"]>().mockResolvedValue({ ok: true }),
    previewTemplate: vi.fn<EmailApi["previewTemplate"]>().mockResolvedValue(PREVIEW),
  } satisfies EmailApi & Pick<typeof pluginApi, "listAgentPlugins" | "setAgentPluginEnabled">;
}
