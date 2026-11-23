# features/email

The admin Email screen (provider, sender & DNS, templates, activity) and its HTTP client. Its
transport-free leaves live in `@jini-ai/admin/screens/email/*`.

## Wiring

- `@jini-ai/admin/screens/email/email-i18n` — the screen copy; imported directly by every tab.
- `@jini-ai/admin/screens/email/api/mail-status-api.types` — `AdminMailStatus`, returned by
  `api/mail-status-api.ts` and read by `components/MailStatusBanner`.
- `@jini-ai/admin/screens/email/EmailTemplateEditor.hooks` — `EmailTemplateEditor.tsx` binds this
  app's page-editor lookup (`t` from `features/pages/page-editor-i18n`) as `pageEditorT`.
- `@jini-ai/admin/screens/email/hooks/email-load.hooks` — every `hooks/use-email-*.hooks.ts` passes
  this app's `ApiError` (`@/lib/admin-http/request`) to `useLoad`, `errorMessage` and `isForbidden`.
- `@jini-ai/admin/screens/email/email-api.types` — the client's wire shapes and the `EmailApi` port;
  `email-api.ts` implements it (`emailApi: EmailApi`) and every tab/hook imports its types from there.
- `@jini-ai/admin/screens/email/hooks/use-email{,-overview,-sender,-templates,-template-editor}.hooks`
  — bound in `email-hooks-host.ts` (`useWired*`: `emailApi` / `mailStatusApi`, `ApiError`, the router's
  `navigate`, `newRequestId`); `Email.tsx` and `EmailTemplateEditor.tsx` mount the wired hooks.
