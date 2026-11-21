**Tovu `deps/lockfile-1121` @ `__TOVU_SHA__`** · Jini `deps/lockfile-1121` @ `__JINI_SHA__`

# deps-1121 TOVU (2026-11-21): dependency and lockfile run

Unattended cloud run on Opus high. Node 24.22.3 (`/opt/node24`), npm 11.19.1. Branch created from `origin/integ/merge-10-2026-11-21` (`0973a5fdc8`). Only `deps/lockfile-1121` was pushed. No subagents, no codebase-memory tools, no force-push, no `--no-verify`, no `git pull --rebase`, no tags, no publish.

**Status: COMPLETE. All four steps are done in Tovu.** Step 3 has no Tovu part. There is **no new red** against base in any gate or suite. One admin test failed once during the Step 2 full run, under load, and passed 5/5 twice when run alone. That case is listed below.

## Setup and base
- `npm ci --ignore-scripts` exited 0/0/0/0 in all four roots (root, admin, desktop, site-chat). `link-jini.mjs` was run against the Jini branch. `packages/contracts` `tsc` exited 0 and `packages/sdk` build exited 0.
- Read first: `cloud-results/combine-10-tovu.md`, Jini `cloud-results/combine-10-jini.md`, and `origin/plan/commit-plans-1120:commit-plans/r62t-engaps.plan.md` § Dependency disposition.
- The base gates were run on the unmodified `0973a5fdc8`, linked to Jini `de4e555b9` (`base-*` raw files beside this report):

| gate | base |
|---|---|
| `npm run typecheck` (+ e2e) | 0 |
| `npm run typecheck:tests` | 0 |
| admin `tsc --noEmit` / desktop `npm run typecheck` / site-chat `tsc --noEmit` | 0 / 0 / 0 |
| site-chat `npm test` | **BASE-RED** 161 pass / 1 fail of 162: `site-assistant-transport.test.ts`. Under linked Jini, react 19.2.8 and react-dom 19.2.7 differ. |
| admin `vitest run --maxWorkers=2` | **BASE-RED** 19 failed / 14865 passed / 2 skipped (14886), 5 files. This is the owner's known 19. |
| desktop `npm test` | **BASE-RED** 2204 pass / 3 fail of 2217 (three "cannot be moved aside" cases). The renderer half never runs because the script chains it with `&&`. |

## Step 1: `@ag-ui/core` in site-chat (`952864812`)
- `apps/site-chat/package.json` now has `"@ag-ui/core": "0.0.58"`. This is exactly what Jini `packages/chat` uses (peer and dev, both `0.0.58`).
- `apps/site-chat/package-lock.json` was regenerated with `--package-lock-only`. The only change is one new entry (`@ag-ui/core@0.0.58`, which depends on zod `^3.22.4` and dedupes to the existing 3.25.76).
- `npm ci` in site-chat exited 0. site-chat `tsc` exited 0. Tests are unchanged: **161/1 vs base 161/1**, the same base-red file.

## Step 2: resolution-only security bumps (`1b5776c20`)
No source changes. Lockfiles were updated with `npm update --package-lock-only --no-save <names>`. The only manifest change is in admin (Tiptap).

| root | before → after |
|---|---|
| root | brace-expansion 5.0.7 → 5.0.12 · devalue 5.9.0 → 5.9.4 · js-yaml 4.3.1 → 4.3.2 (the 5.x copy 5.3.0 → 5.5.0) · source-map-js 1.2.1 → 1.2.2 · svgo 4.0.2 → 4.1.0 · undici 8.11.2 → 8.12.4 (7.30.1 → 7.30.2) · vite 8.2.1 → 8.3.6 (rolldown 1.2.4 → 1.2.16, postcss 8.5.26 → 8.5.32, nanoid 3.3.18 → 3.3.20, css-select 5 → 6 as a svgo child) |
| admin | **@tiptap/\* aligned to 3.30.5**: 47 packages. Before, 3.27.2 pins and starter-kit children at 3.31.3 were mixed. All direct pins and overrides are now 3.30.5. The 15 starter-kit children that had floated to 3.31.3 are pinned to 3.30.5 in `overrides`, so one version is installed. @tiptap/y-tiptap 3.0.9 → 3.2.0, plus prosemirror-*/yjs/lib0 patch bumps · @modelcontextprotocol/sdk 1.30.0 → 1.32.2 · vite 7.3.6 → 7.3.7 · source-map-js → 1.2.2 |
| desktop | brace-expansion 1.1.18/2.1.4 → 1.1.21/2.1.7 (5.0.9 → 5.0.12 where resolvable) · undici 6.28.1 → 6.29.1 (7.30.1 → 7.30.2) · vite 8.2.2 → 8.3.6 · source-map-js → 1.2.2 · nanoid → 3.3.20 |
| site-chat | @modelcontextprotocol/sdk 1.30.0 → 1.32.2 · fast-uri 3.1.6 → 3.1.9 · nanoid 3.3.17 → 3.3.20 · vite 7.3.6 → 7.3.7 · source-map-js → 1.2.2 |

