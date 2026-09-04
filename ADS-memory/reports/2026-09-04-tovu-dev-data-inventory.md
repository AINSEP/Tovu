# tovu.dev Data Inventory — Ground Truth from Code (2026-09-04)

Persona: codebase-analyzer (`AI-Dev-Shop/agents/codebase-analyzer/skills.md`), direct-exploration
mode (repo is well under the 500-file graph-backend threshold; `rg`/`Read`/read-only `sqlite3`
queries used throughout, no writes to any file or DB).

**Purpose.** Factual input for a GDPR + CCPA/CPRA Privacy Policy and Terms of Service for
tovu.dev. This is NOT the policy — it is the evidence the policy must be written from. Every claim
below cites `path:line`; anything not resolvable from code is marked **UNKNOWN**.

**Method note.** Repo code was cross-checked against the live `sites/tovu-com/content.db` schema
(read-only `sqlite3 -readonly` queries only — no writes) wherever a table exists, since a type
definition can drift from what's actually deployed. Every "DB CONFIRMED" tag below means the
live schema was checked and matches the code-level type.

---

## 1. tovu.dev-the-website's own data collection

This section is what the Privacy Policy must describe: what tovu.dev collects from *its own
visitors*. tovu.dev runs on the `basic` theme (`sites/tovu-com/themes/static/basic/theme.json:15`,
confirmed active via `presentation_settings` → `workspace-local|basic` in the live DB).

### 1.1 Newsletter

- **No public self-service signup exists today.** `saveSubscription` — the only function that
  creates a `p_newsletter__subscriptions` row — requires an already-resolved `subscriberId` via
  `SubscriberDirectoryPort`, and its own doc says "Never creates a new Members identity (REQ-10)"
  (`apps/website/src/features/newsletter/subscriptions.ts:6-7,38-51`). The only HTTP caller of
  `saveSubscription` is the **admin-only**, `admin.newsletter.subscriber.manage`-gated route
  `POST /api/admin/v1/.../newsletter/lists/:listId/subscriptions`
  (`apps/website/src/server/inbound/admin-http/routes/newsletter/create-subscription.ts:13-41`).
  No `forms` field type or any public route creates a subscription
  (`grep` across `features/forms/*.ts` for `newsletter` returns nothing).
  **Consequence for the policy:** as shipped, tovu.dev cannot state "enter your email to
  subscribe" as a self-service flow — subscriptions are operator-created (`source: admin`) or
  imported (`source: import`), and only the confirm/unsubscribe links that follow are public.
- **What's stored** (`p_newsletter__subscriptions`,
  `apps/website/src/features/newsletter/data-module-manifest.ts:65-79`, DB CONFIRMED via live
  schema): `subscriber_id` (FK, not raw email), `list_id`, `status`, `source`,
  `consent_revision_id_at_subscribe`, `subscribed_at`, `unsubscribed_at`, timestamps. **No email
  column** — email lives only on the Members `email` column via the FK. **No IP is ever stored**
  on a subscription row.
- **Confirmation is single-opt-in-to-double-opt-in**: `saveSubscription` immediately calls
  `issueConfirmationToken` (`subscriptions.ts:75-78`); the subscription starts `pending` and only
  a clicked confirmation link (`GET /newsletter/confirm`,
  `apps/website/src/server/inbound/public-http/routes/site/newsletter-confirm.ts:16-36`) moves it
  forward — this is double opt-in in effect, gated on the (admin-triggered) subscribe step.
  `p_newsletter__confirmation_tokens` stores `token_hash` (never the raw token) + `expires_at`
  (`data-module-manifest.ts:112-123`).
- **Unsubscribe** (`GET|POST /newsletter/unsubscribe?token=`,
  `apps/website/src/server/inbound/public-http/routes/site/newsletter-unsubscribe.ts:17-42`) is
  public, cookie-less, signed-token-based (HMAC via `KeyringPort`), idempotent. Both confirm and
  unsubscribe routes are explicitly documented as **never reading or setting a session cookie**
  (`newsletter-confirm.ts:8-13`, `newsletter-unsubscribe.ts:8-16`).
- **Sends**: `p_newsletter__sends` stores `recipient_email` in the clear per send record, plus
  `provider_message_id`/`last_error`/`attempts` (`data-module-manifest.ts:92-110`) — this is
  necessary delivery bookkeeping, not extra collection.
