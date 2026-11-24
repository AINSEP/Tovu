## Wiring

`index.ts` is the platform mail barrel for the host's local modules (sender identity, SMTP transport,
delivery availability). The purpose-gate probe, the positional-mailer purpose gate and the
`MailProviderControl` contract moved to `@jini-ai/platform/mail`; the composition root
(`server/runtime/composition/site-mailer.ts`, `site-deps/route-deps-members-mail.ts`) passes them
the runtime mode and the durable-outbox readiness predicate. Jini's mail contracts (`OutboundEmail`,
`MailerSendOptions`, `MailerSendResult`, `MailStatusReport`, `safeMailProviderText`, ...) are imported
from `@jini-ai/platform/mail` at the call site. `MailerPort` (Jini's `PositionalMailer`) and
`MailSenderIdentityPort` are still forwarded here only until the route files that import them
(`server/routes/types.ts`, `server/inbound/public-http/routes/**`) are repointed.
