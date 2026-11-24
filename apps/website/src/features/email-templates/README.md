# email-templates

HTML email templates — raw-HTML documents on Pages storage with `{{field}}` fill-ins, an admin
preview (scripts kept, sandboxed) and a static send render. The operations live in
`@jini-ai/platform/mail/email-template-operations`; `operations.ts` binds them to Pages storage
(`emailTemplateStore`), and the admin routes and the `email_template_*` tools both call them with it.

Send-path seam: `renderEmailTemplateForSend({ store: emailTemplateStore({ deps }), id, values })`
returns `{ subject, html, text, missingFields }`; spread `subject`/`html`/`text` into an
`OutboundEmail` next to `to`/`from` and hand it to the mailer. It sends nothing itself.

## Wiring

There is no feature barrel. Importers bind the module that owns the symbol:

- `server/inbound/admin-http/routes/email-templates/routes.ts` imports `emailTemplateStore` /
  `EmailTemplateDeps` from `operations.ts` (Pages storage bound to the Jini operations).
- `server/runtime/composition/tool-catalog-manifest.ts` imports `contributeEmailTemplatesTools`
  from `tool-registrations.ts`.
