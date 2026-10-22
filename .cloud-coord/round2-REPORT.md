# Round 2 REPORT — cloud, 2026-10-22 (16:47–18:25 UTC), branch cloud/round2-2026-10-22 (Tovu + Jini)

## Items
| item | status | commits |
|---|---|---|
| A Email Phase 2 | done | d89a6cc9, 5a425349 (wip 37a98a95) |
| B Email Phase 3 | done | 8d1c288e (wip 770a3fd4) |
| C Assistant tool failures 1–5 | done | c8af6882 |
| D Email Phase 4 | done (pre-reservation refusals not yet in ledger; 30-day purge not built) | fe1420bd, migration 0029 (indexes only) |
| E Jini trust.ts | done, NOT published | Jini a3fb7570 |
| F Email Phase 5 | done | c0b45f67, migration 0030 (removal audit table + indexes) |
| G Templates backend | done (no rename; send-path seam exported, not wired) | 626adebf (wip b06b6f67, 776e0ec4) |
| catalog/contract fixes | done | e3a22cc4, 99d334df, c9f2e772 |

## NEW ROUTES + TOOLS (prefix /api/admin/v1/workspaces/:workspaceId; errors `{error, code}`)
**system/** — A (provider)
- GET `mail-status?refresh=1` (admin.forms.manage): status extended with `providers: MailProviderConfiguration[]`, `checkedAt`, `lastError{at,providerId|null,source:send|check,code?,message}`; 30 s cache. Tool `system_get_mail_status {refresh?}`.
- GET `mail-providers` (admin.forms.manage) → `{setting:{transactional,bulk}, providers: DTO[], refusals[]}`. Tool `mail_list_providers {}`.
  DTO = `{id,label,origin,hosted,lanes[],capabilities{feedback,domainVerification,rateLimit?},credential{required,saved,label?,credentialId?,updatedAt?},selectable,refusal?,setup{fields[{key,label,type,required,defaultValue?,placeholder?,help?,helpUrl?}],helpUrl?}}`
- GET `mail-providers/:providerId/credential` (custom-credentials.write) → `{provider, credential{action:create|rotate,label,category,baseUrl?,credentialId?}}`. Tool `mail_configure_provider {providerId}` → `{activated:false, provider, credential, credentialSetup, followUps}` (secret goes via credential_save form).
- PUT `mail-providers/:providerId/credential` (custom-credentials.write) body `{token?,username?,baseUrl?}` → `{provider}`; secret never echoed; next send uses the new key.
- POST `mail-providers/:providerId/activate` (settings.workspace.write) → `{set:true,providerId,label}`; switches BOTH lanes; UI must show a "both lanes" confirm first. Tool `mail_set_provider` (always-ask).
**system/** — B (DNS, test send)
- GET `mail-dns` (deployments.read) / POST `mail-dns/verify` (deployments.publish, persists) → `MailDnsStatus {state: checked|no_sender|no_provider|verification_unavailable|requirements_unavailable|requirements_failed|check_failed, senderDomain, providerId, providerVerification{state: verified|pending|failed|not_found|no_sender|no_provider|unsupported|unknown,...}|null, dns{hostname,zone,overall,records[{type,host,name,expected,observed[],status: Matches|Missing|Mismatch|Pending|Unknown|TimedOut,purpose,priority?,ttl?,note?,byNameserver[]}],checkedAt,persisted,rows?,notes?,blockers?}}`. Tools `mail_dns_status {}`, `mail_dns_verify {}`. (`Checking` is UI-only.)
- POST `mail-test-send` (admin.forms.manage) body `{to?, requestId?}` (requestId 8–64 `[A-Za-z0-9_-]`, one per click) → 200 `{sent, result{outcome: accepted|captured|redirected|failed, to, from, driver, at, providerMessageId?|where?|redirectedTo?|errorCode,message,retryable,retryAfterMs?}}`; 429 MAIL_TEST_DUPLICATE / MAIL_TEST_RATE_LIMITED. Tool `mail_send_test {to?}` (approval-gated).
**system/** — D/F (uses, activity, suppressions, feedback)
- GET `mail-uses` (admin.forms.manage) → `{checkedAt, uses[{use,label,sendLane,mailLane,state: ready|blocked|disabled|not_configured|unknown,reasons[],sender,owner,formsConfigured?,evidence{outcome,at}|null}]}`. Tool `mail_get_readiness`. Production shows `durable_outbox_not_ready` (gate untouched).
- GET `mail-activity?outcome&use&recipient&limit&cursor` (mail.activity.read = full; admin.forms.manage = masked, no ids) → `{access, items[{id?,recipient,use,outcome,lane,providerId,providerMessageId?,errorCode,createdAt,updatedAt}], nextCursor, empty}`. Tool `mail_list_activity`.
- GET `mail-activity/:activityId` (mail.activity.read) → `{activity, feedback[{kind,hardBounce,providerId,occurredAt,receivedAt}]}`. Tool `mail_get_activity {activityId}`.
- GET `mail-suppressions?search&scope&reason&limit&cursor` (mail.activity.read) → `{items[{address,scope,reason,createdAt}], nextCursor, empty}`. Tool `mail_list_suppressions`.
- POST `mail-suppressions/remove` (mail.suppressions.manage, no role has it; owner wildcard) body `{address,scope,reason,confirmed?}` → without confirmed `{removed:false,confirmationRequired:true,plan}`; with `{removed,removal}`. Tool `mail_remove_suppression` (always-ask, never remembered).
- GET `mail-feedback` (admin.forms.manage) → `{available, providers[{providerId,label,lanes,supported,webhookPath,webhookUrl,signingSecret{current,previous:{label,configured,updatedAt}},lastVerifiedEvent,state: unsupported|secret_missing|no_events_yet|receiving}]}`. Tool `mail_get_feedback_setup`.
**email-templates/** — G (posts rows `kind:"email-template"`, Pages HTML store; subject = `<title>`; fields `<meta name="email-fields" content="name=Ada, orderId">`)
- GET `` (content.read) → `{templates[{id,name,subject,fields[{name,sample?}],version,updatedAt}]}`; GET `/:templateId` → summary + `{html, undeclaredFields}`. Tools `email_template_list`, `email_template_get {id}`.
- POST `` (pages.edit_html) `{name,html?,subject?,fields?}` → 201 detail; PUT `/:templateId/html` (pages.edit_html) `{html,expectedVersion?}` (409 CONCURRENT_EDIT). Tools `email_template_create`, `email_template_edit`.
- POST `/preview` (content.read) `{id?|html?, values?, mode?: admin|sent}` → `{subject,html,missingFields,undeclaredFields,mode,scriptsStripped,text?}`; admin mode keeps scripts: render in the Pages preview iframe sandbox. Tool `email_template_preview`.
- POST `/:templateId/render` (admin.forms.manage) `{values?}` → `{subject,html,text,missingFields}` (scripts/on*/javascript:/iframe/object/embed stripped). Send seam: `renderEmailTemplateForSend({deps,id,values})`.

