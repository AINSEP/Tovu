import { credentialSecrets, safeMailProviderText } from "#src/platform/mail/provider-error";
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
import type { PluginCredentialCard } from "#src/features/custom-credentials/plugin-credential-card";
import type { SecretSealerPort } from "#src/features/webhooks/index";
import { contributeMailProviders, type MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { defaultMailProviderSetup } from "#src/features/agent-plugins/mail-provider-setup";
import type { MailProviderSetup } from "#src/platform/mail/mail-status";
import type { HttpClientPort } from "#src/platform/http/index";
import {
  createNodemailerSmtpTransport,
  type CreateNodemailerSmtpTransportConfig,
  type MailerPort,
  type SmtpTransport,
} from "#src/platform/mail/index";
import { toTovuMailer } from "#src/platform/mail/purpose-scoped-mailer";

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
  /** Injected for tests; defaults to the real `createNodemailerSmtpTransport`. */
  createSmtpTransport?: (config: CreateNodemailerSmtpTransportConfig) => SmtpTransport;
  /** Console provider output; defaults to `console.log`. */
  log?: (line: string) => void;
}

export interface MailProviderCatalog {
  readonly registry: MailProviderRegistry;
  /** Plugin provider ids in registry order (plugin id, then declaration order). */
  readonly pluginIds: readonly string[];
  /** Saved-credential label per provider; undefined for a provider that needs none (console, or a
   *  plugin declaring no credential keys) and for an id that is not registered. */
  credentialLabelFor(required: { id: string }): string | undefined;
  /** Plugin adapters/providers that were not loaded, and why (log-safe). */
  readonly refusals: readonly string[];
  /** The provider's declarative setup form; no fields for one that needs no saved key. */
  setupFor(required: { id: string }): MailProviderSetup;
}

function builtins(deps: MailProviderCatalogDeps): MailProviderModule[] {
  const clock = { nowMs: () => Date.now() };
  const createTransport = deps.createSmtpTransport ?? createNodemailerSmtpTransport;
  // Tovu's transport takes the payload positionally; Jini's SMTP adapter calls it with `{mail}`.
  const smtp = createSmtpMailProvider({ clock, createTransport: (config) => {
    const transport = createTransport(config);
    return { sendMail: ({ mail }) => transport.sendMail(mail) };
  } });
  return [smtp, createConsoleMailProvider({ clock }, deps.log ? { log: deps.log } : {})];
}

/** Plugin registry, or an empty one plus the reason it could not be read. */
async function loadAdapters(deps: Pick<MailProviderCatalogDeps, "loadMailAdapters">): Promise<MailAdapterRegistry> {
  try {
    return await deps.loadMailAdapters();
  } catch (err) {
    return { list: () => [], refusals: [`the plugin mail adapters could not be listed (${err instanceof Error ? err.message : String(err)})`] };
  }
}

/**
 * Builds the catalog fresh (plugins can be installed after boot). Never throws for a plugin fault.
 * @complexity O(a) plugin adapters.
 */
export async function loadMailProviderCatalog(deps: MailProviderCatalogDeps, _optional: Record<string, never> = {}): Promise<MailProviderCatalog> {
  const registry = createMailProviderRegistry({}, { builtins: builtins(deps) });
  const adapters = await loadAdapters(deps);
  const { accepted, refusals } = contributeMailProviders({ registry, adapters });
  const labels = new Map<string, string>([["smtp", MAIL_SMTP_CREDENTIAL_LABEL]]);
  const setups = new Map<string, MailProviderSetup>([["smtp", SMTP_PROVIDER_SETUP]]);
  for (const adapter of adapters.list()) {
    // Only providers that read a credential get a label; label presence is "needs a saved key".
    const keys = adapter.descriptor.credentialKeys ?? ["token"];
    if (!accepted.includes(adapter.descriptor.id) || keys.length === 0) continue;
    labels.set(adapter.descriptor.id, adapter.descriptor.credentialLabel);
    setups.set(adapter.descriptor.id, adapter.descriptor.setup ?? defaultMailProviderSetup({ credentialKeys: keys }));
  }
  return { registry, pluginIds: accepted, refusals, credentialLabelFor: ({ id }) => labels.get(id), setupFor: ({ id }) => setups.get(id) ?? { fields: [] } };
}

/**
 * The key cards mail plugins declare (`credentialCard` in their descriptor), each filed under the
 * adapter's own credential label and the mail category, so `credential_save` `{kind:"plugin-provider"}`
 * saves the key exactly where the adapter reads it. Never throws: an unreadable list has no cards.
 * @complexity O(a) plugin adapters.
 */
export async function loadMailCredentialCards(
  required: Pick<MailProviderCatalogDeps, "loadMailAdapters">,
  _optional: Record<string, never> = {}
): Promise<readonly PluginCredentialCard[]> {
  return (await loadAdapters(required)).list().flatMap(({ descriptor, pluginId }) => descriptor.credentialCard
    ? [{ pluginId, providerId: descriptor.id, label: descriptor.credentialLabel, category: MAIL_CREDENTIAL_CATEGORY, ...descriptor.credentialCard }]
    : []);
}

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

/**
 * Builds a provider's mailer in Tovu's call shape. Plugin modules keep Tovu's positional HTTP ABI,
 * so the kit carries Tovu's client (the Jini type is only the registry's declared shape).
 * @complexity O(1).
 */
export function createProviderMailer(
  required: { deps: MailProviderCatalogDeps; provider: MailProviderModule; credential: MailAdapterCredential },
  _optional: Record<string, never> = {}
): MailerPort {
  const { deps, provider, credential } = required;
  const httpClient = deps.httpClient as unknown as JiniHttpClientPort;
  const mailer = toTovuMailer({ mailer: provider.create({ credential, kit: { httpClient } }) });
  const secrets = credentialSecrets({ credential });
  const safeResult = (result: Awaited<ReturnType<MailerPort["send"]>>) => result.ok ? result : {
    ...result,
    errorCode: safeMailProviderText({ text: result.errorCode }, { secrets }),
    message: safeMailProviderText({ text: result.message }, { secrets }),
  };
  // Policy turns throws into unknown outcomes; scrub here while the actual credential is in scope.
  const safeCall = async <T>(call: () => Promise<T>): Promise<T> => {
    try { return await call(); } catch (error) {
      throw new Error(safeMailProviderText({ text: error instanceof Error ? error.message : String(error) }, { secrets }));
    }
  };
  return {
    capabilities: () => mailer.capabilities(),
    send: async (message, options) => safeResult(await safeCall(() => mailer.send(message, options))),
    sendBatch: async (messages, options) => (await safeCall(() => mailer.sendBatch(messages, options))).map(safeResult),
  };
}
