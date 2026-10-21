import type { UUID } from "@jini-ai/core/primitives";
import {
  computeMailStatus,
  initialMailProviderSetting,
  laneForPurpose,
  parseSmtpEndpoint as parseJiniSmtpEndpoint,
  type MailDeliveryLane,
  type MailDomainState,
  type MailProviderModule,
  type MailProviderSetting,
} from "@jini-ai/platform/mail";

import type { RuntimeMode } from "#src/contracts/core/runtime-mode";
import type { MailerCapabilities, MailerPort, MailerSendResult } from "#src/platform/mail/index";
import type { MailStatusReport } from "#src/platform/mail/mail-status";
import {
  createProviderMailer,
  credentialFailureReason,
  detectEffectiveMailProvider,
  loadMailProviderCatalog,
  MAIL_CREDENTIAL_CATEGORY,
  MAIL_SMTP_CREDENTIAL_LABEL,
  resolveMailCredential,
  type MailProviderCatalog,
  type MailProviderCatalogDeps,
} from "./mail-provider-catalog.js";

export { MAIL_SMTP_CREDENTIAL_LABEL } from "./mail-provider-catalog.js";
export type { MailStatusReport } from "#src/platform/mail/mail-status";

/**
 * @file Boot-time `MailerPort` selection — owner decision, 2026-08-31: build both a hosted-API
 * and an SMTP adapter, default to the hosted API, and never let an unconfigured mailer fail
 * silently. 2026-09-29: hosted-API providers moved out of core into Agent Plugins.
 *
 * **Explicit selection (email provider contract v1, 2026-10-21).** The provider is no longer "the
 * first plugin whose credential resolves, then SMTP, then Console". Each delivery lane reads the
 * site setting `core.mail.provider` = `{transactional, bulk}` (`features/settings/mail-provider.ts`)
 * and looks the id up in the keyed provider catalog (`mail-provider-catalog.ts`: Jini's `smtp` and
 * `console` built-ins plus plugin providers). FIRST BOOT: while the setting was never stored, the old
 * chain runs once and its pick is written through Jini `initialMailProviderSetting` (console/none →
 * `null` = `unconfigured`), so a live site never silently switches provider. A mail credential whose
 * plugin is not installed yet (first boot after an upgrade) defers that write, so the next send
 * retries instead of pinning `unconfigured`. After that, only the setting decides.
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
}


export interface ResolvedMailer {
  /** Safe to use immediately; each send awaits its lane's resolution. */
  mailer: MailerPort;
  /** Resolves once the boot-time migration + transactional resolution settle (a test seam). */
  ready: Promise<void>;
  /** Refreshes unresolved configuration and awaits the current driver without sending. */
  settle: () => Promise<void>;
  /** Fresh status for the admin route, the banner and `system_get_mail_status`. */
  status: () => Promise<MailStatusReport>;
}

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
  const resolved = new Map<string, MailerPort>();
  const inFlight = new Map<string, Promise<MailerPort>>();
  const warned = new Set<string>();
  let migration: Promise<MailProviderSetting> | undefined;
  let lastTransactional: MailerPort | undefined;

  const warnOnce = (key: string, message: string): void => {
    if (deps.mode !== "production" || warned.has(key)) return;
    warned.add(key);
    try { warn(message); } catch { /* MailerPort must not throw across the boundary (ADR-024 §3). */ }
  };

  const migrate = async (): Promise<MailProviderSetting> => {
    const catalog = await loadMailProviderCatalog(deps);
    const detected = await detectEffectiveMailProvider({ deps, catalog }).catch(() => ({ providerId: null, pending: true, reasons: [] }));
    const setting = initialMailProviderSetting({}, { effectiveProviderId: detected.providerId, registry: catalog.registry });
    if (detected.pending) return setting;
    await deps.providerSetting.write(setting).catch((err: unknown) =>
      warnOnce("migration", `[mail] the mail provider setting could not be saved (${err instanceof Error ? err.message : String(err)}); retrying on the next send`));
    return setting;
  };

  const currentSetting = async (): Promise<MailProviderSetting> => {
    const stored = await deps.providerSetting.read();
    if (stored) return stored;
    migration ??= migrate().finally(() => { migration = undefined; });
    return migration;
  };

  const consoleMailer = async (catalog: MailProviderCatalog): Promise<MailerPort> => {
    const provider = catalog.registry.get({ id: "console" })!.provider;
    const mailer = wrap({ providerId: "console", provider, mailer: createProviderMailer({ deps, provider, credential: { token: "" } }) });
    resolved.set("console", mailer);
    return mailer;
  };

  /** Local mode keeps working through the console; production refuses. */
  const fallback = async (required: { catalog: MailProviderCatalog; errorCode: string; message: string }): Promise<MailerPort> => {
    if (deps.mode !== "production") return resolved.get("console") ?? consoleMailer(required.catalog);
    warnOnce(required.errorCode + required.message, required.message);
    return refusingMailer(required);
  };

  /** The provider's credential, or why there is none (missing, or saved but unusable). */
  const credentialOrReason = async (catalog: MailProviderCatalog, id: string, label: string) => {
    try {
      const credential = await resolveMailCredential({ deps, catalog, id });
      if (credential) return { credential };
    } catch (err) {
      return { reason: credentialFailureReason({ label, err }) };
    }
    return { reason: `has no saved credential "${label}" under Access Tokens (category "${MAIL_CREDENTIAL_CATEGORY}")` };
  };

  const resolveProvider = async (id: string): Promise<MailerPort> => {
    const catalog = await loadMailProviderCatalog(deps);
    const entry = catalog.registry.get({ id });
    const unavailable = (detail: string) => fallback({ catalog, errorCode: "MAIL_PROVIDER_UNAVAILABLE", message: `[mail] the selected mail provider '${id}' ${detail}, so outbound mail is NOT being sent` });
    if (!entry) return unavailable(`is not installed${catalog.refusals.length > 0 ? ` (${catalog.refusals.join("; ")})` : ""}`);
    // The catalog names a credential label exactly for the providers that need one (not console).
    const label = catalog.credentialLabelFor({ id });
    const found = label === undefined ? { credential: { token: "" } } : await credentialOrReason(catalog, id, label);
    if (!found.credential) return unavailable(found.reason);
    const credential = found.credential;
    const mailer = wrap({ providerId: id, provider: entry.provider, mailer: createProviderMailer({ deps, provider: entry.provider, credential }) });
    resolved.set(id, mailer);
    return mailer;
  };

  /** Single-flight per provider: the boot resolution and an early send must not build it twice. */
  const resolveOnce = (id: string): Promise<MailerPort> => {
    const existing = inFlight.get(id);
    if (existing) return existing;
    const started = resolveProvider(id).finally(() => inFlight.delete(id));
    inFlight.set(id, started);
    return started;
  };

  const mailerForLane = async (lane: MailDeliveryLane): Promise<MailerPort> => {
    const id = (await currentSetting())[lane];
    const mailer = id === null
      ? await fallback({ catalog: await loadMailProviderCatalog(deps), errorCode: "MAIL_UNCONFIGURED", message: unconfiguredMessage(lane) })
      : resolved.get(id) ?? await resolveOnce(id);
    if (lane === "transactional") lastTransactional = mailer;
    return mailer;
  };

  /** Never rejects: a settings or catalog fault becomes a refusal, not a throw across the port. */
  const forLane = (lane: MailDeliveryLane): Promise<MailerPort> =>
    mailerForLane(lane).catch((err: unknown) => refusingMailer({ errorCode: "MAIL_PROVIDER_UNAVAILABLE", message: `mail provider selection failed (${err instanceof Error ? err.message : String(err)})` }));

  const ready = forLane("transactional").then(() => undefined);

  const mailer: MailerPort = {
    capabilities: () => {
      if (lastTransactional === undefined) void forLane("transactional");
      return (lastTransactional ?? { capabilities: () => CONSOLE_CAPABILITIES }).capabilities();
    },
    send: async (message, options) => (await forLane(laneForPurpose({ purpose: options.purpose }))).send(message, options),
    sendBatch: async (messages, options) => (await forLane(laneForPurpose({ purpose: options.purpose }))).sendBatch(messages, options),
  };

  const status = (): Promise<MailStatusReport> => computeStatusReport({ deps, setting: currentSetting });
  return { mailer, ready, settle: async () => { await forLane("transactional"); }, status };
}

