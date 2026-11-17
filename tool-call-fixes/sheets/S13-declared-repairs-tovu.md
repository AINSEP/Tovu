# S13. Tovu tools declare their repairs; a bounds gate keeps it that way (C5, mechanism M7)

Repo: Tovu. Estimate: 140k Sonnet. Prerequisites: S12 merged and built. S4a merged (the guide lint must know `obtainFrom`).

## Read first
`apps/website/src/features/theme/duplicate-theme-tool.ts` (schema near `sourceThemeId`), `features/theme/agent-tools.ts`
(`THEME_ID_PROPERTY`, `LIST_FILES_SCHEMA`, how `aliases` is declared for `old_string`),
`features/pages/html-document-store.ts` (`PageNotFoundError` sites), `features/web-screenshot/tool-registrations.ts`,
the `web_fetch_page` registration (find it with `rg "web_fetch_page"`).

## Step 0: re-verify the audit's open list against the live schemas (report a table)
| Case | Check |
|---|---|
| `theme_duplicate` + `sourceId` | refused today? |
| `theme_list_files` without `themeId` | exact text today |
| `web_fetch_page` + `sitePath` | does the schema have it or an alias? |
| `web_screenshot_page` + `width` | same |
| `pages_read_html` for `/` or `home` | exact text today |
Cases already accepted are dropped from this sheet, with the evidence.

## Red-first (one test per case that is still refused; exact text)
1. `theme_duplicate({ sourceId: "x", newName: "y" })` → runs as `sourceThemeId`, note `sourceId was read as sourceThemeId` (use the normalizer's real note format; pin it).
2. `theme_list_files({})` → `…supply required argument \`themeId\`; list valid values with theme_list; …`.
3. `pages_read_html` not found → `page '/' was not found. List pages with <the real listing tool id>, then pass its id.` (find the real id; the guide lint must accept it).
4. Gate `tool-bounds-declared.integration.test.ts` over the full registry: every integer property named `limit`, `offset`, `pageSize`, `maxResults`, `width`, `height`, `waitMs`, `timeoutMs` that has a `maximum` declares `clamp` as `true` or `false`; `assertRepairKeywords` passes for every schema; every `obtainFrom` names a registered, pinned tool. Fails today (nothing declares it): paste the list.

## Change
- Add the alias, `obtainFrom` on `THEME_ID_PROPERTY` (it is shared by the theme tools: check each tool that uses it is one where "list valid values with theme_list" is true), the not-found sentence.
- Classify each bound from the gate's list. `clamp: true` only for page/size/wait controls. `clamp: false` for anything that selects, addresses, prices or authorizes. When unsure, `false`, and list it for the owner.
- Do **not** default a missing `themeId` to the active theme. A silent default on a write tool edits the wrong theme; on read tools it is a separate owner decision (not asked here).

## Acceptance
Cases green with exact text; the gate passes; `npm run check:tool-guides -- --strict` still exits 0; theme and pages test counts not lower.
