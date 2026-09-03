import type { UUID } from "@jini-ai/cms/core";

import type { RuntimeMode } from "#src/contracts/core/runtime-mode";
import {
  resolveCustomCredentialByLabel,
  CustomCredentialSecretStoreUnconfiguredError,
  type CustomCredentialSetRepoPort,
} from "#src/features/custom-credentials/index";
import type { SecretSealerPort } from "#src/features/webhooks/index";
import { ConsoleMailerAdapter } from "#src/features/members/index";
import type { HttpClientPort } from "#src/platform/http/index";
import {
  createNodemailerSmtpTransport,
  HttpApiMailerAdapter,
  SmtpMailerAdapter,
  type CreateNodemailerSmtpTransportConfig,
  type MailerPort,
  type SmtpTransport,
} from "#src/platform/mail/index";

/**
 * @file Boot-time `MailerPort` selection — owner decision, 2026-08-31: build both a hosted-API
 * (Resend) and an SMTP adapter, default to the hosted API, and never let an unconfigured mailer
 * fail silently.
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
 * - Hosted API: a credential labeled exactly {@link MAIL_HTTP_API_CREDENTIAL_LABEL}, category
 *   `"ops"`, `baseUrl` = `https://api.resend.com` (Resend's real API origin), connection
 *   `{token: "<Resend API key>"}`.
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
 * (`createSqliteRouteDeps`/`createRouteDeps`) must stay synchronous (`server/routes/types.ts`'s own
 * `identityReady` doc explains why: route wiring needs `RouteDeps` back immediately). So
 * {@link createResolvedMailer} returns a `MailerPort` that starts as `ConsoleMailerAdapter` and
 * swaps itself to the resolved real adapter on a background promise — the exact "construct
 * synchronously, hydrate asynchronously" shape `server/runtime/composition/deps.ts`'s own
 * `composioConnectors.refresh()` already uses for an equally credential-gated capability.
 * `capabilities()` stays synchronous and can still reflect the pre-swap (`console`) adapter for a
 * caller that checks it in the first few milliseconds after boot, before the local SQLite read +
 * AES-GCM decrypt finish (routinely sub-millisecond) — the same disclosed race `composioConnectors`
 * already carries. `send()`/`sendBatch()` do NOT share that race: both await the background
 * resolution before delegating, so a send made during that window is held until resolution
 * settles and then reaches whichever adapter actually won (real credential or, only once
 * genuinely unconfigured/undecryptable, Console) — it can no longer report success for a message
 * a real, just-not-yet-loaded credential would have delivered.
 */

/** Custom-credential category (`features/custom-credentials/types.ts`'s closed set) mail
 *  credentials are filed under — outbound-mail delivery is operational infrastructure, not a
 *  source-control/hosting/media/ai integration. */
const MAIL_CREDENTIAL_CATEGORY = "ops";

/** Exact `custom_credential_sets.label` an operator must use (via the Access Tokens "Add custom
 *  provider" form) for the hosted-API (Resend) adapter to activate. */
export const MAIL_HTTP_API_CREDENTIAL_LABEL = "Tovu Mail — Resend API";

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

async function resolveHttpApiMailer(deps: ResolveMailerDeps): Promise<MailerPort | null> {
  const resolved = await resolveCustomCredentialByLabel(
    { repo: deps.customCredentialRepo, sealer: deps.sealer },
    { workspaceId: deps.workspaceId, label: MAIL_HTTP_API_CREDENTIAL_LABEL }
  );
  if (!resolved) return null;
  return new HttpApiMailerAdapter(deps.httpClient, { apiKey: resolved.connection.token, baseUrl: resolved.baseUrl });
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
}

/**
 * Builds the boot-time-resolved `MailerPort`. Tries the hosted-API credential first (the owner's
 * chosen default), then SMTP, and only falls back to `ConsoleMailerAdapter` — which sends nothing,
 * it logs to stdout — when neither is configured or a configured one could not be used. The
 * fallback only WARNS outside `local` mode (INV-style: local dev without a mail credential is the
 * expected, unremarkable default, same reasoning `purpose-scoped-mailer.ts`'s own "local mode
 * never refuses" gate documents); in `production` mode it is exactly the silent failure this task
 * exists to end, so it is loud.
 *
 * @complexity O(1) beyond the two credential lookups this kicks off (each already documented as
 *   O(n) in the workspace's own small credential-set count).
 */
export function createResolvedMailer(deps: ResolveMailerDeps): ResolvedMailer {
  let current: MailerPort = new ConsoleMailerAdapter();
  const warn = deps.warn ?? ((message: string) => console.warn(message));

  const ready = (async () => {
    const httpApi = await attemptTier(MAIL_HTTP_API_CREDENTIAL_LABEL, () => resolveHttpApiMailer(deps));
    if (httpApi.mailer) {
      current = httpApi.mailer;
      return;
    }

    const smtp = await attemptTier(MAIL_SMTP_CREDENTIAL_LABEL, () => resolveSmtpMailer(deps));
    if (smtp.mailer) {
      current = smtp.mailer;
      return;
    }

    if (deps.mode !== "production") return;

    const reasons = [httpApi.failureReason, smtp.failureReason].filter((reason): reason is string => reason !== undefined);
    const detail = reasons.length > 0 ? ` (${reasons.join("; ")})` : " — neither is configured";
    warn(
      `[mail] no working mail credential found${detail} — falling back to ConsoleMailerAdapter, so ` +
        `outbound mail (form notifications, newsletter, member verification) will NOT actually be sent. ` +
        `Add a "${MAIL_HTTP_API_CREDENTIAL_LABEL}" (recommended) or "${MAIL_SMTP_CREDENTIAL_LABEL}" ` +
        `credential under Access Tokens (category "${MAIL_CREDENTIAL_CATEGORY}") to fix this.`
    );
  })();

  // `send`/`sendBatch` await `ready` before delegating — a call made during the resolution
  // window must not be silently handled by the (still-current) `ConsoleMailerAdapter` while
  // reporting success for a message that a real, just-not-yet-loaded credential would have
  // actually delivered. `.catch(() => {})`: `ready` never rejects in practice (every internal
  // failure is already caught by `attemptTier`), but `MailerPort.send`/`sendBatch` must never
  // throw across the boundary (ADR-024 §3), so a hypothetical throw from an injected `warn` is
  // swallowed here rather than propagating. `capabilities()` stays synchronous and can still
  // reflect the pre-swap adapter for a caller that checks it before `ready` settles — same
  // disclosed startup-race window as before, just no longer able to produce a false success.
  const mailer: MailerPort = {
    capabilities: () => current.capabilities(),
    send: async (message, opts) => {
      await ready.catch(() => {});
      return current.send(message, opts);
    },
    sendBatch: async (messages, opts) => {
      await ready.catch(() => {});
      return current.sendBatch(messages, opts);
    },
  };
  return { mailer, ready };
}
