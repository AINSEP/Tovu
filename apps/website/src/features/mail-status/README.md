# mail-status

Host-side mail status: tool registrations, provider operations, test send, readiness and feedback setup.
The catalogs, permission ids/grant registrar and `mailDomainDepsFrom` live in
`@jini-ai/user-management/mail/status/*`.

## Wiring

- `registerMailPermissionGrants` is called with the composition's grant registry in
  `server/runtime/composition/app-permission-grants.ts`.
- `mailDomainDepsFrom` is called with the route/tool deps bag in `./delivery-tool-registrations.ts` and
  `server/inbound/admin-http/routes/system/mail-activity.ts`.
- The test-send operation lives at `@jini-ai/platform/mail/test-send`. The host injects
  `mailSenderIdentity` and `mailTestFallbackSender` (the product-named placeholder From) through the
  site mailer's `operations` in `server/runtime/composition/site-mailer.ts`; they reach the
  `mail_send_test` tool and the mail-test-send route through the site deps bag.
- Feedback setup (`readMailFeedbackSetup`) lives at `@jini-ai/platform/mail/feedback-setup`. The host
  injects `listCustomCredentials` (`features/custom-credentials`) and `mailWebhookSecretLabels`
  (`features/mail/index.ts`, the persisted "Tovu Mail — …" labels) as route-deps fields, bound in
  `server/runtime/composition/site-deps/route-deps-members-mail.ts` and, for the in-memory root,
  `server/runtime/composition/memory-deps/route-deps/members-media-newsletter-forms.ts`.
- Per-use readiness (`readMailUseReadiness`/`mailUseReadinessDepsFrom`) lives at
  `@jini-ai/platform/mail/use-readiness`. The host injects `evaluateNewsletterLaunchGate`
  (`features/newsletter`'s `evaluateLaunchGate`, the gate its send path runs) as a route-deps field
  (`MembersDeps`), bound in the same two composition files as feedback setup and required on the
  assistant tool deps (`assistant/tool-registrations.ts`).