## C fixes (no new routes)
Screenshot returns the current frame + `note` on render timeout; theme_edit_file `intent:"delete"` required only when an edit would empty the file; the false credential note came from redacted chat history setting the flag (now current prompt only); `frontend_disconnected (retryable)` error with guidance; search-folder guidance in the system overlay.

## Tests / tsc
- All touched-file tests pass; builders report 100% line/branch/function coverage on new files. A notes `resolve-mailer.ts` + two tool-registration files at 100% lines and 92–99% branches, from what look like source-map artefacts on non-branching lines.
- Combined run (246 files): 3160 pass / 3 fail / 3 skipped. The 3 failures also happen on base (bfa96588): cross-site-read-catalog (comments_get_provider, redirects_list); mcp-ui allowlist + batch-tool-inputs (agent_plugins_update).
- Tovu `npx tsc -p tsconfig.json --noEmit`: 0 errors. Jini mcp tsc: 0; Jini mcp vitest 1324/1324, trust.ts 100%.

## LOCAL-RUN NEEDED
- Postgres: `platform/db/migrations/__tests__/runner.postgres.test.ts` (head now 0030, 91 tables), posts Postgres-only tests; migrations 0029/0030 on real PG (they pass on PGlite).
- Chromium: web_screenshot_page fallback against resend.com.
- Live smoke: provider key rotation → next send, DNS check, test send to a chosen recipient, six D/F routes; template preview iframe sandbox.

## JINI: publish needed
`@jini-ai/mcp` 0.4.4 → 0.4.5 (trust.ts). Tovu's `^0.4.4` picks it up on reinstall. Suggested follow-ups in Jini: a chat-redaction rule for `re_…` keys, and an `animations:"allow"` option in the page-capture type.

## WHAT'S LEFT
Record refusals before reservation (suppression/rate-limit) in activity; 30-day activity / 24 h capture retention purge; template rename + kind filter in content search/trash; wiring templates into form notifications/newsletter; a `setup` block in the Resend manifest (another builder is working in that plugin); `custom_credential_set_username` should allow SMTP; a timeout on the provider domain check (first uncached status read); persisted test-send evidence; re-run the held-out tool-search eval; `agent_plugins_update` batch opt-out (pre-existing).

## Owner questions
1. Test-send limits: burst 5, +1 per 12 min, 15 s duplicate guard, in memory only (reset on restart). OK?
2. Should GET mail-dns run live DNS on every load, or show the last saved check?
3. Activity: should admin.forms.manage holders see masked rows, or should the list require mail.activity.read? Should the suppression list require mail.activity.read?
4. Should one suppression removal clear both scopes?
5. theme_edit_file: `intent:"delete"` is required only when an edit would empty the whole file. OK?
6. Should templates feed form notifications or newsletters, and which goes first?
