# Outbound email — contract + provider plugins (design, report-only)

Starting point is good: the send contract already lives in Jini `platform/src/mail/ports.ts:12` (`MailerPort`
with mandatory `sendBatch`, typed results, idempotency key, `purpose`/`lane`) and the plugin seam already
exists (Tovu `features/agent-plugins/mail-adapter-registry.ts:25,55-60`, `tovu-mail-adapters.json` →
`MailAdapterModule.create({credential, kit:{httpClient}})`, Jini `platform/src/mail/adapter-module.ts`).
Gaps this design closes (evidence in AUDIT.md §mail): (1) provider choice is an accident — first plugin by id
whose credential resolves, then SMTP, then Console (`server/runtime/boot/resolve-mailer.ts:90,254`); (2) no
feedback half — `MailerFeedbackEvent` (`types.ts:78`), `MailSuppressionRepoPort`, `MailSendDedupRepoPort`
are declared but never implemented; Resend claims `supportsWebhookFeedback:true` with no inbound route;
(3) no templates — inline strings per call site; senders hard-coded to `no-reply@{members,newsletter,forms}.local`
(`members/write-service.ts:250`, `newsletter/confirmation.ts:93`, `composition/modules/forms.ts:43`), which a real
hosted provider rejects; (4) no DI token.

## 1. File tree
```
Jini/packages/platform/src/mail/          (keep; add)
  registry.ts        createMailProviderRegistry()  — commerce payments/registry.ts clone (open id, throws at boot)
  tokens.ts          MailProviderRegistryToken, MailerToken, MailTemplatesToken, MailFeedbackSinkToken
  feedback.ts        MailFeedbackParser contract + createMailFeedbackIngest() (verify → normalize → one writer)
  policy.ts          createPolicyMailer(): suppression check, dedup ledger, attachment refusal, List-Unsubscribe
  templates.ts       MailTemplatePort + createTemplateRenderer() (pure, no engine dependency)
  contribution.ts    defineMailProviderContribution({filename}) → defineExecutablePluginContribution
  tools.ts           mail.status / mail.send_test / mail.set_provider / mail.suppressions.*
  testkit/           runMailProviderConformance() + fake HttpClient + recorded vendor fixtures
  smtp.ts            existing SMTP adapter = the DEFAULT provider (id "smtp")
Tovu/content/agent-plugins/resend/        existing plugin; add feedback parser (Svix signature)
Tovu/content/agent-plugins/postmark/      new example plugin
Tovu/apps/website/src/features/mail/      product: sender identity setting, built-in templates (i18n), webhook route mount
Tovu/apps/website/src/platform/db/migrations/00NN_mail_ledgers.ts   ADR-066: mail_suppression, mail_send_ledger, mail_feedback_inbox
```

## 2. Contract additions (Jini)
```ts
export type MailProviderId = string;                       // ADR-026 grammar, open
export interface MailProviderModule extends MailAdapterModule {   // existing create() kept as-is
  readonly id: MailProviderId; readonly label: string;
  readonly credentialKeys: readonly string[];              // replaces exact-label lookup in resolve-mailer
  readonly feedback?: MailFeedbackParser;                  // absent ⇒ capabilities.supportsWebhookFeedback must be false
}
export interface MailFeedbackParser {
  /** Raw bytes in; never throws. Signature checked with the provider's own webhook secret. */
  verify(required: { rawBody: Uint8Array; headers: Readonly<Record<string, string>>; secret: string; now: number }): boolean;
  parse(required: { rawBody: Uint8Array; workspaceId: string }): readonly MailerFeedbackEvent[] | { error: string };
}
export interface MailTemplate { readonly id: string; readonly locale: string;
  readonly subject: string; readonly html: string; readonly text: string }    // {{var}} placeholders, escaped in html
export interface MailTemplatePort {
  render(required: { id: string; locale: string; vars: Readonly<Record<string, string>> }):
    { ok: true; subject: string; html: string; text: string } | { ok: false; reason: "UNKNOWN_TEMPLATE" | "MISSING_VAR"; detail: string };
}
export interface SenderIdentityPort {                       // site setting, replaces *.local literals
  resolve(required: { workspaceId: string; purpose: MailerSendOptions["purpose"] }): Promise<{ from: EmailAddress; replyTo?: EmailAddress } | null>;
}
```
Provider discipline (as commerce `ports.ts`): stateless, never throw, all egress via `kit.httpClient` (ADR-038),
no DB access. SMTP (core) gets nodemailer through the host kit; plugins ship no npm deps.

