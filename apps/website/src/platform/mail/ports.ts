/**
 * @file Port contracts for the `mail` core primitive (ADR-037).
 *
 * Purpose:
 * `MailerPort` — the single mail-sending seam every consumer imports (resolves the Members/
 * Newsletter `MailerPort` collision the 2026-07-10 sweep produced) — plus the two ledger ports
 * the internal-verification pass (F1/F7) requires the mail lib to own, so suppression/dedup
 * can't be bypassed or lost on a Tier-3 module disable.
 *
 * Architectural role:
 * INTERFACES ONLY. `SmtpMailerAdapter` + `HttpApiMailerAdapter` (over `HttpClientPort`) are the
 * ADR-006 production rule-of-two pair; `ConsoleMailerAdapter` and the in-memory test double do
 * NOT count toward it (ADR-037 amendment 6 — round-2 audit finding R2-006 corrected this file's
 * wording, which previously credited all four as satisfying rule-of-two). This "no test-double
 * credit" rule is scoped to this external-effect port specifically — it does not relax ADR-015's
 * in-memory + SQLite convention for ordinary repo ports (ADR-037 fold item 10).
 *
 * 2026-08-31 correction (false-code-comments register entry, `ADS-memory/reports/2026-08-20-
 * false-code-comments-register.md`): the two marker-type doc comments below used to read "built
 * now (nodemailer/SMTP)" for `SmtpMailerAdapter` and "named-next (Resend/Postmark/SES over
 * HttpClientPort)" for `HttpApiMailerAdapter`. Neither was true at the time — no class implemented
 * either interface anywhere in this codebase; `ConsoleMailerAdapter` was the ONLY adapter that
 * existed, so this port had zero rule-of-two-qualifying implementations despite what this file
 * claimed. Both are real now: `HttpApiMailerAdapter` (`./adapters/http-api.resend.ts`, Resend) and
 * `SmtpMailerAdapter` (`./adapters/smtp.nodemailer.ts`, nodemailer) — rule-of-two is satisfied as
 * of this change.
 */
import type { UUID } from "@jini-ai/cms/core";
import type {
  MailerCapabilities,
  MailerSendOptions,
  MailerSendResult,
  OutboundEmail,
} from "./types.js";

export type { MailerCapabilities, MailerSendOptions, MailerSendResult, OutboundEmail } from "./types.js";

/**
 * The mail port. `sendBatch` is non-optional (amendment 3): a mandatory core-lib façade loops
 * `send()` when `capabilities().maxBatchSize <= 1`, so consumers never branch on method
 * presence. `send()` MUST consult {@link MailSuppressionRepoPort} and fail closed
 * (`{ ok: false, errorCode: 'SUPPRESSED' }`) for a suppressed recipient (internal-verification
 * F1) — that check lives in the mail lib, not in each adapter.
 *
 * `send()`/`sendBatch()` MUST fail closed with `{ ok: false, retryable: false, errorCode:
 * 'ATTACHMENTS_UNSUPPORTED' }` if `message.attachments` is present and non-empty while
 * `capabilities().supportsAttachments` is `false` — never silently drop the attachments and
 * report success (`/debate` D6, ADR-042 item 4 follow-up, 2026-07-15 — unanimous across all
 * debate participants regardless of their Q4 disagreement on when to freeze the attachment
 * shape itself).
 */
export interface MailerPort {
  capabilities(): MailerCapabilities;
  send(message: OutboundEmail, opts: MailerSendOptions): Promise<MailerSendResult>;
  sendBatch(
    messages: readonly OutboundEmail[],
    opts: MailerSendOptions
  ): Promise<readonly MailerSendResult[]>;
}

/**
 * Marker types documenting adapters that live OUTSIDE this Tier-2 library and so cannot be
 * re-exported through `./index.ts` as real classes without an upward (Tier-2 -> Tier-3) import:
 * `ConsoleMailerAdapter`'s concrete class lives in `features/members/mailer.console.ts` (a Tier-3
 * feature), reachable only through that module's own barrel (`features/members/index.ts`).
 *
 * `SmtpMailerAdapter`/`HttpApiMailerAdapter` do NOT need this treatment — both concrete classes
 * live inside THIS library (`./adapters/*.ts`, same tier), so `./index.ts` exports the real classes
 * directly (a same-tier internal re-export, no naming collision to work around: see that file).
 */
export type ConsoleMailerAdapter = MailerPort; // built — `features/members/mailer.console.ts`, logs to stdout in dev
export type InMemoryMailerAdapter = MailerPort; // test double (captures sends)

/**
 * The do-not-send ledger (internal-verification F1 — BLOCKER fix). Owned by `lib/mail`'s
 * always-present write path; consumers supply only *policy* (which {@link MailerFeedbackEvent}
 * categories map to which suppression scope). No suppression/unsubscribe/complaint record may
 * reside solely in a Tier-3 module — a record there is lost on disable, and re-enable could
 * re-mail a complained address (this is what Newsletter's suppression status flip must be a
 * *projection* of, not the record of, per the ADR-034 Round-3 fold).
 */
export interface MailSuppressionRepoPort {
  isSuppressed(required: {
    workspaceId: UUID;
    normalizedAddress: string;
    scope: "global" | { module: string };
  }): Promise<boolean>;
  suppress(required: {
    workspaceId: UUID;
    normalizedAddress: string;
    scope: "global" | { module: string };
    reason: "bounced" | "complained" | "manual";
  }): Promise<void>;
}

/**
 * Send-dedup ledger (internal-verification F7). When `capabilities().supportsIdempotencyKey`
 * is `false` (e.g. SMTP), the mail lib enforces at-most-once via this ledger before dispatch, so
 * an ADR-009 outbox redelivery cannot double-send through a non-idempotent provider.
 */
export interface MailSendDedupRepoPort {
  wasSent(required: { workspaceId: UUID; idempotencyKey: string }): Promise<boolean>;
  markSent(required: { workspaceId: UUID; idempotencyKey: string }): Promise<void>;
}
