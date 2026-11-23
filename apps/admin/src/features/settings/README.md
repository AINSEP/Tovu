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
stays here as the host-integration test of that binding).
Still here (blocked): `ai-agent-presentation.ts` and `hooks/use-ai-agent-presentation.hooks.ts` (`ExecutionPort` /
`DetectedAgent` / `ExecutionConfig` from `@jini-ai/ui` have no admin-kit or Core owner), `ExternalMcpSettingsPanel.hooks.tsx`
(`useWiredSourceConfigAddForm` from `@jini-ai/ui`), `UserInterfaceSettingsPanel.tsx` (its switch paints through
the global `.agent-plugin-switch` rules in `styles.css`), `hooks/use-user-interface-tab.hooks.ts` and
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
