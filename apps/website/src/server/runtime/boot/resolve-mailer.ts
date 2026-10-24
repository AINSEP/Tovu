import { ToolInputError } from "@jini-ai/core";
import { credentialSecrets, safeMailProviderText } from "#src/platform/mail/provider-error";
import { createSenderDomainVerification } from "./sender-domain-verification.js";
import { readMailDomain, type MailDomainReadCredentialPort } from "./mail-domain-read.js";
import type { SenderDomainVerificationPort } from "#src/platform/mail/sender-domain-verification";
import type { UUID } from "@jini-ai/core/primitives";
import type { DomainRequirement } from "@jini-ai/core/provider-registry";
import {
  computeMailStatus,
  initialMailProviderSetting,
  laneForPurpose,
  parseSmtpEndpoint as parseJiniSmtpEndpoint,
  type MailDeliveryLane,
  type MailAdapterCredential,
  type MailDomainState,
  type MailProviderCallContext,
  type MailProviderModule,
  type MailProviderSetting,
} from "@jini-ai/platform/mail";

import type { RuntimeMode } from "#src/contracts/core/runtime-mode";
import type { MailerCapabilities, MailerPort, MailerSendResult } from "#src/platform/mail/index";
import type { MailProviderConfigurationReport, MailProviderError, MailStatusReport } from "#src/platform/mail/mail-status";
import type { CustomCredentialSetRecord } from "#src/features/custom-credentials/index";
import { describeMailProviders } from "./mail-provider-configuration.js";
import { createTtlCache, MAIL_STATUS_TTL_MS } from "./mail-status-cache.js";
import {
  createProviderMailer,
  credentialFailureReason,
  loadMailProviderCatalog,
  MAIL_CREDENTIAL_CATEGORY,
  MAIL_SMTP_CREDENTIAL_LABEL,
  resolveMailCredential,
  resolveMailDomainReadCredential,
  type MailProviderCatalog,
  type MailProviderCatalogDeps,
} from "./mail-provider-catalog.js";

export { MAIL_SMTP_CREDENTIAL_LABEL } from "./mail-provider-catalog.js";
export type { MailStatusReport } from "#src/platform/mail/mail-status";

