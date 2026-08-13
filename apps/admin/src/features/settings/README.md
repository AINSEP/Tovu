# features/settings

The curated Open Design settings-dialog port — the `settings` panel, reachable at
`/admin/settings` with no sidebar row (see `nav.ts` on routability vs. nav presence).

| file | what it is |
|---|---|
| `SettingsUi.tsx` | 13-tab settings shell (Execution mode, Instructions, Notifications, Privacy, Dialog appearance, Language, MCP server, Media providers, Connectors, Memory, External MCP, Skills, About). See the file's own header for the tab-by-tab backing detail. |
| `index.ts` | The only surface `panels.tsx` may import. |

## History: `features/settings-raw`'s `Settings.tsx` (deleted)

This screen was not originally a replacement for the SPEC-007 raw ledger browser at
`features/settings-raw/Settings.tsx` — the decision on record for a while (see `SettingsUi.tsx`'s
own header) was that both stay available, as two views of the same `content.db` store. That raw
ledger browser has since been deleted: `/settings` was judged to cover the same rows on its own, so
there is no sibling left to keep separate from this one.

## Notes for anyone editing here

`SettingsUi.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in
a browser.
