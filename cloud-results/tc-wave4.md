# tc-wave4 report (2026-11-18), Tovu side

Branch `wave3/tc-wave4` in both repos, from `origin/refactor/terra` (Tovu `ada11733f`, Jini `4c1892368`). Plan: `plan/tool-call-fixes-2026-11-16`.
Jini side: `Jini/cloud-results/tc-wave4.md`.

## Result

| Sheet | Result |
|---|---|
| Merge wave2/tc-a, tc-b, tc-c, tc-d (both repos, one `--no-ff` each) | Done. Jini: one conflict (`mcp/src/server/tool-server.ts` imports, tc-d vs base), resolved by keeping both imports. Tovu: two conflicts in the tc-b merge (`agent-daemon-scope.ts` import line, golden byte count); resolved with the base's `toolCatalogRoutes` import plus tc-b's relocated type import; golden regenerated afterwards. tc-a, tc-c, tc-d merged clean. |
| S12b (Jini `obtainFrom`) | **Done**, see the Jini report. |
| S4a `check:tool-guides` | **Done** (report mode). Result: **the named descriptors do not fit the pinned limits: 202 descriptors / 533124 bytes against 64 / 262144 (OD-7).** Per the sheet nothing else was done for OD-7. |
| S13 rest | **Partly done.** Done: `obtainFrom` on the shared `themeId` property, typed and gateway path, and the gate for every `obtainFrom`. Not done: see "Left". |
| S6, S7, S8, S9, S2b | Not run (instructed). |

## Commits (all pushed to `origin/wave3/tc-wave4`)

Tovu, oldest first: merges `2d001c75` (tc-a), `3cf62431` (tc-b), `39703342` (tc-c), `b5fe26d1` (tc-d) ·
`3c885967` re-pin the moved-tools golden byte count and drop the `size-debt.json` entry tc-c retired ·
`1df081ff` pure scanner `development/scripts/lib/tool-guide-scan.ts` + 13 tests · `3c23f27e` `check:tool-guides`, `tool-guide-sources.json`, `tool-guides.json` ·
`901b0a73` S13 `obtainFrom` on `THEME_ID_PROPERTY` + 3 tests + golden (755566 → 755906) + regenerated `tool-guides.json`. Report commit: last commit of the branch.

## Gates (exact command, result)

Setup: Node 24.22.3; Jini `pnpm install --frozen-lockfile`, `pnpm --no-bail -r build` (green); Tovu `npm ci`, `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`
(dry run: 0 links), `npx tsc -p tsconfig.json` in `packages/contracts` and `packages/sdk`. Trap: running `npm ci` inside `packages/*` re-installs the root and removes the links; run the link step last.
Pushes: Tovu's pre-push hook said "no apps/desktop changes, skipping desktop gates"; no `--no-verify` used.

- Tovu baseline on the merged tree: `npm run typecheck` rc 0 (45 s). `npm run check:size` rc 1 with ONE line the base does not print: `Delete stale debt entry … playwright-page-capture.ts … createPlaywrightPageCapture#1` (tc-c shrank the function); fixed in `3c885967`, then rc 0 (`202 violations … 192 debt entries`). `npm run check:complexity` rc 0 (`43 entries`).
- BASE-RED I did not fix: `npm run check:why-comments` rc 1, 4 blocks lost, all from the merged wave2 branches (not from files I edited): `AssistantDock/assistant-runtime-preferences.ts:22` ("default on", tc-b changed the default to off), `assistant/runtime-preferences.ts:53-54` (tc-b), `web-screenshot/playwright-page-capture.ts:191` and `web-screenshot.ts:34` (tc-c). They need allow-list entries or restored comments from their owners. `npm run typecheck:scripts` rc 2 with 3 errors in files I did not touch (`agent-plugin-activation.ts(100,23)`, `check-size-drift.ts(9,8)`, `dev-admin-build.ts(6,12)`); none in my files.
- After S13: `npm run typecheck` rc 0 · `check:size` rc 0 · `check:complexity` rc 0 · `check:hooks` ok · `check:tool-guides` rc 0.
- Tests, runner line of `package.json` with the file path and `--test-concurrency=2`:
  - `development/scripts/__tests__/tool-guide-scan.unit.test.ts` 13/13 (new).
  - `moved-tools.golden.test.ts` and `moved-tools.access-token.golden.test.ts` pass after re-pinning.
  - `theme-list-files-malformed-input-status.integration.test.ts` 7/7 (5 existing + 2 new).
  - `tool-registrations.contracts.test.ts` 39/39 (was 37: +2 gate tests).
  - All `features/theme/**/*.test.ts` + `assistant/__tests__/*.test.ts` except `*postgres*`: 4047 tests, 4027 pass, **11 fail**. 9 fail identically on the base per `tc-wave2a.md` (AssistantDock iframe, `no production file … value-imports from src/assistant/`, 7 preview-tag cases). **2 are new, from the tc-c merge, not from my change** (same 2 fail with my change stashed; bisected on the four merge commits: 0 fail after tc-a and tc-b, 2 fail after tc-c): `assistant/__tests__/batch-tool-inputs.test.ts` "a theme batch validates every destination before writing…" and "local theme asset plans retain completed effects…". Cause: a `theme_write_file` items batch now returns `results: [{ index, ok, result: { path, … } }]`, the test reads `results[].path` (`undefined`). tc-c's owner must either update the test or restore the flat shape; I did not decide which.