/**
 * @file Boot-time `MailerPort` selection. Hosted-API providers live in Agent Plugins; SMTP and
 * Console are built-ins. An unconfigured mailer never fails silently.
 *
 * **Explicit selection (email provider contract v1, 2026-10-21).** The provider is no longer "the
 * first plugin whose credential resolves, then SMTP, then Console". Each delivery lane reads the
 * site setting `core.mail.provider` = `{transactional, bulk}` (`features/settings/mail-provider.ts`)
 * and looks the id up in the keyed provider catalog (`mail-provider-catalog.ts`: Jini's `smtp` and
 * `console` built-ins plus plugin providers). An absent selection initializes as unconfigured;
 * saved credentials never select a delivery provider or enable its plugin.
 *
 * An `unconfigured` lane logs to the console in `local` mode and refuses (`MAIL_UNCONFIGURED`,
 * non-retryable) in `production`. A configured provider that is not installed or has no usable
 * credential behaves the same (`MAIL_PROVIDER_UNAVAILABLE`), warned once per provider, and is
 * retried on the next send. Owner sign-in never depends on mail (local owner sign-in sends nothing).
 *
 * Deliberately NOT in `platform/mail/**`: this module needs a runtime (not just type) dependency
 * on `features/custom-credentials` (a Tier-3 feature) to look up the saved credential, and
 * `platform/**` is Tier-2 core — every existing `platform/**` file that reaches into a
 * `features/**` module today does so type-only. Living under `server/runtime/boot/` instead —
 * alongside `production-readiness-gate.ts`, the other "boot-time, mode-aware, aggregate multiple
 * sources of configuration" module — keeps that Tier-2/Tier-3 direction intact.
 *
 * **Credential storage** — follows the established `custom_credential_sets` pattern (the Access
 * Tokens page's "Add custom provider" capability), NOT a new table:
 *
 * - Hosted API: a credential labeled exactly as the plugin's descriptor declares
 *   (`credentialLabel`), category `"ops"`, `baseUrl` = the provider's API origin, connection
 *   `{token: "<API key>"}`. The label is unchanged from when the adapter lived in core, so a saved
 *   key keeps working with no re-entry.
 * - SMTP: a credential labeled exactly {@link MAIL_SMTP_CREDENTIAL_LABEL}, category `"ops"`,
 *   `baseUrl` = `https://<smtp-host>:<port>` (an `https://` SCHEME PREFIX ON A NON-HTTP ENDPOINT —
 *   a disclosed, deliberate encoding, not a mistake: `custom_credential_sets.baseUrl` is validated
 *   as an absolute `http(s)://` URL, `443`/`465` implies implicit TLS, anything else implies
 *   STARTTLS on that port — see {@link parseSmtpEndpoint}), connection
 *   `{token: "<SMTP password>", username: "<SMTP username>"}`. Unauthenticated relay is not
 *   representable through this store (`token` is a required field) — a real but narrow gap,
 *   disclosed rather than worked around with a second credential shape.
 *
 * **The startup race.** `MailerPort.capabilities()` returns synchronously, but the setting read,
 * credential lookup and decrypt are async, and both composition roots must stay synchronous
 * (`server/routes/types.ts`'s `identityReady` doc). So {@link createResolvedMailer} returns a
 * `MailerPort` whose `capabilities()` reports the last resolved transactional provider (console
 * until the first resolution settles) — a disclosed race. `send()`/`sendBatch()` do NOT share it:
 * both await their lane's resolution before delegating.
 *
 * **Live key replacement (email phase 2, 2026-10-22).** A resolved provider mailer is cached with a
 * fingerprint of its credential row (id, vault revision, updatedAt — metadata, no decrypt). Every
 * send compares it with the current row, so a key replaced through ANY path (the Access Tokens
 * page, `credential_save`, the Email page) is used by the very next send; a deleted key re-resolves
 * to "unavailable". `invalidate()` drops every cached mailer and the cached status outright (a
 * provider switch, a key save through the Email page). A store fault while fingerprinting keeps
 * the cached mailer rather than refusing mail it could still send.
 *
 * **Status.** `status()` is served from a short-TTL single-flight cache ({@link MAIL_STATUS_TTL_MS},
 * injected clock), its independent reads run in parallel, and `{refresh: true}` rebuilds it. Each
 * report carries `checkedAt` and the latest observed provider failure (`lastError`, read live).
 */

/**
 * Decodes an SMTP endpoint packed into `custom_credential_sets.baseUrl` — see this file's header.
 * Ports `443`/`465` are implicit TLS; a portless URL uses its scheme's default port.
 * @complexity O(1).
 */
export function parseSmtpEndpoint(baseUrl: string): { host: string; port: number; secure: boolean } {
  return parseJiniSmtpEndpoint({ baseUrl });
}

/** Where `core.mail.provider` lives; `read()` returns null while it was never stored. */
export interface MailProviderSettingPort {
  read(): Promise<MailProviderSetting | null>;
  write(value: MailProviderSetting): Promise<void>;
}

export interface ResolveMailerDeps extends MailProviderCatalogDeps {
  workspaceId: UUID;
  mode: RuntimeMode;
  providerSetting: MailProviderSettingPort;
  /** Decorates each resolved provider's mailer (the delivery policy). Identity when absent. */
  wrapProviderMailer?: (required: { providerId: string; provider: MailProviderModule; mailer: MailerPort }) => MailerPort;
  /** The site's configured sender address, for the `sender_unverified`/`sender_unknown` warnings. */
  readSenderEmail?: () => Promise<string | undefined>;
  /** Injected for tests; defaults to `console.warn`. */
  warn?: (message: string) => void;
  /** Status cache and `lastError` timestamps; defaults to `Date.now`. */
  clock?: { nowMs(): number };
  /** Status freshness window; defaults to {@link MAIL_STATUS_TTL_MS}. */
  statusTtlMs?: number;
  /** Provider DNS-requirements deadline; defaults to five seconds. */
  domainRequirementsTimeoutMs?: number;
}


