import { authenticatedAdminRequest, WORKSPACE_ID } from "@/lib/api";

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

// --- providers (`platform/mail/mail-status.ts`) ---------------------------------------------

export type MailLane = "transactional" | "bulk";

/** One credential field a provider's setup form shows — declared by the provider, never by a vendor branch here. */
export interface MailProviderField {
  key: string;
  label: string;
  type: "secret" | "text" | "url" | "email";
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
  help?: string;
  helpUrl?: string;
}

export interface MailProviderConfiguration {
  pluginId?: string;
  id: string;
  label: string;
  origin: "core" | "plugin";
  hosted: boolean;
  lanes: readonly MailLane[];
  capabilities: { feedback: boolean; domainVerification: boolean };
  credential: { required: boolean; saved: boolean; label?: string; credentialId?: string; updatedAt?: string };
  selectable: boolean;
  refusal?: string;
  setup: { fields: readonly MailProviderField[]; helpUrl?: string };
}

export interface MailProviderConfigurationReport {
  setting: { transactional: string | null; bulk: string | null };
  providers: readonly MailProviderConfiguration[];
  refusals: readonly string[];
}

export interface MailProviderCredentialInput {
  token?: string;
  username?: string;
  baseUrl?: string;
}

// --- DNS (`features/domain-dns/mail-dns-status.ts`) -----------------------------------------

export type MailDnsRecordStatus = "Checking" | "Matches" | "Missing" | "Mismatch" | "Pending" | "Unknown" | "TimedOut";

export interface MailDnsRecordView {
  type: string;
  host: string;
  name: string;
  expected: string;
  observed: string[];
  status: MailDnsRecordStatus;
  purpose: "mail" | "other";
  priority?: number;
  note?: string;
}

export type ProviderDomainVerification =
  | { state: "verified" | "pending" | "failed" | "not_found"; domain: string; providerId: string }
  | { state: "no_sender" | "no_provider" | "unsupported" | "unknown"; domain?: string; providerId: string | null; reason?: string };

export interface MailDnsStatus {
  state: "checked" | "no_sender" | "no_provider" | "verification_unavailable" | "requirements_unavailable" | "requirements_failed" | "check_failed";
  message?: string;
  senderDomain: string | null;
  providerId: string | null;
  providerVerification: ProviderDomainVerification | null;
  dns?: { overall: MailDnsRecordStatus; records: MailDnsRecordView[]; reason?: string; checkedAt: string };
}

// --- test send (`features/mail-status/test-send.ts`) ----------------------------------------

interface TestCommon { to: string; from: string; driver: string; at: string }
export type MailTestSendResult =
  | (TestCommon & { outcome: "accepted"; providerMessageId: string })
  | (TestCommon & { outcome: "captured"; where: "capture" | "console"; providerMessageId: string })
  | (TestCommon & { outcome: "redirected"; redirectedTo: string; providerMessageId: string })
  | (TestCommon & { outcome: "failed" | "unknown"; errorCode: string; message: string; retryable: boolean });

// --- uses, activity, suppressions, feedback (`features/mail-status/*.ts`) -------------------

export type MailUseState = "ready" | "blocked" | "disabled" | "not_configured" | "unknown";

export interface MailUseRow {
  use: "sign_in" | "newsletter_confirmation" | "form_notifications" | "newsletter";
  label: string;
  mailLane: MailLane;
  state: MailUseState;
  reasons: string[];
  sender: string | null;
  formsConfigured?: number;
  evidence: { outcome: string; at: string } | null;
}

