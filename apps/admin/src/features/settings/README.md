# features/settings

The curated Open Design settings-dialog port — the `settings` panel, reachable at
`/admin/settings` with no sidebar row (see `nav.ts` on routability vs. nav presence).

| file | what it is |
|---|---|
| `SettingsUi.tsx` | 13-tab settings shell (Execution mode, Instructions, Notifications, Privacy, Dialog appearance, Language, MCP server, Media providers, Connectors, Memory, External MCP, Skills, About). See the file's own header for the tab-by-tab backing detail. |
| `index.ts` | The only surface `panels.tsx` may import. |

## Jini-owned pieces

The External MCP dictionary (`@jini-ai/admin/screens/settings/external-mcp-i18n`) and the row sign-in hook
(`@jini-ai/admin/screens/settings/hooks/use-external-mcp-oauth-connect.hooks`) live in Jini. This app keeps the
product copy and binds it: `integrations/jini-admin/settings-external-mcp-copy.ts` (`EXTERNAL_MCP_PRODUCT_VARS`,
which fills the dictionary's `{productName}` token at every render site) and
`integrations/jini-admin/settings-external-mcp-oauth-connect.hooks.ts` (the live port plus the
`tovu:external-mcp-connected` callback type, which must match the website's `routes/oauth/callback-page.ts`).
`settings-capabilities-i18n.ts` stays here: every key in it describes this product's own backend state.

Also in Jini (batch G2): the AI-agent dictionary (`@jini-ai/admin/screens/settings/settings-execution-i18n`;
its server-scope key carries `{productName}`, filled from `integrations/jini-admin/settings-execution-copy.ts`'s
`SETTINGS_EXECUTION_PRODUCT_VARS` in `SettingsUi.tsx` and `ai-assistant/AiAssistant.tsx`, and
`aiAgentPanelDictionaries` takes this app's `ADMIN_LOCALES` as `locales`), `createSettingsUiTranslators` /
`createSettingsTabChange` (`.../SettingsUi.hooks`; `SettingsUi.tsx` passes `SETTINGS_DIALOG_DICTIONARIES`,
`app-i18n`'s `t` and `settings-capabilities-i18n`'s `t`), and `ExternalMcpRemoveConfirmDialog`
(`ExternalMcpSettingsPanel.tsx` passes `components/ConfirmActionDialog` as `ConfirmDialog` and
`rules.ts`'s `buildExternalMcpRemoveConfirmCopy` as `buildCopy`; `__tests__/use-external-mcp-remove-confirm.hooks.unit.test.tsx`
stays here as the host-integration test of that binding), and `UserInterfaceSettingsPanel`
(`SettingsUi.tsx` passes `hooks/use-user-interface-tab.hooks.ts`'s `useUserInterfaceTab` as the required
`useUserInterfaceTabHook` and imports `user-interface-settings.css`; the switch renders
`jini-settings-interface-switch` / `-switch-knob`, which `styles.css` paints by appending them to the
`.agent-plugin-switch` selector lists — `integrations/jini-admin/__tests__/jini-class-host-css.unit.test.ts`
holds them to the same declarations; `__tests__/UserInterfaceSettingsPanel.unit.test.tsx` stays here as the
host-integration test of that binding).
Still here (blocked): `ai-agent-presentation.ts` and `hooks/use-ai-agent-presentation.hooks.ts` (`ExecutionPort` /
`DetectedAgent` / `ExecutionConfig` from `@jini-ai/ui` have no admin-kit or Core owner; `@jini-ai/admin` and
`@jini-ai/ui` are both layer 5, so `check-package-layers` rejects an admin → ui production import as `L1-layer-edge`.
Core's `contracts/site/agent-runtime` `DetectedAgent` is the registry shape (`name`/`available`), not the card shape
(`label`/`installed`/`description`) these functions read, so it is not a substitute), `ExternalMcpSettingsPanel.hooks.tsx`
(`useWiredSourceConfigAddForm` / `SourceConfigItem` / `SourceConfigDependencies` from `@jini-ai/ui`, same layer rule),
`hooks/use-user-interface-tab.hooks.ts` (the host binding above) and
`hooks/use-admin-appearance-settings.hooks.ts` (this app's `lib/settings-tabs` types and its own hooks).

## History: `features/settings-raw`'s `Settings.tsx` (deleted)

This screen was not originally a replacement for the SPEC-007 raw ledger browser at
`features/settings-raw/Settings.tsx` — the decision on record for a while (see `SettingsUi.tsx`'s
own header) was that both stay available, as two views of the same `content.db` store. That raw
ledger browser has since been deleted: `/settings` was judged to cover the same rows on its own, so
there is no sibling left to keep separate from this one.

## Notes for anyone editing here

`SettingsUi.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in
a browser.

## Wiring

- Tab type: `SettingsDialogTab` is imported from `@jini-ai/admin/react/kit` (the kit's structural mirror of `@jini-ai/ui`'s `TabbedDialogTab`; `admin-kit.integration.test.tsx` keeps the two in sync).
- Kit slots: `I18nProvider`, `SettingsDialogShell` come from the `@jini-ai/admin/react/kit` facades; the host binds them to `@jini-ai/ui` in `integrations/jini-kits.ts` (`satisfies AdminKit`) and mounts `AdminKitProvider` in `main.tsx`.
- Residual `@jini-ai/ui` imports: the tab bodies (`ExecutionTab`, `InstructionsTab`, `LanguageTab`, `MemorySettingsPanel`, `NotificationsTab`, `PrivacyTab`), `SETTINGS_DIALOG_DICTIONARIES` and their config types.
