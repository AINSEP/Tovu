import type { UUID } from "@jini-ai/core/primitives";

import type { RuntimeMode } from "#src/contracts/core/runtime-mode";
import {
  resolveCustomCredentialByLabel,
  CustomCredentialSecretStoreUnconfiguredError,
  type CustomCredentialSetRepoPort,
} from "#src/features/custom-credentials/index";
import type { SecretSealerPort } from "#src/features/webhooks/index";
import { ConsoleMailerAdapter } from "#src/features/members/index";
import type { LoadedMailAdapter, MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import type { HttpClientPort } from "#src/platform/http/index";
import {
  createNodemailerSmtpTransport,
  SmtpMailerAdapter,
  type CreateNodemailerSmtpTransportConfig,
  type MailerPort,
  type SmtpTransport,
} from "#src/platform/mail/index";

/**
 * @file Boot-time `MailerPort` selection — owner decision, 2026-08-31: build both a hosted-API
 * and an SMTP adapter, default to the hosted API, and never let an unconfigured mailer fail
 * silently. 2026-09-29: hosted-API providers moved out of core into Agent Plugins; this module asks
 * the mail-adapter registry (`features/agent-plugins/mail-adapter-registry.ts`) which ones are
 * installed and enabled, tries each one's saved credential in registry order, then SMTP (core).
 *
 * Deliberately NOT in `platform/mail/**`: this module needs a runtime (not just type) dependency
 * on `features/custom-credentials` (a Tier-3 feature) to look up the saved credential, and
 * `platform/**` is Tier-2 core — every existing `platform/**` file that reaches into a
 * `features/**` module today does so type-only (`platform/db/sqlite/*.ts` implementing a feature's
 * port, `platform/connectors/*.ts` importing `KeyringPort`/`SecretSealerPort` types), never a
 * runtime import. Living under `server/runtime/boot/` instead — alongside `production-readiness-
 * gate.ts`, the other "boot-time, mode-aware, aggregate multiple sources of configuration" module —
 * keeps that Tier-2/Tier-3 direction intact: `server/**` importing `features/**` is the ordinary,
 * already-everywhere direction (every admin route does it), never the inverted one.
 *
 * **Credential storage** — follows the established `custom_credential_sets` pattern (the Access
 * Tokens page's "Add custom provider" capability), NOT a new table: no schema change, no
 * `apps/admin` change (out of scope for this task), and it is the one existing store an operator
 * can already populate for an unlisted provider with zero UI work from this task. Concretely:
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
 * This label-exact-match lookup is the one piece of this design that is NOT copied from an
 * existing pattern — `custom_credential_sets` has no purpose/role column to key on, only an
 * operator-typed `label`, so a fixed well-known label is the only stable handle available without
 * an `apps/admin` change. Documented here as a deliberate, minimal extension, not an invented one.
 *
 * **Resolution order and the startup race.** `MailerPort.capabilities()` returns synchronously,
 * but the credential lookup + decrypt is async (`SecretSealerPort.open()` derives a key through
 * `KeyringPort.derive()`, which is genuinely async) — and both composition roots
 * (`createSiteRouteDeps`/`createRouteDeps`) must stay synchronous (`server/routes/types.ts`'s own
 * `identityReady` doc explains why: route wiring needs `RouteDeps` back immediately). So
 * {@link createResolvedMailer} returns a `MailerPort` that starts as `ConsoleMailerAdapter` and
 * swaps itself to the resolved real adapter on a background promise — the exact "construct
 * synchronously, hydrate asynchronously" shape.
 * `capabilities()` stays synchronous and can still reflect the pre-swap (`console`) adapter for a
 * caller that checks it in the first few milliseconds after boot, before the local SQLite read +
 * AES-GCM decrypt finish (routinely sub-millisecond) — a disclosed race. `send()`/`sendBatch()` do NOT share that race: both await the background
 * resolution before delegating, so a send made during that window is held until resolution
 * settles and then reaches whichever adapter actually won (real credential or, only once
 * genuinely unconfigured/undecryptable, Console) — it can no longer report success for a message
 * a real, just-not-yet-loaded credential would have delivered.
 *
 * **Retry while unresolved (2026-09-29).** The boot lookup can run before the `bundled-agent-plugins`
 * boot step has installed the plugin that provides the adapter (first boot after an upgrade), and a
 * key can be saved after boot. So while the mailer is still the Console fallback, every send (and a
 * `capabilities()` read, in the background) retries the lookup once, single-flight; the first real
 * adapter found is kept for the life of the process, as before. The production warning is logged once.
 */

/** Custom-credential category (`features/custom-credentials/types.ts`'s closed set) mail
 *  credentials are filed under — outbound-mail delivery is operational infrastructure, not a
 *  source-control/hosting/media/ai integration. */
const MAIL_CREDENTIAL_CATEGORY = "ops";

/** Exact `custom_credential_sets.label` an operator must use for the SMTP adapter to activate. */
export const MAIL_SMTP_CREDENTIAL_LABEL = "Tovu Mail — SMTP Server";

/**
 * Decodes an SMTP endpoint packed into `custom_credential_sets.baseUrl` — see this file's header
 * for why an `http(s)://` scheme is used to carry a non-HTTP endpoint. Ports `443` and `465`
 * (SMTPS/implicit TLS) are treated as `secure: true`; every other port (587 submission, 25 plain,
 * or any other nonstandard port) is treated as STARTTLS/plaintext, matching nodemailer's own
 * `secure`-option convention and real-world SMTP submission practice. When `baseUrl` carries no
 * explicit port, the port defaults to the URL's own scheme default (`443` for `https:`, `80` for
 * `http:`) rather than silently assuming plaintext submission on `587` — a portless `https://host`
 * baseUrl means implicit TLS on `443`, the same thing that scheme means everywhere else.
 *
 * @complexity O(1).
 */
export function parseSmtpEndpoint(baseUrl: string): { host: string; port: number; secure: boolean } {
  const url = new URL(baseUrl);
  const defaultPort = url.protocol === "https:" ? 443 : 80;
  const port = url.port ? Number(url.port) : defaultPort;
  return { host: url.hostname, port, secure: port === 443 || port === 465 };
}

export interface ResolveMailerDeps {
  workspaceId: UUID;
  customCredentialRepo: CustomCredentialSetRepoPort;
  sealer: SecretSealerPort;
  /** The guarded outbound-HTTP seam (ADR-038) — built by the caller (a composition root); this
   *  module never constructs one itself (only a composition root may, per `.dependency-cruiser
   *  .mjs`'s `only-composition-constructs-concrete-adapters`-adjacent discipline). */
  httpClient: HttpClientPort;
  /** This workspace's plugin-contributed mail adapters (`loadMailAdapterRegistry` in production). */
  loadMailAdapters: () => Promise<MailAdapterRegistry>;
  mode: RuntimeMode;
  /** Injected for tests; defaults to the real `createNodemailerSmtpTransport`. */
  createSmtpTransport?: (config: CreateNodemailerSmtpTransportConfig) => SmtpTransport;
  /** Injected for tests; defaults to `console.warn`. */
  warn?: (message: string) => void;
}

interface ResolutionAttempt {
  mailer: MailerPort | null;
  /** Set only when a credential WAS found but could not be turned into a usable mailer (a decrypt
   *  failure, typically) — `mailer: null` with no `failureReason` means "not configured", which is
   *  an ordinary, expected state, not a failure. */
  failureReason?: string;
}

async function attemptTier(label: string, resolve: () => Promise<MailerPort | null>): Promise<ResolutionAttempt> {
  try {
    return { mailer: await resolve() };
  } catch (err) {
    const reason =
      err instanceof CustomCredentialSecretStoreUnconfiguredError
        ? `the "${label}" credential is saved but could not be decrypted (${err.message})`
        : `looking up the "${label}" credential failed (${err instanceof Error ? err.message : String(err)})`;
    return { mailer: null, failureReason: reason };
  }
}

async function resolvePluginMailer(deps: ResolveMailerDeps, adapter: LoadedMailAdapter): Promise<MailerPort | null> {
  const resolved = await resolveCustomCredentialByLabel(
    { repo: deps.customCredentialRepo, sealer: deps.sealer },
    { workspaceId: deps.workspaceId, label: adapter.descriptor.credentialLabel }
  );
  if (!resolved) return null;
  const credential = {
    token: resolved.connection.token,
    baseUrl: resolved.baseUrl,
    ...(resolved.connection.username ? { username: resolved.connection.username } : {}),
  };
  return adapter.module.create({ credential, kit: { httpClient: deps.httpClient } });
}

/** The registry, or an empty one plus the reason it could not be read. @complexity One registry load. */
async function loadAdapters(deps: ResolveMailerDeps): Promise<{ adapters: readonly LoadedMailAdapter[]; problems: string[] }> {
  try {
    const registry = await deps.loadMailAdapters();
    return { adapters: registry.list(), problems: [...registry.refusals] };
  } catch (err) {
    return { adapters: [], problems: [`the plugin mail adapters could not be listed (${err instanceof Error ? err.message : String(err)})`] };
  }
}

interface ResolutionOutcome {
  mailer: MailerPort | null;
  /** Every credential label tried, in order (for the warning). */
  labels: string[];
  reasons: string[];
}

/** One pass over the chain: each plugin adapter's credential, then SMTP. @complexity O(a) lookups. */
async function resolveOnce(deps: ResolveMailerDeps): Promise<ResolutionOutcome> {
  const { adapters, problems } = await loadAdapters(deps);
  const labels: string[] = [];
  const reasons: string[] = [];
  for (const adapter of adapters) {
    const label = adapter.descriptor.credentialLabel;
    labels.push(label);
    const attempt = await attemptTier(label, () => resolvePluginMailer(deps, adapter));
    if (attempt.mailer) return { mailer: attempt.mailer, labels, reasons };
    if (attempt.failureReason) reasons.push(attempt.failureReason);
  }
  labels.push(MAIL_SMTP_CREDENTIAL_LABEL);
  const smtp = await attemptTier(MAIL_SMTP_CREDENTIAL_LABEL, () => resolveSmtpMailer(deps));
  if (smtp.mailer) return { mailer: smtp.mailer, labels, reasons };
  if (smtp.failureReason) reasons.push(smtp.failureReason);
  return { mailer: null, labels, reasons: [...reasons, ...problems] };
}

/** The production fallback warning. @complexity O(l) labels. */
function fallbackWarning(outcome: ResolutionOutcome): string {
  const { labels, reasons } = outcome;
  const detail = reasons.length > 0 ? ` (${reasons.join("; ")})` : ` — ${labels.length === 2 ? "neither" : "none"} is configured`;
  const quoted = labels.map((label) => `"${label}"`);
  const add = quoted.length === 1 ? quoted[0] : `${quoted[0]} (recommended) or ${quoted.slice(1).join(" or ")}`;
  return (
    `[mail] no working mail credential found${detail} — falling back to ConsoleMailerAdapter, so ` +
    `outbound mail (form notifications, newsletter, member verification) will NOT actually be sent. ` +
    `Add a ${add} credential under Access Tokens (category "${MAIL_CREDENTIAL_CATEGORY}") to fix this.`
  );
}

async function resolveSmtpMailer(deps: ResolveMailerDeps): Promise<MailerPort | null> {
  const resolved = await resolveCustomCredentialByLabel(
    { repo: deps.customCredentialRepo, sealer: deps.sealer },
    { workspaceId: deps.workspaceId, label: MAIL_SMTP_CREDENTIAL_LABEL }
  );
  // No `username`: this store cannot represent unauthenticated relay (see file header) — treat as
  // not-configured rather than attempting a connection that can never authenticate.
  if (!resolved || !resolved.connection.username) return null;
  const { host, port, secure } = parseSmtpEndpoint(resolved.baseUrl);
  const createTransport = deps.createSmtpTransport ?? createNodemailerSmtpTransport;
  const transport = createTransport({
    host,
    port,
    secure,
    auth: { user: resolved.connection.username, pass: resolved.connection.token },
  });
  return new SmtpMailerAdapter(transport);
}

export interface ResolvedMailer {
  /** Safe to use immediately — starts as `ConsoleMailerAdapter`, swaps to the resolved real
   *  adapter once the background lookup below finishes. See this file's header on the startup
   *  race this implies. */
  mailer: MailerPort;
  /** Resolves once the boot-time credential lookup finishes (found, not-configured, or failed) —
   *  a pure test seam so a test can await settlement instead of guessing at a tick count.
   *  Production callers never need to await this. */
  ready: Promise<void>;
  /** Refreshes unresolved configuration and awaits the current driver without sending.
   * Used by the members tool for addresses whose sign-in service may skip send(). */
  settle: () => Promise<void>;
}

/**
 * Builds the boot-time-resolved `MailerPort`. Tries each plugin-provided hosted-API adapter's
 * credential first (the owner's chosen default), then SMTP, and only falls back to
 * `ConsoleMailerAdapter` — which sends nothing, it logs to stdout — when none is configured or a
 * configured one could not be used. The fallback only WARNS in `production` mode (local dev without
 * a mail credential is the expected default, same reasoning `purpose-scoped-mailer.ts`'s "local mode
 * never refuses" gate documents), and only once. See this file's header for the retry rule.
 *
 * @complexity O(a) credential lookups per resolution pass, a = plugin adapters + SMTP.
 */
export function createResolvedMailer(deps: ResolveMailerDeps): ResolvedMailer {
  const fallback: MailerPort = new ConsoleMailerAdapter();
  let current: MailerPort = fallback;
  let warned = false;
  let inFlight: Promise<void> | undefined;
  const warn = deps.warn ?? ((message: string) => console.warn(message));

  const resolve = (): Promise<void> => {
    inFlight ??= (async () => {
      try {
        const outcome = await resolveOnce(deps);
        if (outcome.mailer) {
          current = outcome.mailer;
          return;
        }
        if (deps.mode !== "production" || warned) return;
        warned = true;
        warn(fallbackWarning(outcome));
      } finally {
        inFlight = undefined;
      }
    })();
    return inFlight;
  };

  /** Resolves a real adapter if there is still none. Never rejects: `MailerPort` must not throw
   *  across the boundary (ADR-024 §3), so a throw from an injected `warn` is swallowed. */
  const settled = async (): Promise<MailerPort> => {
    // A pass already in flight may have started before the plugin was installed, so a send that
    // still finds the fallback after it runs one fresh pass of its own.
    if (inFlight !== undefined) await inFlight.catch(() => {});
    if (current === fallback) await resolve().catch(() => {});
    return current;
  };

  const ready = resolve();

  const mailer: MailerPort = {
    capabilities: () => {
      if (current === fallback && inFlight === undefined) void resolve().catch(() => {});
      return current.capabilities();
    },
    send: async (message, opts) => (await settled()).send(message, opts),
    sendBatch: async (messages, opts) => (await settled()).sendBatch(messages, opts),
  };
  return { mailer, ready, settle: async () => { await settled(); } };
}
