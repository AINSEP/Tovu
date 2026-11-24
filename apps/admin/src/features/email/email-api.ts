import type {
  EmailApi, EmailTemplateDetail, EmailTemplatePreview, EmailTemplateSummary, MailActivityDetail, MailActivityFilter,
  MailActivityPage, MailDnsStatus, MailFeedbackSetupReport, MailProviderConfiguration, MailProviderConfigurationReport,
  MailProviderCredentialInput, MailSuppressionPage, MailSuppressionRemovalPlan, MailSuppressionScope, MailTestSendResult,
  MailUseRow,
} from "@jini-ai/admin/screens/email/email-api.types";
import { authenticatedAdminRequest } from "@/lib/admin-http/request";
import { WORKSPACE_ID } from "../../lib/admin-http/config";

/**
 * @file The Email page's client for the round-2 mail routes (2026-10-22). Each shape mirrors its
 * server DTO; the server file is named on each group so a drift is one grep away. Every call goes
 * through `authenticatedAdminRequest`, so session expiry and `ApiError` behave like any screen.
 *
 * Routes: `apps/website/src/server/inbound/admin-http/routes/system/mail-{providers,dns,test-send,
 * activity}.ts` and `routes/email-templates/routes.ts`.
 */

const SYSTEM = `/workspaces/${WORKSPACE_ID}/system`;
const TEMPLATES = `/workspaces/${WORKSPACE_ID}/email-templates`;

const query = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

const get = <T>({ path }: { path: string }, _options = {}) => authenticatedAdminRequest<T>({ method: "GET", path });
const send = <T>(
  { method, path }: { method: string; path: string },
  { body }: { body?: unknown } = {},
) => authenticatedAdminRequest<T>({ method, path, body: body ?? {} });
const enc = encodeURIComponent;

/** The Email page's API port: one object a test replaces wholesale. */
export const emailApi: EmailApi = {
  listProviders: () => get<MailProviderConfigurationReport>({ path: `${SYSTEM}/mail-providers` }),
  saveProviderKey: ({ providerId, input }: { providerId: string; input: MailProviderCredentialInput }) =>
    send<{ provider: MailProviderConfiguration }>({ method: "PUT", path: `${SYSTEM}/mail-providers/${enc(providerId)}/credential` }, { body: input }),
  activateProvider: ({ providerId }: { providerId: string }) =>
    send<{ set: true; providerId: string; label: string }>({ method: "POST", path: `${SYSTEM}/mail-providers/${enc(providerId)}/activate` }),

  readDns: () => get<MailDnsStatus>({ path: `${SYSTEM}/mail-dns` }),
  verifyDns: () => send<MailDnsStatus>({ method: "POST", path: `${SYSTEM}/mail-dns/verify` }),

  sendTest: ({ to, requestId }: { to?: string; requestId: string }) =>
    send<{ sent: boolean; result: MailTestSendResult }>({ method: "POST", path: `${SYSTEM}/mail-test-send` }, { body: { ...(to ? { to } : {}), requestId } }),
  readUses: () => get<{ checkedAt: string; uses: MailUseRow[] }>({ path: `${SYSTEM}/mail-uses` }),

  listActivity: ({ filter, cursor }: { filter: MailActivityFilter; cursor?: string }) =>
    get<MailActivityPage>({ path: `${SYSTEM}/mail-activity${query({ outcome: filter.outcome, recipient: filter.recipient, cursor })}` }),
  getActivity: ({ id }: { id: string }) => get<MailActivityDetail>({ path: `${SYSTEM}/mail-activity/${enc(id)}` }),
  listSuppressions: ({ search, cursor }: { search?: string; cursor?: string }) =>
    get<MailSuppressionPage>({ path: `${SYSTEM}/mail-suppressions${query({ search, cursor })}` }),
  /** Without `confirm` this only previews (`plan`); with it, `revision` must be the previewed one. */
  removeSuppression: (required: { address: string; scope: MailSuppressionScope; reason: string }, options: { confirm?: { revision: string } } = {}) =>
    send<{ removed: boolean; confirmationRequired?: true; plan?: MailSuppressionRemovalPlan }>({ method: "POST", path: `${SYSTEM}/mail-suppressions/remove` }, {
      body: { ...required, ...(options.confirm ? { confirmed: true, revision: options.confirm.revision } : {}) },
    }),
  readFeedback: () => get<MailFeedbackSetupReport>({ path: `${SYSTEM}/mail-feedback` }),

  listTemplates: () => get<{ templates: EmailTemplateSummary[]; nextCursor?: string }>({ path: `${TEMPLATES}?limit=100` }),
  createTemplate: ({ name }: { name: string }) => send<EmailTemplateDetail>({ method: "POST", path: TEMPLATES }, { body: { name } }),
  getTemplate: ({ id }: { id: string }) => get<EmailTemplateDetail>({ path: `${TEMPLATES}/${enc(id)}` }),
  saveTemplateHtml: ({ id, html, expectedVersion }: { id: string; html: string; expectedVersion: number }) =>
    send<EmailTemplateDetail>({ method: "PUT", path: `${TEMPLATES}/${enc(id)}/html` }, { body: { html, expectedVersion } }),
  renameTemplate: ({ id, name, expectedVersion }: { id: string; name: string; expectedVersion: number }) =>
    send<EmailTemplateDetail>({ method: "PATCH", path: `${TEMPLATES}/${enc(id)}` }, { body: { name, expectedVersion } }),
  previewTemplate: ({ html, values, mode }: { html: string; values: Record<string, string>; mode: "admin" | "sent" }) =>
    send<EmailTemplatePreview>({ method: "POST", path: `${TEMPLATES}/preview` }, { body: { html, values, mode } }),
  /** Move through the scoped template registration; Trash owns marker, index and restore. */
  trashTemplate: ({ id }: { id: string }, _options = {}) => send<{ ok: true }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/trash/items` }, { body: { type: "email-template", id } }),

  readSender: () =>
    authenticatedAdminRequest<{ data: { key: string; value: unknown }[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/settings/effective?namespace=core.mail` }),
  saveSender: ({ key, value }: { key: "senderEmail" | "senderName"; value: string }) =>
    send<unknown>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/settings/value` }, { body: { namespace: "core.mail", key, scope: "workspace", valueJson: value } }),
};
