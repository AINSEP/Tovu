import { createMailCatalog, type MailProviderCatalog } from "@jini-ai/agent-plugins/lifecycle/mail";
import { createProviderMailer as createEngineProviderMailer } from "@jini-ai/platform/mail";
import { credentialSecrets, safeMailProviderText } from "#src/platform/mail/index";
import type { UUID } from "@jini-ai/core/primitives";
import type { HttpClientPort as JiniHttpClientPort } from "@jini-ai/core/primitives";
import {
  createConsoleMailProvider,
  createMailProviderRegistry,
  createSmtpMailProvider,
  type MailAdapterCredential,
  type MailProviderModule,
  type MailProviderRegistry,
} from "@jini-ai/platform/mail";

import {
  resolveCustomCredentialByLabel,
  CustomCredentialSecretStoreUnconfiguredError,
  type CustomCredentialSetRepoPort,
} from "#src/features/custom-credentials/index";
import type { PluginCredentialCard } from "../../../contracts/core/plugin-credential-card.js";
import type { SecretSealerPort } from "#src/features/webhooks/index";
import { contributeMailProviders, type MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { defaultMailProviderSetup } from "#src/features/agent-plugins/mail-provider-setup";
import type { MailProviderSetup } from "#src/platform/mail/index";
import type { HttpClientPort } from "#src/platform/http/index";
import {
  createNodemailerSmtpTransport,
  type CreateNodemailerSmtpTransportConfig,
  type MailerPort,
  type SmtpTransport,
} from "#src/platform/mail/index";
import { toTovuMailer } from "#src/platform/mail/index";

/**
 * @file The keyed mail-provider catalog `resolve-mailer.ts` selects from (email provider contract v1,
 * 2026-10-21): Jini's built-in `smtp` (over Tovu's nodemailer transport) and `console`, plus every
 * plugin provider offered through Jini's registry, so plugin refusals surface instead of vanishing.
 *
 * Credentials still live in `custom_credential_sets` under a well-known label per provider (see
 * `resolve-mailer.ts`'s header): SMTP under {@link MAIL_SMTP_CREDENTIAL_LABEL}, a plugin under its
 * descriptor's `credentialLabel`. Deliberately under `server/runtime/boot/` for the same Tier-2/Tier-3
 * reason `resolve-mailer.ts` documents: it imports `features/custom-credentials` at runtime.
 */

/** Custom-credential category (`features/custom-credentials/types.ts`'s closed set) mail
 *  credentials are filed under — outbound-mail delivery is operational infrastructure. */
export const MAIL_CREDENTIAL_CATEGORY = "ops";

/** Exact `custom_credential_sets.label` an operator must use for the SMTP provider. */
export const MAIL_SMTP_CREDENTIAL_LABEL = "Tovu Mail — SMTP Server";

/**
 * The SMTP protocol's setup form (core: SMTP is a protocol, not a vendor — owner decision
 * 2026-10-22). A vendor's SMTP host/port preset belongs in that vendor's plugin. `baseUrl` packs
 * `host:port` behind an `https://` prefix — see `resolve-mailer.ts`'s header for the encoding.
 */
export const SMTP_PROVIDER_SETUP: MailProviderSetup = { fields: [
  { key: "baseUrl", label: "SMTP server", type: "url", required: true, placeholder: "https://smtp.example.com:465", help: "Host and port after https://. Ports 465 and 443 use implicit TLS; any other port uses STARTTLS." },
  { key: "username", label: "Username", type: "text", required: true },
  { key: "token", label: "Password", type: "secret", required: true },
] };

export interface MailProviderCatalogDeps {
  workspaceId: UUID;
  customCredentialRepo: CustomCredentialSetRepoPort;
  sealer: SecretSealerPort;
  /** Tovu's guarded outbound-HTTP seam (ADR-038), handed to plugin providers. */
  httpClient: HttpClientPort;
  /** This workspace's plugin-contributed mail adapters (`loadMailAdapterRegistry` in production). */
  loadMailAdapters: () => Promise<MailAdapterRegistry>;
  /** Reads only the named plugin's own enabled static account connection in this workspace. */
  resolvePluginAccountToken?: (required: { pluginId: string; serverId: string }) => Promise<string | null>;
  /** Injected for tests; defaults to the real `createNodemailerSmtpTransport`. */
  createSmtpTransport?: (config: CreateNodemailerSmtpTransportConfig) => SmtpTransport;
  /** Console provider output; defaults to `console.log`. */
  log?: (line: string) => void;
}

export type { MailProviderCatalog } from "@jini-ai/agent-plugins/lifecycle/mail";
const catalogOperations = createMailCatalog({
 mailEngine: { createRegistry: createMailProviderRegistry, builtins: { console: createConsoleMailProvider, smtp: createSmtpMailProvider } },
 mailHostText: { smtpCredentialLabel: MAIL_SMTP_CREDENTIAL_LABEL, smtpSetup: SMTP_PROVIDER_SETUP, credentialCategory: MAIL_CREDENTIAL_CATEGORY },
 defaultSetup: defaultMailProviderSetup, contributeMailProviders,
});
function catalogDeps(deps: MailProviderCatalogDeps) { return { ...deps, createSmtpTransport: deps.createSmtpTransport ?? createNodemailerSmtpTransport }; }
export const loadMailProviderCatalog = (deps: MailProviderCatalogDeps, _optional: Record<string,never> = {}) => catalogOperations.loadMailProviderCatalog(catalogDeps(deps));
export const loadMailCredentialCards = (required: Pick<MailProviderCatalogDeps,"loadMailAdapters">, _optional: Record<string,never> = {}) => catalogOperations.loadMailCredentialCards(required);
export const resolveMailDomainReadCredential = (required: { deps: MailProviderCatalogDeps; id: string }, _optional: Record<string,never> = {}) => catalogOperations.resolveMailDomainReadCredential({ ...required, deps: catalogDeps(required.deps) });
/**
 * The saved credential for one provider; `null` = not configured. SMTP without a username is not
 * configured: this store cannot represent unauthenticated relay (`token` is required).
 * @throws CustomCredentialSecretStoreUnconfiguredError (decrypt failure) and repo faults.
 * @complexity One credential list + one decrypt.
 */
export async function resolveMailCredential(
  required: { deps: MailProviderCatalogDeps; catalog: MailProviderCatalog; id: string },
  _optional: Record<string, never> = {}
): Promise<MailAdapterCredential | null> {
  const { deps, catalog, id } = required;
  const label = catalog.credentialLabelFor({ id });
  if (label === undefined) return null;
  const resolved = await resolveCustomCredentialByLabel({ repo: deps.customCredentialRepo, sealer: deps.sealer }, { workspaceId: deps.workspaceId, label });
  if (!resolved) return null;
  const username = resolved.connection.username;
  if (id === "smtp" && !username) return null;
  return { token: resolved.connection.token, baseUrl: resolved.baseUrl, ...(username ? { username } : {}) };
}

/** Caller-safe credential refusal. Raw store/decrypt error text must never leave this boundary. */
export function credentialFailureReason(required: { label: string; err: unknown }, optional: { log?: (line: string, error: unknown) => void } = {}): string {
  const { label, err } = required;
  try { (optional.log ?? console.error)("[mail] credential lookup failed", err); } catch { /* Diagnostics cannot replace the caller-safe refusal. */ }
  return err instanceof CustomCredentialSecretStoreUnconfiguredError
    ? `the "${label}" credential is saved but could not be decrypted`
    : `the "${label}" credential could not be read`;
}

/** Bind the guarded host HTTP port and preserve the existing positional mailer API. */
export function createProviderMailer(required: { deps: MailProviderCatalogDeps; provider: MailProviderModule; credential: MailAdapterCredential }, _optional: Record<string, never> = {}): MailerPort {
  return toTovuMailer({ mailer: createEngineProviderMailer({ provider: required.provider, credential: required.credential,
    httpClient: { send: ({ request }, optional) => required.deps.httpClient.send(request, optional) } }) });
}