## 3. Default + example vendors
- **Default `smtp`** (core, Jini `smtp.ts`): works with any mailbox/relay; `supportsIdempotencyKey:false` so the
  policy mailer consults `mail_send_ledger` before dispatch; no feedback (DSN/VERP out of scope v1).
  `console` stays dev-only and is refused by the newsletter launch gate (already: `newsletter/launch-gate.ts:55-87`).
- **Resend** (existing plugin): add `feedback` (Svix headers `svix-id/timestamp/signature`, 5-min tolerance),
  map `email.bounced|complained|delivered`; idempotency via `Idempotency-Key`.
- **Postmark** (new plugin): `POST /email/batch` (500 max), `MessageStream` = `outbound|broadcast` by `purpose`;
  webhook basic-auth secret; `Bounce.Type=HardBounce` → `hardBounce:true`.

## 4. DI / composition
Tovu `composition/modules/mail.ts` (replaces the selection half of `resolve-mailer.ts`): registry = `[smtp]` +
contribution-loaded plugins; active id = site setting `mail.provider` (default `"smtp"`; if unset but exactly
one hosted provider has credentials, propose it in `mail.status` — never auto-switch); credentials from the
vault by `credentialKeys`; bind `MailerToken = createPolicyMailer({ inner: provider.create(...), suppression,
ledger, purposeGate })`. Consumers (members, newsletter, forms notify) receive only `MailerPort` +
`MailTemplatePort` + `SenderIdentityPort`. Keep the existing purpose gate (`platform/mail/purpose-scoped-mailer.ts:42`).
Move `ConsoleMailerAdapter` from `features/members` to `platform/mail` (boot imports a feature today).

## 5. Plugin registration
`defineMailProviderContribution({ filename: "tovu-mail-adapters.json" })` (same file, schemaVersion 2 adds
`id`, `credentialKeys`, `feedback: true|false`; v1 descriptors keep loading with label lookup). Validation
checks `module.id === descriptor.id` and the feedback/capability consistency; trust remains the lifecycle's
(bundled digests today, `trusted-plugin-files.ts:24-26`) — the manifest grants nothing.

## 6. Bounces / webhooks — one writer, unknowns reconciled
Route `POST /hooks/mail/:providerId` (raw bytes, like Jini `commerce/src/http/payments-webhook.ts`): look up
provider → `verify` → insert into `mail_feedback_inbox` (unique `provider_id+event_id`, so replays no-op) →
outbox event `mail.feedback.received`. ONE subscriber writes: `mail_suppression` (hard bounce/complaint →
`suppress`, scope global) and newsletter recipient status (`newsletter/types.ts:159-160` already models
`bounced|complained`). Send results with transport timeouts are recorded `unknown` in `mail_send_ledger`, not
failed; redelivery reuses the same idempotency key, and the ledger/provider key prevents double sends.

