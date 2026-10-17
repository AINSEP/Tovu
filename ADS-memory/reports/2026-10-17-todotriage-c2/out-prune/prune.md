Docs(Direct): Chose the Docs persona for precise, deletion-only backlog maintenance.

**REMOVED SECTIONS:**

- LATER (owner 2026-10-16): two autoplay videos for the AINSEP/Tovu GitHub README
- Note: a form inside a POST needs a widget
- Assistant chat: “Waiting for your answer above” stays after Confirm
- SOON — Themes page header layout
- LATER: JSON listing API + client-side card templates
- HIGH: convert @jini-ai/charts-recharts into the bundled chart-provider plugin, then REMOVE it from npm
- HIGH: split the deploy agent plugin into one plugin per platform
- Admin “buffet”: compose an admin from Jini modules
- Surface federated-MCP tool refusals in the UI, not only the daemon log
- Completed — historical record (pointers only)
- Canonical Architecture Decisions (ADRs)
- Backlog: Directus Research (Still Needed)
- Theme marketplace — DELETED 2026-10-04
- JSON-column tripwire + theme write-gate — 3 known-open items
- Security page (credential inventory) under Operations
- Plugins screen has no way back to Enabled once a plugin is disabled — RESOLVED
- `Plugins.tsx` needs its state moved into a hook — RESOLVED
- HTML-format Pages render in the fallback shell, not the theme — RESOLVED
- `content/themes/` vs `sites/` have drifted in load-bearing ways
- AFTER 0.1.13 — TanStack Query devtools as a tab on the Observability page
- AFTER 0.1.13 — tovu.dev link previews show no picture
- Post author field with a “Show post author” toggle
- LATER (Jini change) — Chat usage line: per-turn cost + running chat total
- 0.1.14 — One shared sites folder for web dev + desktop
- Owner decision 2026-10-09: NO permanent deletes from the chat (for now)

**REMOVED ITEMS:** 186 manifest items.

**KEPT ON PURPOSE:** 24 REMOVE rows, identified by original line number:

| Line | Retained item(s) and reason |
|---|---|
| 30 | Post-author parent: preserves context for unlisted nested children. |
| 35 | Visitor-AI parent: frames KEEP investigations and unlisted children. |
| 198 | Unrestricted file reads: shares wording with the parked CLI key-file restriction. |
| 445 | Styling and plain POST (2 rows): same paragraph as KEEP inline validation. |
| 449 | Jini form rendering: same paragraph as KEEP menu/taxonomy extraction. |
| 1028 | Preview isolation: intertwined with unlisted history in the surrounding item. |
| 1146 | Embed and media-sizing tests (2 rows): same sentence as KEEP cross-surface specification. |
| 1266 | Migration endpoint/banner: same table row as KEEP Tier-3 browser. |
| 1270 | Video picker: same table row as KEEP media work. |
| 1275 | Credential surfaces: same table row as KEEP API-key issuance. |
| 2483 | Providers tab: paragraph continues into KEEP telemetry export wiring. |
| 2928 | Recharts styling: same paragraph as KEEP ECharts provider. |
| 2939 | ChartSpec and provider preferences (2 rows): shared paragraph with KEEP provider packs and new chart kinds. |
| 2942 | Prototype and extraction (2 rows): shared paragraph with KEEP visual verification. |
| 2943 | Runtime loading/trust: shared paragraph with KEEP server-rendered SVG. |
| 2946 | Site lifecycle controls: shared paragraph with KEEP agent Trash/restore tools. |
| 2957 | Guide plugin: shared paragraph with KEEP independent Marketplace updates. |
| 3004 | Username changes: same item as KEEP persistent-owner identity constraint. |
| 3062 | Site-owned plugins: same paragraph as KEEP ops-script convention. |
| 3066 | Restart polling: same paragraph as four KEEP performance/design items. |

**LINES:** 3,066 → 2,346.

**CHANGED FILES:** Only [development/todos.md](/Users/la/Programming/Tovu/development/todos.md) was edited by this task.

All 325 KEEP rows and the protected 535-line inventory remain unchanged. Verified only deletions against the starting file.

**NOT DONE:** No tests, typechecks, builds, installs, staging, or commits. The 24 exceptions above remain deliberately.