/** Lane providers whose credential resolves. @complexity O(lanes) lookups. */
async function credentialedProviders(required: { deps: ResolveMailerDeps; catalog: MailProviderCatalog; setting: MailProviderSetting }): Promise<Set<string>> {
  const { deps, catalog, setting } = required;
  const ids = new Set([setting.transactional, setting.bulk].filter((id): id is string => id !== null));
  const found = new Set<string>();
  for (const id of ids) {
    const credential = await resolveMailCredential({ deps, catalog, id }).catch(() => null);
    if (credential) found.add(id);
  }
  return found;
}

/**
 * The sender domain's state at the transactional provider: `null` = no sender configured
 * (`sender_unknown`); undefined = the provider cannot verify domains or the check failed.
 * @complexity At most one provider call.
 */
async function senderDomainState(
  required: { deps: ResolveMailerDeps; catalog: MailProviderCatalog; providerId: string | null; credentialed: Set<string> }
): Promise<MailDomainState | null | undefined> {
  const { deps, catalog, providerId } = required;
  const email = await deps.readSenderEmail?.().catch(() => undefined);
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  const provider = providerId === null ? undefined : catalog.registry.get({ id: providerId })?.provider;
  if (!provider?.domainStatus || !required.credentialed.has(providerId!)) return undefined;
  const credential = await resolveMailCredential({ deps, catalog, id: providerId! });
  const httpClient = deps.httpClient as unknown as Parameters<NonNullable<MailProviderModule["domainStatus"]>>[0]["httpClient"];
  const result = await provider.domainStatus({ workspaceId: deps.workspaceId, mode: "live", credential: credential!, httpClient }, { domain }).catch(() => undefined);
  return result?.status === "ok" ? result.value.state : undefined;
}

async function computeStatusReport(required: { deps: ResolveMailerDeps; setting: () => Promise<MailProviderSetting> }): Promise<MailStatusReport> {
  const { deps } = required;
  const [setting, catalog] = await Promise.all([required.setting(), loadMailProviderCatalog(deps)]);
  const credentialed = await credentialedProviders({ deps, catalog, setting });
  const domainState = await senderDomainState({ deps, catalog, providerId: setting.transactional, credentialed });
  const status = computeMailStatus(
    { setting, registry: catalog.registry, hasCredential: (id) => credentialed.has(id) },
    domainState === undefined ? {} : { senderDomainState: domainState },
  );
  const providers = catalog.registry.list().map((entry) => ({ id: entry.id, label: entry.provider.label, hosted: entry.provider.capabilities.hosted, origin: entry.origin }));
  return { ...status, providers, refusals: catalog.refusals };
}