- **Retention/deletion**: no `deletedAt`/purge path found anywhere in the newsletter feature
  (`grep -n "deletedAt\|purge" apps/website/src/features/newsletter/*.ts` → no hits besides the
  `unsubscribed`/`revoked` status flags). Unsubscribing flips status, it does not remove the row.

### 1.2 Comments

- **Route**: `POST /api/site/comments`, public, unauthenticated, anonymous-only in v1
  (`apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts:8-10,54`).
- **Stored fields** (`CommentRecord`,
  `apps/website/src/features/comments/types.ts:50-87`, DB CONFIRMED — live
  `p_comments__comments` schema matches exactly): `author_name` (required), `author_email`
  (nullable), `author_url` (nullable), `author_ip_hash`, `body_text`, `spam_score`,
  `spam_provider`, `status`, timestamps.
- **The raw IP is never stored.** It is SHA-256-hashed with a salt (`COMMENTS_IP_SALT` env var, an
  **insecure hardcoded dev fallback** `"dev-only-insecure-salt"` if unset —
  `comments-submit.ts:22-25,44`) at the HTTP boundary and only the hash reaches storage
  (`comments-submit.ts:12-15`, `types.ts:73-74`). **UNKNOWN**: whether `COMMENTS_IP_SALT` is
  actually set in the tovu.dev production environment — if not, the salt is a fixed, published
  string and the "hash" degrades to a rainbow-table-crackable IP obfuscation, not real
  anonymization. This should be verified before the policy asserts IPs are unrecoverable.
- **Honeypot**: a `website` field is a conventional spam trap, silently discarded
  (`comments-submit.ts:32`).
- **Spam checking is 100% local/heuristic today — no third party is contacted.** An Akismet-shaped
  adapter exists (`apps/website/src/features/comments/spam.external.ts:1-30`) but its own header
  states plainly: "no real Akismet API key/credential exists in this environment,"
  "`comments/index.ts#createCommentsModule` still hardcodes `HeuristicSpamCheck`," confirmed by
  `apps/website/src/features/comments/index.ts:88-91,189` exporting only `HeuristicSpamCheck` as
  the wired default. **A boilerplate policy that says "we use a third-party spam-filtering
  service" would be wrong for this site today.**
- **Moderation retention**: comments use a 4-state lifecycle
  `pending → approved / spam / trash → purge` (`types.ts:24-29,32-39`). Trash is soft-delete;
  **`purge` is a real, separate, permission-gated hard-delete** (`comments.delete.force`,
  `types.ts:27`) — unlike Members (below), comment data CAN be permanently erased, but only by an
  admin action, not self-service by the commenter.

### 1.3 Members (accounts, sessions, visibility tiers)

- **Passwordless (magic-link) auth only — no passwords, no password hashing, exist in this
  system.** `write-service.ts` header: "The single write chokepoint for member-domain mutations:
  passwordless..." (`apps/website/src/features/members/write-service.ts:5`). Sign-in request:
  `POST /api/members/v1/workspaces/:workspaceId/sign-in`, public, rate-limited per-email AND
  per-IP (`apps/website/src/server/inbound/public-http/routes/members/sign-in.ts:53-101`).
  Completion: `POST .../sign-in/complete`
  (`apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts:74-104`).
