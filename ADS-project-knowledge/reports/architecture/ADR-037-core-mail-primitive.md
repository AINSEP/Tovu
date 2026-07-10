# ADR-037: `core/mail` — the single MailerPort primitive

- Status: PROPOSED 2026-07-10 (from `/debate sweep-crosscutting-001`, 4-way consensus D1a; round-2 re-audit `sweep-crosscutting-002` folded 2026-07-10 — see Round-2 amendments; owes the normal per-ADR audit before ACCEPTED)
- Extends: ADR-006 (rule-of-two), ADR-009 (outbox), ADR-024 (§3 async/serializable ABI, §1 core-mediated primitives)
- Relates: ADR-030 (Members), ADR-034 (Newsletter), ADR-021 (identity magic-link), ADR-036 (feedback webhook egress), ADR-027 (`capabilities()` precedent), ADR-005 (freeze shape now)
- Supersedes: the two colliding `MailerPort` definitions in `030-members/src/members/ports.ts` and `034-newsletter/src/newsletter/ports.ts`.
- Source: `tovu-v2-design.md` §3.5 line 84 (`wp-root mail → MailerPort`, "make wp_mail observable"); debate consensus `.local-artifacts/swarm-debate/20260710T164534Z-sweep-crosscutting-consensus.md`.

## Context
The sweep produced two incompatible `MailerPort` interfaces (Members `send(email):Promise<void>` vs Newsletter `capabilities()/send(msg,opts):MailerSendResult/sendBatch?`), each calling itself "the shared core port." §3.5 already reserves a dedicated `mail` core library. Outbound mail is needed by identity (magic-link/reset), Members, Comments (reply notifications), and Newsletter — a shared primitive that must be always-present core (a Tier-3 plugin never owns it).

