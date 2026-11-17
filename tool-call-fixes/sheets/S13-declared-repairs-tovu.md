# S13. Tovu tools declare their repairs; a bounds gate keeps it that way (C5, mechanism M7)

Repo: Tovu. Estimate: 150k Sonnet. Prerequisites: S12a, S12b, S4a (the guide lint must know `obtainFrom`).
Blocking decision: **OD-8**.
Branching decision: **OD-9** (while OPEN: the "yes" branch, which is today's behaviour: a missing `themeId` is not defaulted. "No" is a separate change for read tools, outside this sheet).
Landed checks: `rg -n "missingArgumentGuidance|clampDeclaredBounds" ../Jini/packages/core/src/tool-input-repairs.ts` and `test -f development/scripts/check-tool-guides.ts`.

## Lane order (judge finding 17)
`duplicate-theme-tool.ts`, `agent-tools.ts` and `tool-registrations.ts` under `features/theme/` are in lane T's
**T-TH-08** move list. This sheet lands before T-TH-08 (INDEX §3). For each file below run
`git ls-files --error-unmatch <path>`; if it is gone, find the symbol with `rg`, apply at the new place, and say so.
For the registry-wide gate (step 4) the edited files are whatever the gate lists: check every one the same way and
report the touched files per lane (`rg -n "<path>" <lane files.tsv>` in the lane inventories on
`plan/lanes-k-t-2026-11-16` if that branch is available; otherwise list them for the coordinator).

## Read first
`rg -n "sourceThemeId" apps/website/src/features/theme/duplicate-theme-tool.ts` ·
`rg -n "THEME_ID_PROPERTY|LIST_FILES_SCHEMA|aliases" apps/website/src/features/theme/agent-tools.ts` ·
`rg -n "PageNotFoundError" apps/website/src/features/pages/html-document-store.ts` · `rg -n "web_fetch_page|web_screenshot_page" apps/website/src --glob '!**/*test*' -l`.

## Step 0: re-verify the audit's open list against the live schemas (report a table; commit the characterization tests)
| Case | Check, on the typed path **and** through the gateway |
|---|---|
| `theme_duplicate` + `sourceId` | refused today? exact text |
| `theme_list_files` without `themeId` | exact text today (two texts: typed, gateway) |
| `web_fetch_page` + `sitePath` | does the schema have it or an alias? |
| `web_screenshot_page` + `width` | same |
| `pages_read_html` for `/` or `home` | exact text today |
Cases already accepted are dropped from this sheet, with the evidence.

## Red-first (one test per case still refused; exact text; typed path and gateway path each)
1. `theme_duplicate({ sourceId: "x", newName: "y" })` → runs as `sourceThemeId`, with the normalizer's real alias note (pin it).
2. `theme_list_files({})` → typed: `…supply required argument \`themeId\`; list valid values with theme_list; …`;
   gateway: the handler text followed by ` List valid values for \`themeId\` with theme_list.`
3. `pages_read_html` not found → `page '/' was not found. List pages with <the real listing tool id>, then pass its id.`
   (find the real id; the guide lint must accept it).
4. Gate `tool-bounds-declared.integration.test.ts` over the full registry: every integer property named `limit`,
   `offset`, `pageSize`, `maxResults`, `width`, `height`, `waitMs`, `timeoutMs` that has a `maximum` declares `clamp`
   as `true` or `false`; `assertRepairKeywords` passes for every schema; every `obtainFrom` names a registered tool
   that `tool-guides.json` lists as pinned. Fails today (nothing declares it): paste the list.

## Change (one gated commit per case; the gate's classification one commit per feature folder)
- The alias; `obtainFrom` on `THEME_ID_PROPERTY` (shared by the theme tools: check for each tool using it that
  "list valid values with theme_list" is true); the not-found sentence.
- Classify each bound from the gate's list. `clamp: true` only for page, size and wait controls. `clamp: false` for
  anything that selects, addresses, prices or authorizes. When unsure: `false`, and list it for the owner.
- OD-9: do **not** default a missing `themeId` to the active theme.

## Acceptance
Cases green with exact text on both paths; the gate passes; `npm run check:tool-guides` still exits 0 (and
`-- --strict` too if S4b has landed: `rg -n '"check:tool-guides".*--strict' package.json`); theme and pages test
counts not lower; gate green; touched files reported per lane.
