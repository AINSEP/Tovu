# Newsletter (host side)

The newsletter domain modules now live in `@jini-ai/user-management/newsletter/*`, each under its own leaf subpath: `types`, `errors`, `ports`, `campaign`, `hooks`, `lists`, `campaign-write-service`, `launch-gate`, `unsubscribe` and `repo.memory`. There is no barrel, so import each module from its leaf subpath.

The files in this folder are the Tovu host binding and the modules that have not moved yet. They are:

- **SQL adapters:** `repo.rows.ts`, `repo-subscribers.ts`, `repo.ts`, `repo-sends.ts` and `repo.sqlite.ts`. They are typed against Tovu's `ContentDatabase` and `ContentKernel`.
- **`data-module-manifest.ts`:** it carries the stored provenance publisher, which is a Tovu value.
- **`send-pipeline.ts`:** it uses Tovu's `describeErrorForLog` and `processOutbox`.
- **`deps-builders.ts` and `delivery/tool-registrations.ts`:** they depend on `tool-registrations.ts`.
- **`agent-tools.ts`, `confirmation.ts`, `subscriptions.ts` and `tool-registrations.ts`:** they are held for a pending bug-fix patch.

## Wiring

Tovu binds these values into the Jini modules' deps objects:

- **`campaignRepo`, `listRepo`, `subscriptionRepo` and the other repositories:** the SQLite adapters from `repo.sqlite.ts` in production. Tests and memory deps use `InMemoryNewsletter*Repo` from `@jini-ai/user-management/newsletter/repo.memory`.
- **`mailer`:** the host mailer from `#src/platform/mail`. Its type is core's `PositionalMailer`, which is re-exported as `MailerPort`.
- **`originRegistry`:** the site's verified-origin registry.
- **`keyring`:** the site keyring. `processUnsubscribe` and `buildUnsubscribeLink` call only `derive`.
- **`consentCapability`:** the members feature's consent capability, or `null` when it is unbound.
- **`clock` and `ids`:** the composition root's clock and id generator.
- **HTTP mapping:** the admin and public newsletter routes map the typed errors from `@jini-ai/user-management/newsletter/errors` to HTTP responses.