- **Stored fields** (`MemberRecord`, `apps/website/src/features/members/types.ts:40-61`, DB
  CONFIRMED — live `members` schema matches exactly): `email` (unique per workspace,
  case-folded), optional `name`, `emailVerifiedAt`, `status`, an operator-only `note` ("never
  exposed on the member origin"), a namespaced `fields` JSON extension bag.
- **Members are disable-only — never hard-deleted, by design.** `types.ts:30-32`: "Member account
  lifecycle. Disable-only, never hard-deleted, because a member is an ADR-021 principal and
  `change_set.actorId` / revision history must not dangle." **This is the single most
  policy-relevant fact for erasure rights on this site**: there is no code path that removes a
  member row; `status: "disabled"` is the ceiling of what any mechanism (admin or otherwise) can
  do.
- **Sessions** (`MemberSessionRecord`, `types.ts:136-150`, DB CONFIRMED): `tokenHash` (Argon2/HMAC
  — "the raw token never persists"), `createdAt`, `expiresAt`, `revokedAt`, `lastSeenAt`,
  `userAgent`, **`ip`** (raw, not hashed, unlike comments/analytics). Cookie:
  `tovu_member_session` — `HttpOnly; Path=/; SameSite=Lax; Secure`, `Max-Age` derived from session
  expiry (`complete-sign-in.ts:20-28`). Deliberately a separate cookie/table/origin from the admin
  session (`types.ts:132-134`, enforced — see §1.8).
- **Consent records** (`MemberConsentRecord`/`ConsentEvidence`, `types.ts:224-270`): purpose-keyed
  (e.g. `"marketing-email"`, `"newsletter:{listId}"`), `status: pending|granted|revoked`, and
  `ConsentEvidence` stores `ip`/`userAgent`/a hash-or-reference to the consent copy shown (never
  the full consent text body) — this is a real, structured consent-audit-trail mechanism, not
  boilerplate. `grantedAt`/`revokedAt` are recorded; there's also an append-only
  `member_revisions`-style ledger for consent state changes (`ConsentRevisionOp`,
  `types.ts:272-292`).
- **Visibility tiers**: `MemberTierRecord`/`MemberSubscriptionRecord`
  (`types.ts:74-129`) — free/paid tiers, `signup|comp|billing` subscription sources; billing
  itself is "deferred (ADR-030 §6)" — no billing engine ships (see §1.7, Payments).
- **Commerce linkage**: `commerce_orders` (live DB schema) FKs to `members.id` and stores only
  `provider_customer_ref`/`provider_payment_ref` — opaque references, no cardholder data (see §1.7).

### 1.4 Forms (author-defined fields)

- **This is genuinely operator-controlled data collection** — the Privacy Policy should say so
  plainly rather than enumerate fixed fields. `FieldType` is a closed
  `"text" | "email" | "textarea" | "checkbox"` union
  (`apps/website/src/features/forms/types.ts:18`), but the *set and labels* of fields on any given
  form are authored by the site operator, not fixed by the platform.
- **Stored fields** (`FormSubmissionRecord`, `types.ts:57-64`, DB CONFIRMED — live
  `form_submissions` schema matches exactly): `data` (the author-defined field values, as
  submitted), **`sourceIp` stored in the clear, unhashed** — unlike comments (hashed) and
  analytics (never persisted). This is a real, notable asymmetry across the three anonymous-
  submission subsystems worth calling out explicitly in the policy's data-inventory section.
  There is no expiry/TTL/`deletedAt` column.
- **Deletion**: submissions CAN be permanently deleted, but only via an admin-authenticated route
  gated on `admin.forms.submissions.delete`
  (`apps/website/src/server/inbound/admin-http/routes/forms/delete-submission.ts:23-69`,
  `apps/website/src/features/forms/ports.ts:46-47`). The agent-tools doc is explicit that there is
  **no automated/self-service delete path**: "There is no `forms_delete_submission` — permanently
  removing a visitor's data stays human-UI-only" (`apps/website/src/features/forms/agent-tools.ts:259`).
  Form *definitions* (the field schema itself) can never be deleted, only disabled — irrelevant to
  visitor PII, since a definition holds no submitted data.
- **Cookie**: a validation-failure round trip sets `tovu_form_flash`
  (`apps/website/src/server/inbound/public-http/routes/site/forms-submit.ts:147-155`) —
  `HttpOnly; Path=/; Max-Age=120; SameSite=Lax`, `Secure` only over HTTPS — carrying the
  visitor's own just-typed field values (text/email/textarea types only, never checkbox) back
  through a redirect so a JS-disabled submission doesn't lose them. 120-second lifetime, essential
  (site cannot function correctly without it for the no-JS path), same-origin only.
- **Honeypot**: a `_hp` field, excluded from the flash-cookie allowlist by construction
  (`forms-submit.ts:118`).
- **Rate limiting**: keyed on `sourceIp` via `resolveClientIp`
  (`forms-submit.ts:56-58,241`) — this is the *purpose* the raw (unhashed) IP is collected for.

### 1.5 Analytics — first-party, no cookies, no raw IP retained

This is the subsystem most load-bearing for the GDPR analysis, and the code is **unusually
privacy-protective** relative to what a boilerplate policy would assume:

- **Beacon route**: `POST /_analytics/e`, public, unauthenticated, always replies `204` regardless
  of outcome — "no oracle" by design
  (`apps/website/src/server/inbound/public-http/routes/site/analytics-ingest.ts:11-24,101`).
- **Raw IP and User-Agent are never stored, by type.** `ingestHit`'s "PII-death boundary"
  (`apps/website/src/features/analytics/ingest.ts:104-121,270-310`) truncates the IP to a coarse
  bucket (IPv4 /24, IPv6 /48) BEFORE hashing, folds it with a **daily-rotating salt**
  (`deriveDailySalt`, per-workspace) and a coarse UA-derived device/browser class into a single
  one-way `visitorHash = sha256(dailySalt ‖ siteHost ‖ coarseRequestSignal)`
  (`ingest.ts:270-310`). The return type `NormalizedIngestContext`
  (`ingest.ts:116-121`) *has no `ip` or `userAgent` field* — the compiler enforces this can't leak
  downstream by accident.
- **Session ids are not cross-day linkable** — derived from `visitorHash` + a 30-minute same-day
  window (`ingest.ts:428-450`), and the salt itself rotates daily, so no visitor can be tracked
  across days from stored data.
- **DNT/GPC are honored** when the operator's config enables it (`ingest.ts:374-375`); excluded
  paths and excluded IP ranges are also config-driven policy checks, not hardcoded.
- **Event properties are actively PII-rejected**: a heuristic rejects PII-shaped key names
  (`email|phone|ssn|...`) and email-shaped string values before they ever reach storage
  (`ingest.ts:45-102`).
- **DB CONFIRMED**: live `analytics_events` schema has **no `ip` or `user_agent` column at all** —
  only `visitor_hash`, `device_class`, `browser_family`, `os_family`, `path`, `referrer_host`,
  UTM fields, `country`/`region` (both currently always `null` — no GeoIP port exists,
  `ingest.ts:490-492`), `event_name`, `event_props_json`. This is an exact match to the code-level
  claim, not just a comment asserting it.
- **No cookie is set by this subsystem** — it's a stateless `sendBeacon` POST; `visitorHash` is
  re-derived server-side per request, not carried client-side.
- **Consequence for the policy**: tovu.dev's own first-party analytics, as shipped, does not
  collect cookies, raw IP addresses, or cross-session/cross-day identifiers, and rejects
  PII-shaped custom properties by construction. It is not GA/a third-party beacon (see §4).
  A generic "we use Google Analytics and it sets cookies" policy clause would be **factually
  wrong** for this site.

### 1.6 Media uploads — EXIF/geolocation

- **Publicly served images pass through a `sharp` re-encode that strips metadata by default.**
  The core transform pipeline calls only `.resize(...)`/`.toFormat(...)`
  (`/Users/la/Programming/Jini/packages/cms/src/media/image-transformer.sharp.ts:122,127`) — no
  `.withMetadata()` call exists anywhere in that file, so per sharp's own documented default
  behavior, EXIF/ICC/geolocation metadata is **not carried into the output rendition**. The
  route-level comment confirms the intent: "every publicly-served image passes through `sharp`"
  (`apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:343`), and images
  are explicitly barred from any raw-bytes bypass route (only video gets one, and it 404s for
  non-video content types — `media-rendition.ts:339-344`).
  **UNKNOWN/caveat**: `sharp` itself is disclosed as **not installed in this environment**
  (`ImageTransformUnavailableError`, `media-rendition.ts:278-283`, 503 response) — this report
  cannot confirm whether the metadata-stripping re-encode is actually *running* in tovu.dev's live
  deployment vs. falling back to a 503 for every image request. This must be verified against the
  production environment before the policy asserts metadata is stripped on every served image.
- **The original uploaded bytes are stored as-is, EXIF and all**, in the blob store — stripping
  happens only at rendition-serving time, not at ingest. Nothing in `features/media/*.ts` scrubs
  metadata on upload. An admin can still retrieve original bytes via the authenticated admin
  preview route (`routes/admin/media/original.ts`, not audited in depth here — admin-only, so
  out of scope for a visitor-facing policy, but relevant if the operator later exports/shares an
  original file).

### 1.7 Payments — not actually live

- **`payments-webhook.ts` is real infrastructure, but the one wired provider ("lipay") is
  explicitly a non-functional reference implementation.** Its own file header: "there is no real
  lipay gateway service and no credentials for one exist in this environment... a `charge` here
  cannot complete a real payment"
  (`apps/website/src/features/plugins/lipay/providers/lipay-gateway.ts:9-13`). **No real
  transaction can complete on tovu.dev today.**
- **Even if a real provider were configured, cardholder/billing data would not touch Tovu's own
  storage.** DB CONFIRMED: `commerce_orders` stores only `provider_customer_ref` /
  `provider_payment_ref` (opaque processor references), `status`, `total_amount_cents`,
  `currency` — no card number, no billing address, no cardholder name. `commerce_orders` and
  `p_store__orders` both have **0 rows** in the live tovu-com DB — commerce is unused today.
  **Caveat**: `commerce_webhook_events` stores the **raw webhook `payload_json` verbatim**
  (live-DB-confirmed schema) — depending on what a real future provider's webhook payload
  actually contains (some include customer email/name in the event body), that raw JSON blob
  could carry more PII than the structured `commerce_orders` row does. This is a real, structural
  point the policy should flag as "webhook payloads are retained as received" rather than
  asserting no processor data is ever stored server-side.
- **Route itself**: `POST /payments/webhook/:providerId`, public/unauthenticated by necessity —
  authentication is the provider's own signature verification
  (`apps/website/src/server/inbound/public-http/routes/site/payments-webhook.ts:9-14`).

### 1.8 Authentication / cookies / sessions — full inventory

| Cookie | Set by | Flags | Lifetime | Essential? |
|---|---|---|---|---|
| `tovu_session` (admin) | `dev-auth.ts:133` | `HttpOnly; Path=/; SameSite=Strict; Secure` | `Max-Age` = session expiry | Yes — admin auth |
| `tovu_member_session` | `complete-sign-in.ts:26` | `HttpOnly; Path=/; SameSite=Lax; Secure` | `Max-Age` = session expiry | Yes — member auth |
| `tovu_form_flash` | `forms-submit.ts:151-154` | `HttpOnly; Path=/; SameSite=Lax`; `Secure` only if HTTPS | 120 seconds | Yes — no-JS form UX only |

No other `Set-Cookie` call site was found under `apps/website/src/server/inbound/public-http/`
(the site-visitor-facing surface) in this pass. **Every cookie tovu.dev sets today is
strictly-necessary/essential** (authentication or same-origin form-state preservation) — none is
advertising, cross-site tracking, or analytics (analytics uses no cookie at all, §1.5). This
matters directly for the GDPR ePrivacy consent-banner question: on the evidence gathered, tovu.dev
does not appear to need a cookie-consent banner for non-essential cookies, because there are none
found. This should be re-verified against theme/client-side JS (this audit was server-route-only;
see Sampling Notice) before the policy asserts "no consent banner needed."

Admin `tovu_session` and member `tovu_member_session` are architecturally isolated on purpose —
explicitly documented and enforced as never reading/writing each other's cookie
(`complete-sign-in.ts:9-19`, `sign-in.ts`/`dev-auth.ts` cross-references) — not a privacy
requirement per se, but relevant to a "who can see member data" description.

### 1.9 Logging

- Public-route error handlers log generically: `console.error("[site/comments-submit] unexpected
  error", err)` (`comments-submit.ts:77`), `console.error("[payments-webhook] unexpected error
  handling a webhook delivery", err)` (`payments-webhook.ts:106`),
  `console.warn("[forms:notify] subscriber failed:", err)` (`notify-subscriber.ts:101`). These log
  the JS `Error` object, not the raw request body/IP/email directly — but an error's own `.message`
  can, in some code paths (e.g. member email-validation errors), embed a piece of user input (see
  `assertValidEmail`, `apps/website/src/features/members/write-service.ts:77-80`, which is NOT one
  of the paths logged above, but is a nearby pattern worth being aware of). **No systematic PII
  redaction layer for logs was found or ruled out** in this pass — this needs a dedicated log-sink
  audit (this report's sampling did not cover the actual log transport/aggregation destination) and
  is listed as an UNKNOWN below rather than asserted either way.

---

## 2. The self-hosted software's own data collection (separate from tovu.dev)

Everything in §1 describes what *tovu.dev the running instance* collects from *its own visitors*.
When a third party downloads and self-hosts Tovu, **that operator is the data controller for their
install**, not Tovu — the same code paths above (newsletter/comments/members/forms/analytics/media/
payments) run, but the data they collect belongs to and is controlled by the self-hosting operator,
stored in *their own* database, never transmitted to Tovu-the-company. Nothing in the code sampled
in this pass shows any self-hosted install phoning data home to a Tovu-operated service — the
admin AI-assistant traffic (`server/inbound/admin-http/routes/assistant/*`) is `requireAdminSession`
-gated and, per `assistant-byok.ts`'s naming ("Bring Your Own Key"), uses the **operator's own**
LLM-provider credential, not a Tovu-operated one — i.e. even that traffic goes from the operator's
own install directly to the LLM provider *they* configured, not through Tovu. This should be called
out in the Privacy Policy as the "self-hosted software vs. tovu.dev" split the dispatch task asked
to keep separate — do not describe self-hosted operators' data collection as tovu.dev's own.

**UNKNOWN**: whether any self-hosted install pings a Tovu-operated telemetry/update-check endpoint
(a common SaaS-adjacent pattern). No such call site was found in this pass, but this pass did not
exhaustively audit `src/cli/**` or the boot sequence for a telemetry beacon — flagged as an
UNKNOWN requiring a dedicated check before the policy asserts "the software never phones home."

---

## 3. Cookies table

See §1.8 above for the full table. Summary: 3 cookies total across the entire visitor-facing
surface sampled (`tovu_session`, `tovu_member_session`, `tovu_form_flash`), all `HttpOnly`, all
essential/functional, none third-party, none used for advertising or cross-site tracking.

---

## 4. Third-party processors — enumerated

| Processor | Contacted when | Visitor data sent | Status |
|---|---|---|---|
| Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) | Every page load, when the active theme declares `manifest.fonts` | Visitor's IP address, User-Agent (standard web-font-request exposure — Google's classic GDPR issue) | **LIVE for tovu.dev today** — the active `basic` theme declares `"Geist:wght@400;500"` / `"Geist+Mono:wght@400;500"` (`sites/tovu-com/themes/static/basic/theme.json:14-17`), and `render.ts` emits `<link rel="preconnect">`/`<link rel="stylesheet">` to both Google domains whenever `theme.manifest.fonts.length > 0` (`apps/website/src/server/inbound/public-http/http/site/render.ts:2266-2270`). **This must be disclosed in the policy — confirmed, not hypothetical.** |
| Resend (hosted email API) | Newsletter sends, magic-link emails, form-notification emails — whichever transactional mail path fires | Recipient email address, message content | Wired as the **default/preferred** mailer, but only activates once an operator saves a `"Tovu Mail — Resend API"` credential (`apps/website/src/server/runtime/boot/resolve-mailer.ts:84,143-150,199-203`). Falls back to `ConsoleMailerAdapter` (sends nothing, logs to stdout) if unconfigured. **UNKNOWN: whether tovu.dev's own production deployment has this credential configured** — if not, no outbound mail (including magic-link sign-in and newsletter confirmation) is actually delivered today, and Resend is not actually contacted. |
| SMTP (via Nodemailer, any operator-chosen host) | Same trigger as above, if configured instead of Resend | Recipient email address, message content, transiting the operator-chosen SMTP host | Second-priority fallback (`resolve-mailer.ts:152-169,205-209`); same "may not be configured" caveat. |
| Akismet | Comment submissions | Would be author name/email/content (never IP — the codebase's own doc says it omits `user_ip`/`user_agent` because only a hash is available, "not a valid `user_ip` value") | **NOT wired/active** — built but unused; `HeuristicSpamCheck` runs instead (§1.2). Do not list Akismet as a live processor. |
| A real payment gateway (Stripe-shaped) | A completed purchase | Per `ProviderChargeInput`, `customer.email`/`customer.name` optionally, plus the charge (`apps/website/src/features/plugins/lipay/ports.ts:127`) | **NOT live** — no real gateway is configured; the only wired provider is a disclosed non-functional reference implementation (§1.7). |
| An LLM provider (Anthropic/OpenAI/etc., operator's own key) | Admin's own use of the in-editor AI assistant | Whatever the admin operator sends it (site content, prompts) — **never visitor data**, and never through a Tovu-operated key (BYOK) | Admin-only surface, `requireAdminSession`-gated (`apps/website/src/server/inbound/admin-http/routes/assistant/...`); irrelevant to the visitor-facing Privacy Policy, relevant only if the ToS wants to disclose the admin-facing AI feature. |

**UNKNOWN — not audited in this pass, needed before publishing**:
- Hosting/CDN/error-reporting provider tovu.dev itself runs behind (e.g. is there a Sentry/error-
  tracking SDK loaded client-side, a CDN in front of the origin, etc.) — this pass covered
  server-side route code only, not the actual deployed infra or any client-side `<script>` tags a
  theme might load beyond the fonts link found. A `grep` for Sentry/analytics-SDK script tags
  across theme HTML/templates was not performed as part of this pass and should be, given how
  decisive the Google Fonts finding was for a similarly-shaped question.
- Where tovu.dev is physically hosted (region/country) — this is a deployment-configuration fact,
  not something derivable from application source code; `deployment_targets`/
  `deployment_environments` tables exist in the schema but were empty/unqueried successfully in
  this pass.

---

## 5. Retention and deletion — reality, subsystem by subsystem

| Data | Retention in code | Hard-delete path exists? |
|---|---|---|
| Newsletter subscriptions | Indefinite — no `deletedAt`/purge found | No |
| Comments | Indefinite until `trash`; **`purge` is a real hard-delete**, admin-gated (`comments.delete.force`) | **Yes**, admin-only |
| Members | **Indefinite, permanently — disable-only by explicit design** (`types.ts:30-32`) | **No — none exists in code** |
| Member sessions | Until `expiresAt`/`revokedAt` | Revocable, not necessarily purged from storage |
| Form submissions | Indefinite, no TTL column | **Yes**, admin-only, one-at-a-time, no bulk/self-service path |
| Analytics events | No PII to retain (visitor identifiers are salted hashes, not reversible) — retention question is moot for identifiability, though the events themselves persist indefinitely as aggregate data | N/A |
| Consent records | Indefinite (append-only ledger by design) | No — and arguably shouldn't be, since it's the compliance evidence itself |
| Commerce orders / webhook events | Indefinite, no TTL column | Not found in this pass |

**The single fact most likely to force a real product/policy decision before publishing**: Members
cannot be hard-deleted today. If the Privacy Policy promises GDPR Article 17 ("right to erasure")
or CCPA's deletion right for members/subscribers, that promise is **not currently true of the
code** — disabling a member is the ceiling of what exists. The policy must either (a) not promise
member erasure, (b) describe disabling + anonymizing the `email`/`name`/`fields` columns in place
as the erasure mechanism (which is NOT what the code does today — disable only flips `status`), or
(c) the owner accepts this as a product gap to close before publishing an erasure promise.

---

## 6. Data-subject-rights mechanisms that actually exist today

- **Export**: no export-my-data mechanism was found for members, subscribers, or commenters in
  any route sampled. **Do not promise a data-export button in the policy.**
- **Delete**: 
  - Comments: admin-only, effective (`purge`).
  - Form submissions: admin-only, one-row-at-a-time, effective.
  - Newsletter subscriptions: `unsubscribeSubscription`/`processUnsubscribe` change `status`, do
    not delete the row.
  - Members: **no deletion path exists at all** — see §5.
- **Access/rectification**: members can be looked up/edited by an admin via the admin UI (not
  audited route-by-route in this pass); no self-service member profile-edit route was located in
  the public-http sample. **UNKNOWN** whether one exists elsewhere in the members feature beyond
  what was sampled — flagged rather than asserted.
- **Consent withdrawal**: the `MemberConsentRecord`/`revoke()` mechanism (§1.3) is real and
  purpose-scoped — this is a genuine, working consent-revocation mechanism, more complete than
  many production sites have, and can be described accurately as such.

---

## 7. Children / age gate

No age-gate, COPPA-style age check, or date-of-birth field was found anywhere in
`apps/website/src` (`grep` for age-gate/COPPA/date-of-birth patterns returned only unrelated
matches — see Sampling Notice). **The policy should not claim an age gate exists.**

---

## 8. International transfers

- **tovu.dev itself**: physical hosting location is a deployment-configuration fact, not
  something the application source code determines — **UNKNOWN**, needs an infra-level answer
  before the policy can state a processing location or invoke SCCs/adequacy mechanisms.
- **Self-hosted installs**: data physically lives wherever the operator deploys their own
  instance and database — this is inherently outside Tovu's control and should be described in
  the policy as "for self-hosted installs, the operator determines data location," not as a
  specific claim.

---

## 9. UNKNOWNS the owner must resolve before publishing

1. **Is `COMMENTS_IP_SALT` actually set in tovu.dev's production environment?** If not, the
   "salted hash" of commenter IPs uses a published, hardcoded fallback salt and is not
   meaningfully anonymized (§1.2).
2. **Is a real mail credential (Resend or SMTP) configured for tovu.dev today?** If not, no
   newsletter/magic-link/form-notification email is actually being sent, and Resend is not
   actually a live third-party processor for this site yet (§4).
3. **Is `sharp` actually installed and running in tovu.dev's live deployment**, or is every image
   request currently 503ing? This determines whether the EXIF-stripping claim in §1.6 is
   operative today, not just intended by the code.
4. **Where is tovu.dev physically hosted** (cloud/region)? Needed for the international-transfers
   section (§8).
5. **Does any client-side script (theme JS, an error-reporting SDK) load beyond the Google Fonts
   link found?** This pass audited server-route code, not the full rendered page/theme JS bundle
   — Google Fonts was found because it's server-templated; a client-side third-party script would
   not have been caught by this pass's method and needs a dedicated check (§4).
6. **Does self-hosted Tovu phone home for telemetry/update checks?** Not found in this pass, but
   `src/cli/**` and the full boot sequence were not exhaustively searched (§2).
7. **Is there a self-service member profile view/edit route** anywhere outside the public-http
   sample audited here? Relevant to the access/rectification-rights section (§6).
8. **What does the live payment provider's real webhook payload actually contain**, once/if a
   real gateway (Stripe-shaped) is configured? `commerce_webhook_events.payload_json` retention
   means whatever that provider sends is retained verbatim (§1.7) — this can't be fully answered
   until a real provider is chosen.
9. **Is there a systematic PII-redaction layer for application logs**, or could error-path logging
   occasionally surface raw user input via an `Error.message`? Not ruled out or confirmed in this
   pass (§1.9).
10. **Does the Members table's `disable`-only design mean the owner accepts "no full erasure" as
    the policy's actual promise, or is a hard-delete feature planned before publish?** This is a
    product decision, not something code alone can resolve (§5).

---

## Sampling Notice

**Files/areas sampled**: all public (`public-http/routes/site/*`, `public-http/routes/members/*`)
site routes and their directly-imported feature modules for newsletter, comments, members, forms,
analytics, media (rendition route + the Jini `image-transformer.sharp.ts` it delegates to), and
payments; the admin session-cookie code (`dev-auth.ts`); the mailer boot-resolution module; the
lipay payment-plugin ports/gateway; theme font-loading code in `render.ts`; the live
`sites/tovu-com/content.db` schema for every table named above (read-only queries only, confirmed
against code-level type definitions).

**Files/areas excluded** (token budget / explicitly out of scope for a data-inventory pass):
admin-http route handlers beyond auth/cookie code (out of scope — visitor-facing policy doesn't
need admin-only surface detail beyond what's noted); the full `assistant/**` LLM-integration
plumbing beyond confirming its admin-gating and BYOK model; `src/cli/**` and the process boot
sequence (relevant only to the self-hosted-telemetry UNKNOWN, §9.6); any client-side/theme
JavaScript bundle beyond the server-templated font `<link>` tags (§9.5); `deployment_targets`/
`deployment_environments` table contents (query returned no usable rows in this pass);
`routes/admin/media/original.ts` (admin-only, not visitor-facing); log transport/aggregation
destination configuration (§1.9/§9.9).

**Confidence levels by finding category**:
- Newsletter/comments/members/forms/analytics data-flow structure: **High** (code + live-DB
  schema cross-checked for every claim).
- Cookie inventory: **Medium-High** (exhaustive for server-set cookies in the sampled route set;
  not verified against client-side JS that could set additional cookies).
- Third-party processor list: **High** for Google Fonts (server-templated, directly traced to the
  live active theme) and for Akismet/lipay-not-wired (explicit code disclosures); **Medium** for
  whether Resend/SMTP are actually configured in production (code shows the mechanism, not the
  live credential state).
- Retention/deletion reality: **High** (schema + port-interface inspection for every subsystem
  named).
- EXIF-stripping claim: **Medium** (the re-encode call is confirmed metadata-stripping by
  omission of `.withMetadata()`, but whether `sharp` runs at all in production vs. 503ing is
  unconfirmed).
- International-transfer/hosting-location facts: **Low** (not resolvable from application code).

Note: confidence reflects sample coverage, not model certainty. A High-confidence finding means
code and live schema agreed and the call sites were read in full. A Low-confidence item is a gap
requiring a human/infra answer, not a hedge on the code that WAS read.
