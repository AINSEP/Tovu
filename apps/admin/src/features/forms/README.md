# features/forms

Screens live in `@jini-ai/admin/forms` (`@jini-ai/admin/forms/react` for React views).

`FormsList` and `FormEditor({ formId, tab })` are `@jini-ai/admin/screens/forms` panels that `panels.tsx` renders; `panel-pages.ts` re-exports them eagerly and imports the native-dialog/field-attribute/field-settings styles. The form identity stays mounted across Fields/Submissions routes so unsaved drafts survive tab changes.

`forms-i18n.ts` remains the Tovu dictionary. `integrations/jini-admin/forms-ports.ts` supplies authenticated workspace HTTP, filtered content refresh and navigation; `forms-module.hooks.ts` supplies live locale, RecipientLabel and list publication actions. Form/submission removal uses the existing generic Trash POST; scoped submission DELETE also means reversible Trash.

Host-only locale/dictionary tests remain in `__tests__/`; transferred screen/hook/rule tests and API conformance live in Jini's forms source. Public rendering/submission runtime belongs to the CMS, outside these admin screens.

## Wiring

- `panels.tsx` spreads `formsMount(...)` (`integrations/jini-admin/panel-mounts.ts`: `useModulePanel` from `integrations/jini-admin/modules.hooks.ts` and `FormsModuleLoading` from `integrations/jini-admin/forms-module.hooks.ts`) into both forms panels as their required props.
- `forms-host-ports.ts` binds `@jini-ai/admin/screens/forms/api/forms-api`'s `createFormsApi` to this host's `authenticatedAdminRequest` and `WORKSPACE_ID`; every importer reads the `formsApi` singleton from there.

**Locale (P12 #6.T).** The screens take no locale. `FormsModuleLoading`/`createHostFormsModule` (`integrations/jini-admin/forms-module.hooks.ts`) take a REQUIRED `useAdminLocaleHook` (`UseAdminLocaleHook` from
`@jini-ai/admin/react/kit`); there is no default and no direct import of the live hook. `panels.tsx` passes `ctx.useAdminLocaleHook` from `PanelRenderContext` to `formsMount`, which binds it
into `FormsModuleLoading` (one stable bound component per hook, so the loading notice does not remount); the
function is the host's one `useHostAdminLocale` (`hooks/admin-locale-dependencies.hooks.ts`), the
same one `adminKit.hooks.useAdminLocale` holds. Tests pass a fake hook or `useHostAdminLocale`.
