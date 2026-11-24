# email-templates

## Wiring

- `tool-registrations.ts` binds this host's Pages HTML edit permission (`PAGES_EDIT_HTML_PERMISSION`
  from `features/pages`) into the model-facing tool catalog owned by
  `@jini-ai/platform/mail/email-template-agent-tools` (`createEmailTemplatesAgentToolCatalog({ copy:
  { editHtmlPermission } })`) and exports the bound `emailTemplatesAgentToolCatalog`; its own
  registrations and the catalog tests read the bound catalog from there.
- `operations.ts` stays here: it is this host's storage binding (Post rows + the Pages HTML store) for
  `@jini-ai/platform/mail/email-template-operations`, bound per request by the admin routes and the tools.