## Decision
1. **`MailerPort` lives in a new Tier-2 core library `lib/mail/`, owned by neither Members nor Newsletter.** Consumers import it; a Tier-3 plugin never holds it — core injects and calls it (ADR-024 §3).
2. **Adopt the rich shape** (Newsletter's, lightly trimmed) — it subsumes the minimal one; a `void` send cannot express retryable-vs-permanent failure without exceptions, which breaks the serializable-result discipline the moment any consumer sits on the outbox (they all do):
```ts
interface MailerPort {
  capabilities(): MailerCapabilities;              // driver, supportsIdempotencyKey, maxBatchSize, supportsWebhookFeedback
  send(message: OutboundEmail, opts: MailerSendOptions): Promise<MailerSendResult>;
  sendBatch?(messages: readonly OutboundEmail[], opts: MailerSendOptions): Promise<readonly MailerSendResult[]>;
}
// OutboundEmail: workspaceId, to/from/replyTo: EmailAddress {email,name?}, subject, html?, text, headers?
// MailerSendResult: {ok:true; providerMessageId; acceptedAt} | {ok:false; retryable; errorCode; message}
```
3. **`MailerFeedbackEvent`** (bounce/complaint/delivery normalization) + the provider feedback-webhook endpoint are **mail-lib-owned**, emitting a `mail.feedback.received` outbox event. The *suppression policy* reacting to it is the consumer's (Newsletter/Members) — see ADR-037↔034/030 fold.
4. **Adapters (ADR-006 rule-of-two, both buildable now):** `ConsoleMailerAdapter` (Members' magic-link dev loop needs it day one) + `SmtpMailerAdapter` (first real). `HttpApiMailerAdapter` (Resend/Postmark/SES over `HttpClientPort`, ADR-038) named-next. In-memory capture double for tests.
5. **Ergonomics:** Members' `send(email)` simplicity survives as SDK sugar `mail.sendSimple()` over the one port — one interface, one wrapper, never a second port.
6. **Freeze the port shape now** (semver-irreversible per ADR-005), iterate `capabilities()` contents later (the ADR-024 "namespace frozen, contents iterate" move).

## Consequences
- One observable send path (kills the `wp_mail` blind spot); magic-link login no longer structurally depends on a disableable newsletter module.
- Every consumer inherits idempotency-key + retryable-failure semantics on the outbox — no per-consumer try/catch reinvention.
- Members (030) and Newsletter (034) delete their local `MailerPort`/`OutboundEmail` and import this one.

## Round-2 amendments (sweep-crosscutting-002, 2026-07-10 — all four voices)
These fold into the Decision above and are load-bearing because §6 freezes the shape now:
1. **`MailerSendOptions` shape is pinned** (was referenced but never shown): `{ idempotencyKey: string /*required*/; workspaceId: string; sourceContext: { module: string; ref?: string }; timeoutMs?: number; purpose?: "transactional" | "bulk" | \`feature:${string}\` }`. `idempotencyKey` is required so the outbox gets exactly-once-ish; `workspaceId` scopes it.
2. **Feedback correlation (Fable):** the mail lib MUST persist `(workspaceId, providerMessageId) → sourceContext` and echo both in every `MailerFeedbackEvent`. Without it a consumer cannot attribute a bounce to a campaign/list. Global-suppression consumers (Members) subscribe unconditionally; per-module consumers filter on `sourceContext.module`.
3. **`sendBatch` is non-optional at the port** behind a mandatory core-lib façade that loops `send()` when `capabilities().maxBatchSize ≤ 1`. Consumers MUST NOT test for method presence. Result ordering: `result[i] ↔ messages[i]`; a batch is NOT atomic (partial failure allowed).
4. **Feedback-webhook authenticity (Primary+Codex+Fable):** the provider feedback-webhook endpoint MUST verify provider signature/authenticity before emitting `mail.feedback.received` — else spoofed bounces poison suppression.
5. **`OutboundEmail`:** `html?: string`, `text?: string`, with a runtime invariant that at least one is present.
6. **Rule-of-two (Codex):** `ConsoleMailerAdapter` / in-memory double do NOT count toward the ADR-006 production rule-of-two. ADR-037 cannot move to ACCEPTED until `SmtpMailerAdapter` **and** one production-plausible HTTP-API adapter pass the same contract tests.
7. **Retry semantics (Fable, see decisions-doc §E):** `MailerSendResult.retryable` rides ADR-009 outbox redelivery in v1; state the backoff/redelivery semantics in this Open section before freeze. A dedicated scheduler primitive is a named promotion trigger.

## Open
- Whether transactional-vs-bulk email reputation needs adapter-level separation (deferred; a `capabilities()`/opts concern, not a second port).
- Exact `MailerCapabilities` field set (iterate).
- Backoff/redelivery semantics for `retryable` sends over the ADR-009 outbox (must be pinned before the shape freezes — amendment 7).

## Internal-verification fixes (TM-sweep-foundations-001, 2026-07-10)
Falsification pass caught an INV-3/D3 **blocker** + a D3 advisory. Folded:
8. **Suppression ledger is Tier-2 (F1 — BLOCKER fix).** The do-not-send **ledger** (records keyed by `workspaceId` + normalized address + scope `{global|module}`) is owned by the Tier-2 `lib/mail/` store with an always-present write path; the mail lib applies it. Consumers supply only **policy** (which `MailerFeedbackEvent` categories map to which suppression scope). **`MailerPort.send()` MUST consult the ledger and fail-closed** (`MailerSendResult.ok=false, errorCode='SUPPRESSED'`) for a suppressed recipient — no consumer can bypass it. **No suppression/unsubscribe/complaint record may reside solely in a Tier-3 module** (ADR-034 Newsletter is disable-able; a record there is lost on disable → INV-3 violation, and re-enable could re-mail a complained address).
9. **Non-idempotent-provider dedup (F7).** The mail lib maintains a `(workspaceId, idempotencyKey)` send-dedup ledger; when `capabilities().supportsIdempotencyKey=false` (e.g. SMTP) the lib enforces at-most-once via this ledger before dispatch, so ADR-009 outbox redelivery cannot double-send. Pin before the §6 freeze (ties amendment 7).