- Files: `package-lock.json`, `apps/admin/package.json`, `apps/admin/package-lock.json`, `apps/desktop/package-lock.json`, `apps/site-chat/package-lock.json`.
- `npm ci` exited 0 in all 4 roots. typecheck 0, typecheck:tests 0, admin/desktop/site-chat tsc 0/0/0.
- site-chat 161/1 (= base). Desktop 2204/3, the same 3 cases.
- Admin 20 failed / 14864 passed (base 19/14865). The extra case, `app-panel-permissions.unit.test.tsx > a direct URL to a hidden section > still renders the section for an operator who holds its permission`, is a `findByRole` timeout under load (four suites were running at once). Run alone, it passed **5/5 twice**. Treat it as load-sensitive, not a regression.
- **Tiptap editor mount/save**: all 22 admin test files that import Tiptap passed in the full run, and none is in the failure list (`tovu-tiptap-test-files.txt`). That includes `PostEditor.*`, `use-post-editor*`, `CollectionEntryEditor*`, `EmailTemplateEditor`, `MediaContentEditor*` and the `*-extension` tests. The page editor tests (`PageEditor*.unit.test.tsx`) also passed.

## Step 3: no Tovu part

## Step 4: zod 3.25.76 → 4.6.7 (`d066f29fe`; relinked to the Jini zod commit)
- Manifests: root `zod ^3.25.76 → ^4.6.6`, `apps/desktop` the same, and `packages/contracts` the same. All three resolve to 4.6.7.
- **Source: the import specifier changed in 7 files, and no schema call changed.** `from "zod"` → `from "zod/v3"` in:
  `apps/website/src/assistant/daemon-core-protocol.ts`, `server/inbound/assistant/{agent-daemon-core-client,agent-daemon-site-tools,agent-plugin-preflight-events,tool-access-lowering-route}.ts`, `server/runtime/composition/modules/assistant-tool-exec.ts`, `packages/contracts/src/daemon-connection.ts`.
- Why `zod/v3`: it is the zod 3 API shipped inside zod 4.6.x, so runtime behaviour and every error string stay byte-identical. That covers the issue shape (`received`, "Required", "Expected string, received number") that both repos' tests pin, which the zod 4 API cannot reproduce. The `v3/` copy in 4.6.6 also carries the upstream fixes: the emoji-regex ReDoS and `__proto__` in intersection merge. The 4.6.6 container-size fix (size caps before element parsing) exists only in the v4 core and does not apply to v3 schemas. A full rewrite to the v4 API, with changed error text, is a separate decision for the owner.
- Gates: `npm ci` exited 0 in all 4 roots. typecheck 0, typecheck:tests 0, admin/desktop/site-chat tsc 0/0/0, site-chat 161/1 (= base).
- Admin: **19 failed / 14865 passed / 2 skipped (14886), and the failure list is identical to base** (`step4-tovu-admin-fails.txt` vs `base-tovu-admin-fails.txt`, no diff).
- Desktop `npm test`: 2204/3 of 2217, the same 3 cases as base. Renderer/contracts half run separately: 912 pass / 2 fail of 916 (`WorkspaceChatPane uses no raw React primitives…`, `closing the settings dropdown leaves the sites dialog…`). These are the "+2 known" from combine-10.
- **Node suite on changed files + importers** (20 test files, every website/contracts test that imports one of the 7 modules; `tovu-step4-test-files.txt`): 106 tests, 104 pass, 2 fail, both **BASE-RED**:
  - `agent-daemon-server.tool-restriction-wiring.unit.test.ts`: "imports the shared tool policy resolver" is a source-text test on `agent-daemon-server.ts`, which this run did not touch.
  - `assistant-agent-plugin-preflight.integration.test.ts` "pinned preflight always inlines text…" is recorded as base-red in combine-8 (`combine-8-tovu-full-suite-failing-reasons.txt:159`) and combine-9 (`combine-9-tovu.md:238`, base 1|3|1).

## Every red line
| where | red | status |
|---|---|---|
| site-chat | `site-assistant-transport.test.ts` (react/react-dom 19.2.8 vs 19.2.7 under linked Jini) | BASE-RED, unchanged |
| admin vitest | the owner's 19 (5 files) | BASE-RED, unchanged |
| admin vitest (step 2 run only) | `app-panel-permissions` hidden-section case | load flake; 5/5 ×2 alone |
| desktop `npm test` | 3 "cannot be moved aside" cases (main half) | BASE-RED, unchanged |
| desktop renderer half | `WorkspaceChatPane` raw-primitives case; settings-dropdown/sites-dialog case | BASE-RED (combine-10 "Desktop 3 + 2, all known"); not run by `npm test` (`&&` after a red half) |
| node changed-files | tool-restriction-wiring source test; pinned-preflight integration | BASE-RED (see above) |

## Advisories still open after this run
- **zod 3.25.76** remains nested in root, desktop, admin and site-chat through the *published* `@jini-ai/protocol` / `@jini-ai/agentic` `0.7.3-next.1` (they declare `zod ^3.25.76`). It clears once Jini `0.7.3-next.2` is published and the locks are refreshed. It is also pulled in by `@ag-ui/core 0.0.58` (zod `^3.22.4`) and `@mcp-ui/client 7.1.1` (zod `^3.23.8`). Both are third-party pins and are not overridable without breaking them. Admin and site-chat get zod *only* through those packages, so their lockfiles still show 3.25.76.
- **desktop**: `brace-expansion 5.0.9` and `undici 6.28.0` are bundled inside the `npm` package (`node_modules/npm/node_modules/*`). Bundled dependencies cannot be overridden; only an `npm` package bump would move them.
- Root's nested dev copy `zod 4.6.5` is gone (deduped to 4.6.7).

## Raw outputs
`cloud-results/deps-1121-tovu-raw/`: base and step gate logs (`base-*`, `step2-*`, `step4-*`), admin failure lists, the Tiptap test-file list, and the changed-file test list.
