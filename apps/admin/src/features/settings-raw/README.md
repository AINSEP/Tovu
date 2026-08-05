# features/settings-raw

The SPEC-007 raw ledger browser (`ui.spec.md`, tasks.md T045/T046) — the `settings-raw` panel,
reachable at `/admin/settings-raw` with no sidebar row (see `nav.ts` on routability vs. nav
presence).

| file | what it is |
|---|---|
| `Settings.tsx` | `SettingsContainer`, `PrincipalSelector`, `NamespaceGroupList`, `SettingRow`, `SettingDetailPanel`, `ValueEditor`, `ResetNamespaceDialog`, `EmptyState`, `ErrorBanner` per `ui.spec.md` §1-§6 — the namespace/key inspector over `content.db`'s settings store. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature deliberately does not own

**`features/settings`'s `SettingsUi.tsx`.** They share a name and nothing else — this is the raw
inspector, not a fallback for the curated tabbed surface. Both are kept on purpose; see
`SettingsUi.tsx`'s own header for the decision on record.

## Notes for anyone editing here

`Settings.tsx` has a unit test (`__tests__/Settings.unit.test.tsx`).