## 7. Templates
Built-in Tovu templates: `members.magic_link`, `newsletter.confirm`, `forms.notification` (replaces
`JSON.stringify(data)` body), each with en + existing site locales. Theme/plugins may override by id through a
`manyToken<MailTemplate>` (last-registered wins per id+locale, host decides order). Bulk sends auto-add
`List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058) headers in the policy mailer when `purpose:"bulk"`.

## 8. Agent tools + approval
| tool | gate |
|---|---|
| `mail.status` (exists as `system_get_mail_status`) | read |
| `mail.send_test` to the operator's own address | approval (`createApprovalHandler`, core/src/approval.ts:55), rememberable |
| `mail.set_provider` | approval, not rememberable; runs send_test first |
| `mail.suppressions.list` / `.remove` | read / approval (removal re-enables mailing a complainer) |
| bulk: `newsletter_send_campaign` / schedule / resume | keep existing human card (`newsletter/delivery/tool-registrations.ts:121-181`) + launch gate; new rule in the policy mailer: agent-initiated `purpose:"bulk"` without an approval receipt is refused |

## 9. Lots
E1 registry + tokens + conformance kit (fake provider, SMTP passes) · E2 Tovu mail module: explicit
`mail.provider` setting, remove alphabetical selection, move Console adapter · E3 sender identity setting +
replace three `*.local` senders · E4 templates port + three built-ins · E5 ledgers migration + policy mailer
(suppression, dedup, List-Unsubscribe) · E6 feedback route + inbox + subscriber + Resend parser · E7 Postmark
plugin · E8 agent tools.

## 10. Risks
Changing selection can silently switch a live site's provider — E2 must keep the current effective provider by
writing the setting on first boot. Webhook secrets are a new credential per provider. Suppression must survive
plugin disable (port comment `ports.ts:29-31`). SMTP has no feedback, so its bounce data stays empty.

## 11. Owner questions
1. Default provider: SMTP (works anywhere, needs a mailbox) or Resend (better deliverability, needs an account)?
2. Should agents ever send bulk outside the newsletter feature, or is bulk newsletter-only?
3. Allow theme/plugin template overrides in v1, or built-ins only?

## GAP-CHECK OVERRIDES (2026-10-21 ~16:30Z — Opus, Sonnet, Codex; raw: ADS-memory/.local-artifacts/swarm-consensus/runs/providers-gaps-2026-10-21/). WIN over the sections above.
- Use the shared registry + shared types (ProviderResult, ProviderContext, DomainRequirement) from the Codex helper job; tool names with underscores (`mail_send_test`, not `mail.send_test`).
- Fresh install = explicit `unconfigured` state + blocking admin banner (not "SMTP default works"); owner sign-in never depends on email. On first boot, write the current effective provider into the setting (migration). Setting shaped `mail.provider.{transactional,bulk}` now (separate providers later).
- Domain verification v1: provider exposes `domainRequirements({domain})` (SPF/DKIM/DMARC) + `domainStatus`; `SenderIdentityPort` refuses a From domain the active hosted provider hasn't verified; `mail_status` reports "sender unverified". Never overwrite existing SPF/DMARC — requirements go to DNS through ports (DNS merges SPF).
- Delivery semantics: atomic reserve → send → mark with an `unknown` outcome (no `wasSent`/`markSent` race, J/platform/src/mail/ports.ts:45); per-recipient identity + payload hash; per-purpose policy (login links never auto-resent; confirmations are). No cross-provider failover (out).
- Suppression: hard bounces suppress all; complaints suppress BULK only (never lock a member out of magic-link login); suppression durable across provider switches; marketing opt-out ≠ delivery suppression. Feedback events need event id + recipient for dedup.
- Lanes: transactional vs bulk as hard lanes with reserved transactional capacity (existing `lane` = interactive/notification — don't conflate); per-provider token bucket + 429 → retryable; newsletter respects it.
- One-click List-Unsubscribe-Post endpoint (signed token, no auth, idempotent) — reuse the newsletter one if present.
- Test mode: site setting "redirect all mail to the operator" / capture mode.
- Webhook route: body-size cap, rate-limit unverified, secrets in the vault, rotation (own credential key per provider).
- Templates: strip CR/LF in subject variables; locale = recipient preference then site default; overrides later. Postmark later.
- (Gemini) The policy mailer refuses `purpose: "bulk"` without `List-Unsubscribe-Post`; per-recipient signed unsubscribe URLs are minted by Tovu (origin registry + member tokens) and passed in `OutboundEmail.headers`, not by Jini. Fix `newsletter/confirmation.ts:89-103`, which omits `purpose`/`lane`. Pre-assign migration numbers and ONE credential port (custom-credentials vs vendor-credentials) for email + search before dispatch.