export interface ResolvedMailer {
  /** Safe to use immediately; each send awaits its lane's resolution. */
  mailer: MailerPort;
  /** Resolves once the initial setting + transactional resolution settle (a test seam). */
  ready: Promise<void>;
  /** Refreshes unresolved configuration and awaits the current driver without sending. */
  settle: () => Promise<void>;
  /** Status for the admin route, the banner and `system_get_mail_status`; cached briefly, `refresh` rebuilds. */
  status: (optional?: { refresh?: boolean }) => Promise<MailStatusReport>;
  /** The safe per-provider configuration DTO (`mail-provider-configuration.ts`). Never a secret. */
  describeProviders: () => Promise<MailProviderConfigurationReport>;
  /** Drops cached provider mailers and the cached status; the next send and read resolve fresh. */
  invalidate: () => void;
  laneReady: (required: { lane: MailDeliveryLane }) => Promise<boolean>;
  senderDomainVerification: SenderDomainVerificationPort;
  /** Whether `id` may be selected: a registered hosted provider whose saved key resolves. Sends nothing. */
  checkProvider: (required: { id: string }) => Promise<MailProviderCheck>;
  /**
   * The DNS records the active transactional provider needs before it sends as the configured
   * sender's domain — the port the DNS tools read (requirements reach DNS only through ports).
   * `null` when no transactional provider is selected, it cannot verify domains, no sender is
   * configured, its key is missing, or `workspaceId` is not this mailer's workspace.
   * @throws Error when the provider answered with a failure (caller-safe message).
   */
  domainRequirements: (required: { workspaceId: string }) => Promise<DomainRequirement | null>;
}

export type MailProviderCheck = { ok: true; label: string } | { ok: false; reason: string };

/** A cached provider mailer and the credential row it was built from (`label` undefined = keyless). */
type ResolvedEntry = { mailer: MailerPort; label?: string; fingerprint: string };

/** Records a provider failure for `lastError`. */
type RecordError = (error: Omit<MailProviderError, "at">) => void;

/** Identifies one saved credential version without decrypting it. */
function rowFingerprint(record: CustomCredentialSetRecord | undefined): string {
  return record ? `${record.id}:${record.vaultRecord?.revision ?? ""}:${record.updatedAt}` : "absent";
}

/** Observe one send or batch without changing results. Any failed recipient keeps the failure;
 * only a wholly accepted operation clears a prior send failure. O(messages) time, O(1) space. */
function observeFailures(required: { mailer: MailerPort; providerId: string; record: RecordError; accepted: () => void }): MailerPort {
  const { mailer, providerId, record, accepted } = required;
  const seen = (results: readonly MailerSendResult[]): void => {
    const failure = results.find(result => !result.ok);
    if (failure && !failure.ok) record({ providerId, source: "send", code: failure.errorCode, message: failure.message });
    else if (results.length > 0) accepted();
  };
  return {
    capabilities: () => mailer.capabilities(),
    send: async (message, options) => { const result = await mailer.send(message, options); seen([result]); return result; },
    sendBatch: async (messages, options) => { const results = await mailer.sendBatch(messages, options); seen(results); return results; },
  };
}

/** A provider's credential, or why it has none. */
type CredentialLookup = { credential: MailAdapterCredential; reason?: undefined } | { credential?: undefined; reason: string };

const CONSOLE_CAPABILITIES: MailerCapabilities = { driver: "console", supportsIdempotencyKey: false, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: true };

/**
 * A mailer that refuses every send. It reports the `console` driver on purpose: availability checks
 * (`isMailDeliveryAvailable`) and the sender resolver treat console as "sends nothing", which is true.
 */
function refusingMailer(required: { errorCode: string; message: string }): MailerPort {
  const result: MailerSendResult = { ok: false, retryable: false, errorCode: required.errorCode, message: required.message };
  return {
    capabilities: () => CONSOLE_CAPABILITIES,
    send: async () => result,
    sendBatch: async (messages) => messages.map(() => result),
  };
}

function unconfiguredMessage(lane: MailDeliveryLane): string {
  return (
    `[mail] no ${lane} mail provider is configured, so this message was NOT sent. Choose one in the admin ` +
    `Mail settings (or ask the assistant to run mail_set_provider) and save its key under Access Tokens ` +
    `(category "${MAIL_CREDENTIAL_CATEGORY}"): SMTP uses "${MAIL_SMTP_CREDENTIAL_LABEL}".`
  );
}