export interface MailActivityItem {
  id?: string;
  recipient: string;
  originalRecipient?: string;
  deliveryMode?: "redirect" | "capture";
  use: string;
  outcome: string;
  lane: MailLane;
  providerId: string;
  providerMessageId?: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailActivityPage {
  access: "full" | "masked";
  items: MailActivityItem[];
  nextCursor: string | null;
  empty: "none_recorded" | "no_matches" | null;
}

export interface MailActivityDetail {
  activity: MailActivityItem;
  feedback: { kind: string; occurredAt: string; receivedAt: string }[];
}

export interface MailActivityFilter {
  outcome?: string;
  recipient?: string;
}

export type MailSuppressionScope = "all" | "bulk";

export interface MailSuppressionEntry {
  address: string;
  scope: MailSuppressionScope;
  reason: "bounced" | "complained" | "manual";
  createdAt: string;
  revision: string;
}

export interface MailSuppressionPage {
  items: MailSuppressionEntry[];
  nextCursor: string | null;
  empty: "none_recorded" | "no_matches" | null;
}

export interface MailSuppressionRemovalPlan {
  address: string;
  scope: MailSuppressionScope;
  reason: string;
  suppressionReason: MailSuppressionEntry["reason"];
  suppressedAt: string;
  revision: string;
  warnings: string[];
}

export interface MailFeedbackProviderSetup {
  providerId: string;
  label: string;
  supported: boolean;
  webhookUrl: string | null;
  webhookPath: string;
  signingSecret: { current: { label: string; configured: boolean } } | null;
  lastVerifiedEvent: { kind: string; receivedAt: string } | null;
  state: "unsupported" | "secret_missing" | "no_events_yet" | "receiving";
}

export interface MailFeedbackSetupReport {
  available: boolean;
  providers: MailFeedbackProviderSetup[];
}

// --- templates (`features/email-templates/operations.ts`) -----------------------------------

export interface EmailTemplateField {
  name: string;
  sample?: string;
}

export interface EmailTemplateSummary {
  id: string;
  name: string;
  subject: string;
  fields: EmailTemplateField[];
  version: number;
  updatedAt: string;
}

export interface EmailTemplateDetail extends EmailTemplateSummary {
  html: string;
  undeclaredFields: string[];
}

export interface EmailTemplatePreview {
  subject: string;
  html: string;
  missingFields: string[];
  undeclaredFields: string[];
  mode: "admin" | "sent";
  scriptsStripped: boolean;
  text?: string;
}

const query = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

const get = <T>(path: string) => authenticatedAdminRequest<T>({ method: "GET", path });
const send = <T>(method: string, path: string, body?: unknown) => authenticatedAdminRequest<T>({ method, path, body: body ?? {} });
const enc = encodeURIComponent;

/** The Email page's API port: one object a test replaces wholesale. */
export const emailApi = {
  listProviders: () => get<MailProviderConfigurationReport>(`${SYSTEM}/mail-providers`),
  saveProviderKey: ({ providerId, input }: { providerId: string; input: MailProviderCredentialInput }) =>
    send<{ provider: MailProviderConfiguration }>("PUT", `${SYSTEM}/mail-providers/${enc(providerId)}/credential`, input),
  activateProvider: ({ providerId }: { providerId: string }) =>
    send<{ set: true; providerId: string; label: string }>("POST", `${SYSTEM}/mail-providers/${enc(providerId)}/activate`),

  readDns: () => get<MailDnsStatus>(`${SYSTEM}/mail-dns`),
  verifyDns: () => send<MailDnsStatus>("POST", `${SYSTEM}/mail-dns/verify`),

  sendTest: ({ to, requestId }: { to?: string; requestId: string }) =>
    send<{ sent: boolean; result: MailTestSendResult }>("POST", `${SYSTEM}/mail-test-send`, { ...(to ? { to } : {}), requestId }),
  readUses: () => get<{ checkedAt: string; uses: MailUseRow[] }>(`${SYSTEM}/mail-uses`),

  listActivity: ({ filter, cursor }: { filter: MailActivityFilter; cursor?: string }) =>
    get<MailActivityPage>(`${SYSTEM}/mail-activity${query({ outcome: filter.outcome, recipient: filter.recipient, cursor })}`),
  getActivity: ({ id }: { id: string }) => get<MailActivityDetail>(`${SYSTEM}/mail-activity/${enc(id)}`),
  listSuppressions: ({ search, cursor }: { search?: string; cursor?: string }) =>
    get<MailSuppressionPage>(`${SYSTEM}/mail-suppressions${query({ search, cursor })}`),
  /** Without `confirm` this only previews (`plan`); with it, `revision` must be the previewed one. */
  removeSuppression: (required: { address: string; scope: MailSuppressionScope; reason: string }, options: { confirm?: { revision: string } } = {}) =>
    send<{ removed: boolean; confirmationRequired?: true; plan?: MailSuppressionRemovalPlan }>("POST", `${SYSTEM}/mail-suppressions/remove`, {
      ...required, ...(options.confirm ? { confirmed: true, revision: options.confirm.revision } : {}),
    }),
  readFeedback: () => get<MailFeedbackSetupReport>(`${SYSTEM}/mail-feedback`),

  listTemplates: () => get<{ templates: EmailTemplateSummary[]; nextCursor?: string }>(`${TEMPLATES}?limit=100`),
  createTemplate: ({ name }: { name: string }) => send<EmailTemplateDetail>("POST", TEMPLATES, { name }),
  getTemplate: ({ id }: { id: string }) => get<EmailTemplateDetail>(`${TEMPLATES}/${enc(id)}`),
  saveTemplateHtml: ({ id, html, expectedVersion }: { id: string; html: string; expectedVersion: number }) =>
    send<EmailTemplateDetail>("PUT", `${TEMPLATES}/${enc(id)}/html`, { html, expectedVersion }),
  renameTemplate: ({ id, name, expectedVersion }: { id: string; name: string; expectedVersion: number }) =>
    send<EmailTemplateDetail>("PATCH", `${TEMPLATES}/${enc(id)}`, { name, expectedVersion }),
  previewTemplate: ({ html, values, mode }: { html: string; values: Record<string, string>; mode: "admin" | "sent" }) =>
    send<EmailTemplatePreview>("POST", `${TEMPLATES}/preview`, { html, values, mode }),
  /** Move through the scoped template registration; Trash owns marker, index and restore. */
  trashTemplate: ({ id }: { id: string }, _options = {}) => send<{ ok: true }>("POST", `/workspaces/${WORKSPACE_ID}/trash/items`, { type: "email-template", id }),

  readSender: () =>
    authenticatedAdminRequest<{ data: { key: string; value: unknown }[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/settings/effective?namespace=core.mail` }),
  saveSender: ({ key, value }: { key: "senderEmail" | "senderName"; value: string }) =>
    send<unknown>("PUT", `/workspaces/${WORKSPACE_ID}/settings/value`, { namespace: "core.mail", key, scope: "workspace", valueJson: value }),
};

export type EmailApi = typeof emailApi;
