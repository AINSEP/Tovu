# Newsletter (host side)

The newsletter domain modules now live in `@jini-ai/user-management/newsletter/*`, each under its own leaf subpath: `types`, `errors`, `ports`, `campaign`, `hooks`, `lists`, `campaign-write-service`, `launch-gate`, `unsubscribe`, `send-pipeline`, `repo.memory` and `data-module-manifest`. There is no barrel, so import each module from its leaf subpath.

The files in this folder are the Tovu host binding and the modules that have not moved yet. They are:

- **SQL binding:** `repo.sqlite.ts`. The query bodies live in `@jini-ai/user-management/newsletter/{repo,repo-subscribers,repo-sends,repo.rows}`; this file holds the `SqliteNewsletter…Repo` subclasses the composition root builds from a `ContentKernel` or `ContentDb`.
- **`deps-builders.ts` and `delivery/tool-registrations.ts`:** they depend on `tool-registrations.ts`.
- **`agent-tools.ts`, `confirmation.ts`, `subscriptions.ts` and `tool-registrations.ts`:** they are held for a pending bug-fix patch.

## Wiring

Tovu binds these values into the Jini modules' deps objects:

- **`campaignRepo`, `listRepo`, `subscriptionRepo` and the other repositories:** the SQLite adapters from `repo.sqlite.ts` in production. `repo.sqlite.ts` binds the Jini SQL repos' `kernel` (`schemaErasedKernel`), `tables` (`NEWSLETTER_SQL_TABLES`: `newsletter_campaigns`, `newsletter_campaign_revisions` and `NEWSLETTER_TABLE_NAMES`) and the campaign repo's `onUnreadableBody` (`logUnreadableCampaignBody`, a `console.warn` line with the campaign id and revision sequence only). Tests and memory deps use `InMemoryNewsletter*Repo` from `@jini-ai/user-management/newsletter/repo.memory`.
- **`mailer`:** the host mailer from `#src/platform/mail`. Its type is core's `PositionalMailer`, which is re-exported as `MailerPort`.
- **`originRegistry`:** the site's verified-origin registry.
- **`keyring`:** the site keyring. `processUnsubscribe` and `buildUnsubscribeLink` call only `derive`.
- **`consentCapability`:** the members feature's consent capability, or `null` when it is unbound.
- **`clock` and `ids`:** the composition root's clock and id generator.
- **`processOutbox`, `isMailRateLimited` and `reportError` (send pipeline):** `deps-builders.ts`'s `newsletterSendHostBindings` binds Tovu's `processOutbox` (from `contracts/core/events`, with the host outbox retry policies), `isMailRateLimited` from `@jini-ai/platform/mail`, and a reporter that logs through `console.error` with `describeErrorForLog`. `buildSendPipelineDeps` spreads them into every `SendPipelineDeps`.
- **`publisher` and `declareDataModule` (data module):** `createNewsletterDataModule` and `installNewsletterDataModule` take the stored provenance publisher, which Tovu binds from `FIRST_PARTY_PUBLISHER` in `server/runtime/composition/data-modules.ts`. `installNewsletterDataModule` also takes `declareDataModule` from `@jini-ai/db/data-modules`. `site-deps/boot-data.ts` binds both at boot.
- **Tool metadata:** the newsletter tool declarations live in `@jini-ai/core/tool-metadata/newsletter`.
- **HTTP mapping:** the admin and public newsletter routes map the typed errors from `@jini-ai/user-management/newsletter/errors` to HTTP responses.
