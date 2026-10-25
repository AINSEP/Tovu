import type { UUID } from "@jini-ai/core/primitives";
import type { DomainRequirement } from "@jini-ai/core/provider-registry";
import {
  createResolvedMailer as createJiniResolvedMailer,
  parseSmtpEndpoint as parseJiniSmtpEndpoint,
  type MailCredentialFact,
  type MailDeliveryLane,
  type MailProviderCallContext,
  type MailProviderCheck,
  type MailProviderModule,
  type MailProviderSetting,
} from "@jini-ai/platform/mail";

import type { RuntimeMode } from "#src/contracts/core/runtime-mode";
import type { MailerPort } from "#src/platform/mail/index";
import type { MailProviderConfigurationReport, MailStatusReport } from "#src/platform/mail/mail-status";
import type { SenderDomainVerificationPort } from "#src/platform/mail/sender-domain-verification";
import { toJiniMailer, toTovuMailer } from "#src/platform/mail/purpose-scoped-mailer";
import { describeMailProviders } from "./mail-provider-configuration.js";
import {
  createProviderMailer,
  credentialFailureReason,
  loadMailProviderCatalog,
  MAIL_CREDENTIAL_CATEGORY,
  MAIL_SMTP_CREDENTIAL_LABEL,
  resolveMailCredential,
  resolveMailDomainReadCredential,
  type MailProviderCatalogDeps,
} from "./mail-provider-catalog.js";

export { MAIL_SMTP_CREDENTIAL_LABEL } from "./mail-provider-catalog.js";
export type { MailStatusReport } from "#src/platform/mail/mail-status";

/**
 * @file Tovu binding to Jini's boot-time `MailerPort` selection. Hosted-API providers live in
 * Agent Plugins; SMTP and Console are built-ins. An unconfigured mailer never fails silently.
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

export type { MailProviderCheck } from "@jini-ai/platform/mail";

/** Tovu's recovery copy, kept outside the generic engine. */
function unconfiguredMessage({ lane }: { lane: MailDeliveryLane }): string {
  return (
    `[mail] no ${lane} mail provider is configured, so this message was NOT sent. Choose one in the admin ` +
    `Mail settings (or ask the assistant to run mail_set_provider) and save its key under Access Tokens ` +
    `(category "${MAIL_CREDENTIAL_CATEGORY}"): SMTP uses "${MAIL_SMTP_CREDENTIAL_LABEL}".`
  );
}

/** Project vault metadata into Jini's fingerprint facts without decrypting or copying the row.
 * Fingerprint BEFORE reading the key: Jini owns metadata → key → metadata ordering and retries.
 * An unreadable store leaves key lookup to report why; cached mailers survive metadata faults.
 * @complexity O(c) credential rows from one workspace list; O(1) extra space.
 */
async function readCredentialFact(
  required: { deps: ResolveMailerDeps; label: string },
): Promise<MailCredentialFact | undefined> {
  const { deps, label } = required;
  const rows = await deps.customCredentialRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  const record = rows.find(row => row.label === label);
  return record ? { id: record.id, label: record.label, updatedAt: record.updatedAt, vaultRevision: record.vaultRecord?.revision } : undefined;
}

/**
 * Bind host settings, vault, catalog and plugin ABI to the single Jini mail engine.
 * Public controls retain their original shape, including invalidate on every core.mail write.
 * @complexity O(1) binding; per send Jini reads selection and credential metadata.
 * @example const resolved = createResolvedMailer(deps); await resolved.ready;
 */
export function createResolvedMailer(deps: ResolveMailerDeps): ResolvedMailer {
  // Plugins still call httpClient.send(request). Jini only passes this client through to them.
  const httpClient = deps.httpClient as unknown as MailProviderCallContext["httpClient"];
  const wrap = deps.wrapProviderMailer;
  const resolved = createJiniResolvedMailer({
    workspaceId: deps.workspaceId,
    mode: deps.mode,
    providerSetting: { read: () => deps.providerSetting.read(), write: ({ setting }) => deps.providerSetting.write(setting) },
    credentials: {
      readFact: ({ label }) => readCredentialFact({ deps, label }),
      resolve: ({ catalog, id }) => resolveMailCredential({ deps, catalog, id }),
    },
    // The configuration projection still needs Tovu's row (e.g. SMTP username presence).
    listCredentialFacts: () => deps.customCredentialRepo.listByWorkspace({ workspaceId: deps.workspaceId }),
    loadCatalog: () => loadMailProviderCatalog(deps),
    httpClient,
    createProviderMailer: ({ provider, credential }) => toJiniMailer({ mailer: createProviderMailer({ deps, provider, credential }) }),
    describeProviders: describeMailProviders,
    unconfiguredMessage,
    missingCredentialReason: ({ label }) => `has no saved credential "${label}" under Access Tokens (category "${MAIL_CREDENTIAL_CATEGORY}")`,
    credentialFailureReason,
  }, {
    wrapProviderMailer: wrap ? ({ mailer, ...provider }) => toJiniMailer({ mailer: wrap({ ...provider, mailer: toTovuMailer({ mailer }) }) }) : undefined,
    readSenderEmail: deps.readSenderEmail,
    resolveDomainReadCredential: ({ id }) => resolveMailDomainReadCredential({ deps, id }),
    warn: deps.warn,
    clock: deps.clock,
    statusTtlMs: deps.statusTtlMs,
    domainRequirementsTimeoutMs: deps.domainRequirementsTimeoutMs,
  });
  return { ...resolved, mailer: toTovuMailer({ mailer: resolved.mailer }) };
}