/**
 * Builds the boot-time-resolved, lane-routed `MailerPort`. See this file's header for the rules.
 * @complexity Per send: one setting read; a provider's first send adds one credential lookup.
 */
export function createResolvedMailer(deps: ResolveMailerDeps): ResolvedMailer {
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  const wrap = deps.wrapProviderMailer ?? (({ mailer }) => mailer);
  const resolved = new Map<string, ResolvedEntry>();
  let generation = 0;
  const nowMs = () => (deps.clock ?? { nowMs: () => Date.now() }).nowMs();
  let lastError: MailProviderError | undefined;
  const recordError: RecordError = ({ providerId, source }) => {
    // Every status refresh re-runs the checks. A check note must not hide a failed send.
    if (source === "check" && lastError?.source === "send") return;
    lastError = { providerId, source, message: source === "send" ? "The provider did not confirm acceptance. Check provider configuration." : "The provider configuration check could not complete.", at: new Date(nowMs()).toISOString() };
  };
  const fingerprintFor = async (label: string | undefined): Promise<string> => {
    if (label === undefined) return "";
    const records = await deps.customCredentialRepo.listByWorkspace({ workspaceId: deps.workspaceId });
    return rowFingerprint(records.find((row) => row.label === label));
  };
  const inFlight = new Map<string, Promise<MailerPort>>();
  const warned = new Set<string>();
  let initialization: Promise<MailProviderSetting> | undefined;
  let lastTransactional: MailerPort | undefined;

  const warnOnce = (key: string, message: string): void => {
    if (deps.mode !== "production" || warned.has(key)) return;
    warned.add(key);
    try { warn(message); } catch { /* MailerPort must not throw across the boundary (ADR-024 §3). */ }
  };

  const initialize = async (): Promise<MailProviderSetting> => {
    const setting = initialMailProviderSetting({});
    await deps.providerSetting.write(setting).catch(() =>
      warnOnce("initialization", "[mail] the mail provider setting could not be saved; retrying on the next send"));
    return setting;
  };

  const currentSetting = async (): Promise<MailProviderSetting> => {
    const stored = await deps.providerSetting.read();
    if (stored) return stored;
    initialization ??= initialize().finally(() => { initialization = undefined; });
    return initialization;
  };

  const consoleMailer = async (catalog: MailProviderCatalog): Promise<MailerPort> => {
    const provider = catalog.registry.get({ id: "console" })!.provider;
    const mailer = wrap({ providerId: "console", provider, mailer: createProviderMailer({ deps, provider, credential: { token: "" } }) });
    resolved.set("console", { mailer, fingerprint: "" });
    return mailer;
  };

  /** Local mode keeps working through the console; production refuses. */
  const fallback = async (required: { catalog: MailProviderCatalog; errorCode: string; message: string }): Promise<MailerPort> => {
    if (deps.mode !== "production") return resolved.get("console")?.mailer ?? consoleMailer(required.catalog);
    warnOnce(required.errorCode + required.message, required.message);
    return refusingMailer(required);
  };

  /** The provider's credential, or why there is none (missing, or saved but unusable). */
  const credentialOrReason = async (catalog: MailProviderCatalog, id: string, label: string): Promise<CredentialLookup> => {
    try {
      const credential = await resolveMailCredential({ deps, catalog, id });
      if (credential) return { credential };
    } catch (err) {
      return { reason: credentialFailureReason({ label, err }) };
    }
    return { reason: `has no saved credential "${label}" under Access Tokens (category "${MAIL_CREDENTIAL_CATEGORY}")` };
  };

  /** The catalog names a credential label exactly for the providers that need one (not console). */
  const providerCredential = (catalog: MailProviderCatalog, id: string): Promise<CredentialLookup> => {
    const label = catalog.credentialLabelFor({ id });
    return label === undefined ? Promise.resolve({ credential: { token: "" } }) : credentialOrReason(catalog, id, label);
  };

  const resolveProvider = async (id: string, startedIn: number): Promise<MailerPort> => {
    const catalog = await loadMailProviderCatalog(deps);
    const entry = catalog.registry.get({ id });
    const unavailable = (detail: string) => fallback({ catalog, errorCode: "MAIL_PROVIDER_UNAVAILABLE", message: `[mail] the selected mail provider '${id}' ${detail}, so outbound mail is NOT being sent` });
    if (!entry) return unavailable(`is not installed${catalog.refusals.length > 0 ? ` (${catalog.refusals.join("; ")})` : ""}`);
    // Fingerprint BEFORE reading the key: a rotation racing this read then re-resolves next send.
    // An unreadable store leaves the key lookup below to report why; "unknown" re-resolves once it reads.
    const label = catalog.credentialLabelFor({ id });
    const fingerprint = await fingerprintFor(label).catch(() => "unknown");
    const found = await providerCredential(catalog, id);
    if (!found.credential) return unavailable(found.reason);
    const credential = found.credential;
    const latest = await fingerprintFor(label).catch(() => fingerprint);
    if (latest !== fingerprint) return resolveProvider(id, generation);
    const observed = observeFailures({ mailer: createProviderMailer({ deps, provider: entry.provider, credential }), providerId: id, record: recordError,
      accepted: () => { if (lastError?.source === "send" && lastError.providerId === id) lastError = undefined; } });
    const mailer = wrap({ providerId: id, provider: entry.provider, mailer: observed });
    if (startedIn === generation) resolved.set(id, { mailer, fingerprint, ...(label === undefined ? {} : { label }) });
    return mailer;
  };

  /** Single-flight per provider: the boot resolution and an early send must not build it twice. */
  const resolveOnce = (id: string): Promise<MailerPort> => {
    const existing = inFlight.get(id);
    if (existing) return existing;
    const startedIn = generation;
    const started = resolveProvider(id, startedIn).then((mailer) => startedIn === generation ? mailer : resolveOnce(id))
      .finally(() => { if (inFlight.get(id) === started) inFlight.delete(id); });
    inFlight.set(id, started);
    return started;
  };

  /** The cached mailer while its credential row is unchanged; otherwise a fresh resolution. */
  const currentMailer = async (id: string): Promise<MailerPort> => {
    const entry = resolved.get(id);
    if (!entry) return resolveOnce(id);
    if (entry.label === undefined) return entry.mailer;
    const fingerprint = await fingerprintFor(entry.label).catch(() => entry.fingerprint);
    if (fingerprint === entry.fingerprint) return entry.mailer;
    if (resolved.get(id) === entry) resolved.delete(id);
    return resolveOnce(id);
  };

  const mailerForLane = async (lane: MailDeliveryLane): Promise<MailerPort> => {
    const id = (await currentSetting())[lane];
    const mailer = id === null
      ? await fallback({ catalog: await loadMailProviderCatalog(deps), errorCode: "MAIL_UNCONFIGURED", message: unconfiguredMessage(lane) })
      : await currentMailer(id);
    if (lane === "transactional") lastTransactional = mailer;
    return mailer;
  };

  /** Never rejects: a settings or catalog fault becomes a refusal, not a throw across the port. */
  const forLane = (lane: MailDeliveryLane): Promise<MailerPort> =>
    mailerForLane(lane).catch((err: unknown) => refusingMailer({ errorCode: "MAIL_PROVIDER_UNAVAILABLE", message: "Mail provider selection failed; check configuration." }));

  const ready = forLane("transactional").then(() => undefined);

  const mailer: MailerPort = {
    capabilities: () => {
      if (lastTransactional === undefined) void forLane("transactional");
      return (lastTransactional ?? { capabilities: () => CONSOLE_CAPABILITIES }).capabilities();
    },
    send: async (message, options) => (await forLane(laneForPurpose({ purpose: options.purpose }))).send(message, options),
    sendBatch: async (messages, options) => (await forLane(laneForPurpose({ purpose: options.purpose }))).sendBatch(messages, options),
  };

  // The resolver owns provider selection and credential resolution for both status and DNS.
  const resolveDomainReadCredential: MailDomainReadCredentialPort = ({ id }) => resolveMailDomainReadCredential({ deps, id });
  const senderDomainVerification = createSenderDomainVerification({
    workspaceId: deps.workspaceId, httpClient: deps.httpClient,
    findProvider: async ({ id }) => (await loadMailProviderCatalog(deps)).registry.get({ id })?.provider,
    resolveCredential: async ({ id }) => resolveMailCredential({ deps, catalog: await loadMailProviderCatalog(deps), id }),
    resolveDomainReadCredential,
    readProviderId: async () => (await currentSetting()).transactional,
    readSenderEmail: async () => deps.readSenderEmail ? deps.readSenderEmail() : undefined,
  });
  const statusCache = createTtlCache({
    load: () => computeStatusReport({ deps, setting: currentSetting, recordError, nowMs, senderDomainVerification }),
    ttlMs: deps.statusTtlMs ?? MAIL_STATUS_TTL_MS, nowMs,
  }, { minRefreshIntervalMs: 5_000 });
  const status = async (optional: { refresh?: boolean } = {}): Promise<MailStatusReport> => {
    const report = await statusCache.get(optional);
    // A saved key proves configuration, not sending. A later accepted send clears this failure.
    const sendFailed = lastError?.source === "send" && report.lanes.some(lane => lane.providerId === lastError?.providerId);
    return lastError ? { ...report, state: sendFailed && report.state === "ready" ? "degraded" : report.state, lastError } : report;
  };
  const describeProviders = async (): Promise<MailProviderConfigurationReport> => {
    const [setting, catalog, records] = await Promise.all([currentSetting(), loadMailProviderCatalog(deps), deps.customCredentialRepo.listByWorkspace({ workspaceId: deps.workspaceId })]);
    return describeMailProviders({ catalog, records, setting });
  };
  const invalidate = (): void => {
    generation += 1;
    inFlight.clear();
    resolved.clear();
    lastTransactional = undefined;
    statusCache.invalidate();
  };
  const checkProvider = async ({ id }: { id: string }): Promise<MailProviderCheck> => {
    const catalog = await loadMailProviderCatalog(deps);
    const provider = catalog.registry.get({ id })?.provider;
    if (!provider) return { ok: false, reason: `'${id}' is not an installed mail provider (installed: ${catalog.registry.list().map((entry) => entry.id).join(", ")})` };
    if (!provider.capabilities.hosted) return { ok: false, reason: `'${id}' only prints mail locally and never delivers it` };
    const found = await providerCredential(catalog, id);
    return found.credential ? { ok: true, label: provider.label } : { ok: false, reason: `'${id}' ${found.reason}` };
  };
  const domainRequirements = async ({ workspaceId }: { workspaceId: string }): Promise<DomainRequirement | null> => {
    if (workspaceId !== deps.workspaceId) return null;
    const [setting, catalog, domain] = await Promise.all([currentSetting(), loadMailProviderCatalog(deps), readSenderDomain(deps)]);
    const id = setting.transactional;
    const provider = id === null ? undefined : catalog.registry.get({ id })?.provider;
    if (!domain || !provider?.capabilities.domainVerification) return null;
    const { credential } = await providerCredential(catalog, id!);
    return credential ? requestDomainRequirements({ ctx: callContext(deps, credential), providerId: id!, provider, domain, resolveDomainReadCredential }, { timeoutMs: deps.domainRequirementsTimeoutMs }) : null;
  };
  return { senderDomainVerification, laneReady: async ({ lane }) => (await forLane(lane)).capabilities().driver !== "console", mailer, ready, settle: async () => { await forLane("transactional"); }, status, describeProviders, invalidate, checkProvider, domainRequirements };
}

