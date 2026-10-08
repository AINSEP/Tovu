# features/forms

Screens live in `@jini-ai/admin/forms` (`@jini-ai/admin/forms/react` for React views).

`index.ts` retains `FormsList` and `FormEditor({ formId, tab })` for `panels.tsx`, mounts the Jini pages through the host module scope, and imports the native-dialog/field-attribute styles. The form identity stays mounted across Fields/Submissions routes so unsaved drafts survive tab changes.

`forms-i18n.ts` remains the Tovu dictionary. `integrations/jini-admin/forms-ports.ts` supplies authenticated workspace HTTP, filtered content refresh and navigation; `forms-module.hooks.ts` supplies live locale, RecipientLabel and list publication actions. Form/submission removal uses the existing generic Trash POST; scoped submission DELETE also means reversible Trash.

Host-only locale/dictionary tests remain in `__tests__/`; transferred screen/hook/rule tests and API conformance live in Jini's forms source. Public rendering/submission runtime belongs to the CMS, outside these admin screens.