- §4 blocks (3, 4, 5, 7, 15, 17) print nothing on the S4a and S13 diffs in Tovu and on the S12b diff in Jini. 4.8 in Jini prints the 5 comment lines that were reworded in the same place (see Jini report). 4.16 Tovu: `getThemesAgentToolCatalog` 111 lines is the accepted registration-list exception already in the base; my change adds no line to it.

## Red-first evidence (pasted, not committed alone)

- Gateway: `theme_list_files({})` with the registry on the route → received `'themeId' (non-empty string) is required`, expected that text + ` List valid values for \`themeId\` with content_read.theme.`
- Typed: received `invalid arguments for theme_list_files: supply required argument \`themeId\`; Input schema: {…}`, expected `…; list valid values with content_read.theme; Input schema: {…}`.
- Gate: `every theme file tool says content_read.theme is where theme ids come from` failed with `[]` vs `[{ path: 'themeId', toolId: 'content_read.theme' }]`.
- Scanner tests were written together with the scanner (one failure fixed: mention order was grouped by id, not source order). Not strict red-first; stated plainly.

## A finding that changes the sheet

The sheet says `obtainFrom: "theme_list"`. `theme_list` is a **retired id** (`RETIRED_READ_TOOL_TO_CARD`): the registry does not hold it, the live lister is `content_read.theme` (the property's own description already says so). The new gate "every `obtainFrom` names a registered read-only tool" failed on `theme_list` for 10 locations, so the declaration is `obtainFrom: "content_read.theme"`. Sentences (new):
- typed: `…supply required argument \`themeId\`; list valid values with content_read.theme; Input schema: {…}`
- gateway: handler text + ` List valid values for \`themeId\` with content_read.theme.`
A dotted id works as a plain tool id in both sentences; whether the model should call it by its wire name (S3's `toolCallText`) is not decided here.

## S4a deliverables

- Counts: registered tools 324 (+ frontend capabilities not scanned) · MCP-local tools 14 · declared guide modules 15 · distinct tools named 211 · mentions: registry 1293, mcp-local 38, guide 320 · gateway form: see `tool-guides.json` `gatewayForm` · unknown calls 6 · unclassified candidate files 161.
- Unknown calls: `agent_plugin_<id>` in `plugins_set_enabled.inputSchema.enabled` and `agent_plugin_ui_ux_design`, `agent_plugin_how_tovu_works`, `agent_plugin_site_import` in the how-tovu-works and tovu-theme guides. These look like the per-plugin tool names a plugin publishes; the scanner cannot know them, so they stay as findings for a person to judge.
- `pinnedFit`: 202 named descriptors, 533124 bytes against 64 / 262144: **does not fit (OD-7)**. It counts every registered descriptor any model-facing text names, registry text included (1293 of the mentions are one tool's description naming another).
- Tests that read description or guide text (found by `rg -F` of 481 text windows around registered ids; S4b needs this list): `assistant/__tests__/{content-read-tool.tw3, tool-search-keywords.publish-pending-ranking, tool-registrations.comments, tool-registrations.themes, content-read-retired-id-rewrite, content-read-tool, tool-registrations.post, tool-registrations.menus}.test.ts` · `assistant/__tests__/fixtures/{tool-search-operator-requests.json, moved-tools.golden.json, tool-metadata.baseline.json}` · `features/recovery/__tests__/unit/agent-tools.unit.test.ts` · `features/deployments/__tests__/publish-agent-tools.unit.test.ts` · `server/inbound/assistant/__tests__/fixtures/daemon-tool-ids.json` · `features/plugin-runtime/__tests__/unit/extract-s6-g-plug.golden.json` · `features/database/__tests__/db-tool-descriptors.snapshot.unit.test.ts` · `features/theme/__tests__/tool-registrations.page-publication-read.test.ts` · Jini `cms/src/navigation/__tests__/agent-tools.menu-delete-hint.test.ts`.
- `development/scripts/lib/tool-guide-scan.ts` decides "unknown call" by shared first word with a real tool (`menus_list_menus` shares `menus`), which is how SQL (`json_each(`) and helpers (`some_helper(`) stay out. A tool invented in a domain no tool has is not found.
- The candidate list (161 files) is NOT classified by hand: `tool-guide-sources.json` holds only the 15 declared guides. Classifying 161 files is S4b's input.

## Left / next step

1. S13: step 0 rows `web_fetch_page + sitePath` and `web_screenshot_page + width` were not re-verified this run (`sitePath` is in the schema). Case "pages_read_html for `/`" and the clamp classification were done in wave2a. The sheet's "every obtainFrom is a tool `tool-guides.json` lists as pinned" is not implemented: `tool-guides.json` has no per-tool pinned list, and `pinnedFit` does not fit (OD-7). `theme_set_active`'s own `themeId` property (not the shared one) and `content_read.theme_page_publication.themeId` (got it through the shared constant) — only the first is left without `obtainFrom`.
2. OD-7 (descriptors do not fit the pinned limits) needs the owner before S4b.
3. tc-c's 2 failing batch tests (above) and the 4 why-comments blocks.
4. Jini: `pnpm api:check` was not run (it was red on the base per `tc-wave2a.md`); S12b adds `missingArgumentGuidance` to `core ./tool-input-repairs` (existing entry).

## Overlap with other runs (files)

Tovu: `development/scripts/{check-tool-guides.ts,lib/tool-guide-*.ts,size-debt.json}`, `development/parity/tool-guide*.json`, `package.json` (one script line), `features/theme/agent-tools.ts` (`THEME_ID_PROPERTY`, in lane T's T-TH-08 move list), `assistant/__tests__/{tool-registrations.contracts,theme-list-files-malformed-input-status.integration}.test.ts`, `fixtures/moved-tools.golden.json`.
