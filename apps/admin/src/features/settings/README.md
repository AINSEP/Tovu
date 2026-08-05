# features/settings

The curated Open Design settings-dialog port — the `settings` panel, reachable at
`/admin/settings` with no sidebar row (see `nav.ts` on routability vs. nav presence).

| file | what it is |
|---|---|
| `SettingsUi.tsx` | 13-tab settings shell (Execution mode, Instructions, Notifications, Privacy, Dialog appearance, Language, MCP server, Media providers, Connectors, Memory, External MCP, Skills, About). See the file's own header for the tab-by-tab backing detail. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature deliberately does not own

**`features/settings-raw`'s `Settings.tsx`.** This is not a WIP replacement for the SPEC-007 raw
ledger browser — the decision on record (`SettingsUi.tsx`'s own header) is that both stay available:
the curated tabbed surface and the raw namespace/key inspector are two views of the same
`content.db` store. Do not "consolidate" them.

## Notes for anyone editing here

`SettingsUi.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in
a browser.
