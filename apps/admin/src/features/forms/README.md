# features/forms

Screens live in `@jini-ai/admin/forms` (`@jini-ai/admin/forms/react` for React views).

`index.ts` retains `FormsList` and `FormEditor({ formId, tab })` for `panels.tsx`, mounts the Jini pages through the host module scope, and imports the native-dialog/field-attribute styles. The form identity stays mounted across Fields/Submissions routes so unsaved drafts survive tab changes.

`forms-i18n.ts` remains the Tovu dictionary. `integrations/jini-admin/forms-ports.ts` supplies authenticated workspace HTTP, filtered content refresh and navigation; `forms-module.hooks.ts` supplies live locale, RecipientLabel and list publication actions. Form/submission removal uses the existing generic Trash POST; scoped submission DELETE also means reversible Trash.

Host-only locale/dictionary tests remain in `__tests__/`; transferred screen/hook/rule tests and API conformance live in Jini's forms source. Public rendering/submission runtime belongs to the CMS, outside these admin screens.

## Wiring

**Locale (P12 #6.T).** `FormsList`/`FormEditor` (index.ts) and `FormsModuleLoading`/`createHostFormsModule` (`integrations/jini-admin/forms-module.hooks.ts`) take a REQUIRED `useAdminLocaleHook` (`UseAdminLocaleHook` from
`@jini-ai/admin/react/kit`); there is no default and no direct import of the live hook. `panels.tsx` passes `ctx.useAdminLocaleHook` from `PanelRenderContext`; the
function is the host's one `useHostAdminLocale` (`hooks/admin-locale-dependencies.hooks.ts`), the
same one `adminKit.hooks.useAdminLocale` holds. Tests pass a fake hook or `useHostAdminLocale`.