/** The configured sender's domain, lower-cased; undefined when unset or unreadable. */
async function readSenderDomain(deps: ResolveMailerDeps): Promise<string | undefined> {
  const email = await deps.readSenderEmail?.().catch(() => undefined);
  return email?.split("@")[1]?.trim().toLowerCase() || undefined;
}

/** A provider call acting for this workspace with its resolved key and Tovu's guarded client. */
function callContext(deps: ResolveMailerDeps, credential: MailAdapterCredential): MailProviderCallContext {
  const httpClient = deps.httpClient as unknown as MailProviderCallContext["httpClient"];
  return { workspaceId: deps.workspaceId, mode: "live", credential, httpClient };
}

/** A domain read with the same account fallback as status; failures stay caller-safe. @complexity At most two calls. */
async function requestDomainRequirements(
  required: { ctx: MailProviderCallContext; providerId: string; provider: MailProviderModule; domain: string; resolveDomainReadCredential?: MailDomainReadCredentialPort },
  optional: { timeoutMs?: number } = {},
): Promise<DomainRequirement> {
  const { ctx, providerId, provider, domain } = required;
  // `domainVerification` is true exactly when the module implements domainRequirements (registry-validated).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("The mail provider could not list its required DNS records.")), optional.timeoutMs ?? 5_000);
  });
  try {
    const result = await Promise.race([readMailDomain({ ctx, providerId, read: context => provider.domainRequirements!(context, { domain }), resolveDomainReadCredential: required.resolveDomainReadCredential }), timeout]);
    if (result.status === "ok") return result.value;
    throw new ToolInputError({ message: safeMailProviderText({ text: `${result.error.code}: ${result.error.message}` }, { secrets: credentialSecrets({ credential: ctx.credential }) }) });
  } finally { clearTimeout(timer); }
}

