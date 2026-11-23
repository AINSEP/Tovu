## Wiring

`index.ts` is the platform mail barrel for the host's local modules (sender identity, SMTP transport,
delivery availability, status/purpose-gate probes). Jini's mail contracts (`OutboundEmail`,
`MailerSendOptions`, `MailerSendResult`, `MailStatusReport`, `safeMailProviderText`, ...) are imported
from `@jini-ai/platform/mail` at the call site. `MailerPort` (Jini's `PositionalMailer`) and
`MailSenderIdentityPort` are still forwarded here only until the route files that import them
(`server/routes/types.ts`, `server/inbound/public-http/routes/**`) are repointed.
