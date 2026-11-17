# Lane T, newsletter: sheets T-NL-01 .. T-NL-03 (after audit2 B05, which creates `@jini-ai/cms/newsletter` with the campaign domain, 1,782 lines)
OWNER DECISION D-T1 first: newsletter is generic but has no second user. Recommendation: run B05 + T-NL-01 only when a second host is named; until then keep it in Tovu and do only the seams (they pay for themselves in tests). plan-v6 priced the whole area at 6 agents.

## T-NL-01 SP-newsletter-send-1 (T-SPLIT) est seam 180k + move 150k. prerequisite: B05.
files `T-NL-01.files.tsv` (4 files, 1,113 lines, 38 import sites): `send-pipeline.ts` 614, `subscriptions.ts` 171, `unsubscribe.ts` 142, `confirmation.ts` 186 (CLASSIFY row 52).
over the limit: `freezeAudience` 74, `issueConfirmationToken` 63, `dispatchRow` 63, `consumeConfirmationToken` 57.
ports: mail send + outbox readiness (`platform/mail`, 4 imports) -> `MailSendPort`; token signing (`unsubscribe.ts` imports `f:webhooks`: the keyring) -> `SignedClaimPort { sign, verify }` (CLASSIFY notes a diverged generic helper in `core/gated-mutations/token.ts`: do not merge them in this sheet); origin URL (`http-kit/verified-origin`, CLASSIFY: new `originUrl(origin)` export) -> value passed in; provenance stays host-owned (`data-module-manifest.ts` STAY).
characterization first (must fail on the named risk): confirmation token is single-use (second consume refused); expired token refused with a fixed clock; `freezeAudience` excludes a subscriber who unsubscribed between freeze and dispatch; a failed send leaves the row retryable and emits no "sent" event; unsubscribe link for list A does not unsubscribe list B.
security (by class): tokens and subscriber emails never appear in `report` payloads.

## T-NL-02 MV-newsletter-sql-1 est 170k. prerequisite: B05 (ports/types).
files `T-NL-02.files.tsv`: `repo.ts` 644 (35 query sites, size-debt entry), `repo.rows.ts` 365 (1 `console.*` -> `report`) -> `cms/newsletter/sql` (cms `*/sql` convention). `repo.sqlite.ts` 60: CLASSIFY says DELETE (inline `new SqlNewsletterXRepo(contentKernel(store))` at 2 prod + 4 test importers).

## T-NL-03 newsletter agent tools est seam 190k + move 130k. prerequisite: T-NL-01.
files `T-NL-03.files.tsv`: `agent-tools.ts` 265, `tool-registrations.ts` 524 (`buildNewsletterRegistrations` 215, longest handler 82), `delivery/tool-registrations.ts` 207 (`buildNewsletterDeliveryRegistrations` 97). K-TOOLS-PATTERN. plan-v6 T3b: `UserRepoPort` local, `surfaces` required.