/** Lane providers' credentials, looked up in parallel; a failed lookup is recorded and counts as none. @complexity O(lanes) lookups. */
async function laneCredentials(
  required: { deps: ResolveMailerDeps; catalog: MailProviderCatalog; setting: MailProviderSetting; recordError: RecordError }
): Promise<Map<string, MailAdapterCredential>> {
  const { deps, catalog, setting, recordError } = required;
  const ids = [...new Set([setting.transactional, setting.bulk].filter((id): id is string => id !== null))];
  const lookup = (id: string) => resolveMailCredential({ deps, catalog, id }).catch((err: unknown) => {
    // Only a provider with a label reaches the store, so the label is defined whenever this throws.
    recordError({ providerId: id, source: "check", message: credentialFailureReason({ label: catalog.credentialLabelFor({ id })!, err }) });
    return null;
  });
  const found = await Promise.all(ids.map(async (id) => [id, await lookup(id)] as const));
  return new Map(found.filter((pair): pair is readonly [string, MailAdapterCredential] => pair[1] !== null));
}

async function computeStatusReport(
  required: { deps: ResolveMailerDeps; setting: () => Promise<MailProviderSetting>; recordError: RecordError; nowMs: () => number; senderDomainVerification: SenderDomainVerificationPort }
): Promise<MailStatusReport> {
  const { deps, recordError } = required;
  const checkedAt = new Date(required.nowMs()).toISOString();
  const records = deps.customCredentialRepo.listByWorkspace({ workspaceId: deps.workspaceId }).catch((err: unknown) => {
    recordError({ providerId: null, source: "check", message: `the saved mail credentials could not be listed (${err instanceof Error ? err.message : String(err)})` });
    return [] as CustomCredentialSetRecord[];
  });
  // Independent reads run together; only the domain check waits, for the transactional key.
  const [setting, catalog, rows, domain] = await Promise.all([required.setting(), loadMailProviderCatalog(deps), records, readSenderDomain(deps)]);
  const credentials = await laneCredentials({ deps, catalog, setting, recordError });
  const verdict = await required.senderDomainVerification();
  // `null` is "no sender address is set". An unanswered domain check (e.g. a send-only key) has no warning
  // of its own, so it stays undefined rather than telling a verified site its sender is missing.
  const domainState = verdict.state === "no_sender" ? null : ["verified", "pending", "failed", "not_found"].includes(verdict.state) ? verdict.state as MailDomainState : undefined;
  if (verdict.state === "unknown") recordError({ providerId: verdict.providerId, source: "check", message: "Provider domain check unavailable." });
  const status = computeMailStatus(
    { setting, registry: catalog.registry, hasCredential: (id) => credentials.has(id) },
    domainState === undefined ? {} : { senderDomainState: domainState },
  );
  const { providers } = describeMailProviders({ catalog, records: rows, setting });
  return { ...status, providers, refusals: catalog.refusals, checkedAt, senderDomainVerification: verdict };
}
