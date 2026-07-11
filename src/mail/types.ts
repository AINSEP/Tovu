/**
 * @file Shared types for the `mail` core primitive (ADR-037).
 *
 * Purpose:
 * The one MailerPort shape every consumer (Members, Newsletter, Comments) imports —
 * resolves the two colliding local MailerPort definitions the 2026-07-10 sweep produced
 * (Members' `send(email):Promise<void>` vs Newsletter's `capabilities()/send()/sendBatch?`).
 *
 * How it relates to the project:
 * - `members`, `newsletter`, `comments` import these types instead of declaring their own.
 * - Adapters (`ConsoleMailerAdapter`, `SmtpMailerAdapter`, `HttpApiMailerAdapter`, the in-memory
 *   test double) are built against this shape elsewhere; this file is interfaces/types only.
 *
 * Architectural role:
 * Tier-2 core library (ADR-024 §1 core-mediated primitive). A Tier-3 plugin never holds a
 * live `MailerPort` object — core injects and calls it (ADR-024 §3).
 */
import type { ISODateTime, UUID } from "../core/ports";

/** A single outbound message. Serializable-only (ADR-024 §3) — no streams, no live handles. */
export interface OutboundEmail {
  /** Workspace boundary (ADR-007) — required on every send. */
  workspaceId: UUID;
  to: EmailAddress;
  from: EmailAddress;
  replyTo?: EmailAddress;
  subject: string;
  /** Rendered HTML body. At least one of `html`/`text` MUST be present (ADR-037 amendment 5). */
  html?: string;
  /** Plain-text alternative (deliverability + accessibility). */
  text?: string;
  /**
   * Additional headers. A consumer like Newsletter sets `List-Unsubscribe` +
   * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) here.
   */
  headers?: Readonly<Record<string, string>>;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

/**
 * Idempotency + provenance + purpose for a send (ADR-037 amendment 1 — pinned shape, frozen
 * per ADR-005). `idempotencyKey` is required so the outbox gets exactly-once-ish delivery;
 * `sourceContext` feeds feedback correlation (amendment 2) so a bounce can be attributed back
 * to the campaign/list that sent it.
 */
export interface MailerSendOptions {
  /** Required — an outbox redelivery MUST reuse the same key (ADR-009). */
  idempotencyKey: string;
  /** Workspace boundary (ADR-007); scopes the suppression + send-dedup ledgers. */
  workspaceId: UUID;
  /** Which module/campaign asked core to send. */
  sourceContext: { module: string; ref?: string };
  timeoutMs?: number;
  purpose?: "transactional" | "bulk" | `feature:${string}`;
}

/** Result of one send attempt — plain serializable data (no thrown live objects across the ABI). */
export type MailerSendResult =
  | { ok: true; providerMessageId: string; acceptedAt: ISODateTime }
  | { ok: false; retryable: boolean; errorCode: string; message: string };

/** Static description of an adapter's capabilities (mirrors ADR-027's `BlobStorePort.capabilities`). */
export interface MailerCapabilities {
  /** Adapter identifier, e.g. `console`, `smtp`, `resend`, `memory`. */
  driver: string;
  /** Whether the provider honours a forwarded idempotency key. */
  supportsIdempotencyKey: boolean;
  /** Whether the provider emits async bounce/complaint webhooks. */
  supportsWebhookFeedback: boolean;
  /** 1 ⇒ the mail-lib façade loops `send()` per recipient (amendment 3); never branch on this. */
  maxBatchSize: number;
}

/**
 * Provider-emitted delivery feedback (bounce/complaint/delivery), normalized across adapters.
 * Echoes `sourceContext` (amendment 2) so a consumer can attribute a bounce to its own
 * campaign/list. Global-suppression consumers (Members) subscribe unconditionally; per-module
 * consumers (Newsletter) filter on `sourceContext.module`.
 */
export interface MailerFeedbackEvent {
  workspaceId: UUID;
  providerMessageId: string;
  sourceContext: { module: string; ref?: string };
  kind: "delivered" | "bounced" | "complained";
  /** hard-bounce vs soft-bounce distinction where the provider supplies it. */
  hardBounce: boolean;
  occurredAt: ISODateTime;
}
