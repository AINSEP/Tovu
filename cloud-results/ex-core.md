DONE

# ex-core (2026-11-22): C-contracts-core-1 and C-contracts-core-2, J and T

All four steps landed and were pushed, as Codex's FIX corrected them. One file the corrected sheet still lists as moving was **held in Tovu** under STOP 5: `extension-capability-vocabulary.ts` (reason under core-1.J). No step was BLOCK. FILES-LEFT went from **2509 to 2504**.

Unattended cloud run, Opus high. No subagents, no codebase-memory tools, no force-push, no `--no-verify`, no `git pull --rebase`, no tags, no publish. Only `codex/ex-core-jini` (Jini) and `codex/ex-core-tovu` (Tovu) were pushed, each with a plain `git push`.

## Branches and SHAs

| repo | branch | base | commits |
|---|---|---|---|
| Jini | `codex/ex-core-jini` | `origin/integ/merge-12-2026-11-22` `6b8e0d48a` | `73f32cec5` core-1.J; `7a621602a` core-2.J |
| Tovu | `codex/ex-core-tovu` | `origin/integ/merge-12-2026-11-22` `41e948ee4` | `74e3b5381` core-1.T; `d024b2494` core-2.T; plus this report commit |

Tovu was linked against Jini `codex/ex-core-jini` (local build of `7a621602a`; core-1.T ran against `73f32cec5` plus the core-2 files, which add exports only).

## Setup (as in `combine-12-tovu.md`)

- Node 24.22.3 (`/opt/node24`), npm 11.19.1, pnpm 10.33.2 (corepack).
- Jini (fresh clone, no `node_modules`): `pnpm install --frozen-lockfile` exited 0. `pnpm --no-bail -r build` exited 0 with 0 `error TS`.
- Jini was shallow, so `check:cross-package`'s `--base 35c4961af` could not resolve. I unshallowed `integ/merge-12-2026-11-22` (fetch only) to get a real baseline.
- Tovu:
  - `npm ci --ignore-scripts` in root, admin, desktop and site-chat: 0/0/0/0.
  - `link-jini.mjs`: 0 (82 links).
  - `packages/contracts` tsc: 0. `packages/sdk` build: 0.
  - `origin/refactor/terra` and `origin/main` were fetched for why-comments.
- Plan read: `origin/plan/whats-left-1122` `1aab7deea`:
  - `plans/P9-extraction.md` §1
  - `plans/P9-steps/C-contracts-core-{1,2}.md`
  - `plans/P9-codex-verify-N1-N4.md` (both steps are FIX; its corrections were applied over the sheets)
- Test runner:
  - Each Tovu test file runs alone under a 15-min watchdog, 3 in parallel, using the root `npm test` imports.
  - A red file was re-run with the tree detached at `41e948ee4` (same `node_modules`), then the branch was checked out again.

## Baselines (unmodified trees)

**Jini:**
- Exit 0: `guard`, `api:check`, `check:hooks`, core `typecheck`.
- Exit 1 on base: `check:size` (BASE-RED: `launch.ts createAgentExecutor` worsened, plus 3 stale `json-ipc` rows).
- Exit 1 on base: `check:complexity` (BASE-RED: 4 rows in agent-runtime, chat, core `errors/reporter`, ui).
- Exit 1 on base: `check:cross-package` (BASE-RED: **2846** findings, most of them XP4 "contract JavaScript contains runtime statements" across the existing `contracts/{server,ai-trace,vault,...}`).

**Tovu:**
- Exit 0: `typecheck`, `typecheck:tests`, `check:boundaries`, `check:complexity`, `check:hooks`, admin `tsc`.
- Exit 1 on base: `check:size`, `check:why-comments` (450 lost, 370 allow-listed), and `check:architecture` (1 regressed row: propagation runtime-only 3.06 → 3.27).

---

## C-contracts-core-1.J (Jini `73f32cec5`)

**Files moved (verbatim):**
- `apps/website/src/contracts/core/post-author.ts` → `packages/core/src/contracts/site/post-author.ts`. Export `./contracts/site/post-author`, `universal`.
- `apps/website/src/contracts/core/gated-mutations/watermark.ts` → `packages/core/src/contracts/site/gated-mutations/watermark.ts`. Private, no export (Codex).
- Test: `.../gated-mutations/__tests__/unit/watermark.unit.test.ts` → `packages/core/src/contracts/site/gated-mutations/__tests__/watermark.unit.test.ts`. Edits: line 2 `import { test } from "vitest"`; line 4 `../watermark.js`.

**Kept in Tovu (Codex FIX):** `approval-i18n`, `assistant-content-guidance`, `fs-folder-recovery`, `consent-refusal`, `credential-store`, `custom-credential-categories`, `redirect-tables`, `publish-history-list-limit`, `public-page-security-headers`, `gated-mutations/ports`, `gated-mutations/token`. Their J exports and T rewrites were dropped. The security-header and token tests stay in Tovu.

**HELD in Tovu (STOP 5, which Codex's verification did not catch): `extension-capability-vocabulary.ts`.**
- Its Tovu test `contracts/core/__tests__/unit/extension-capability-vocabulary.unit.test.ts:27-28` reads `features/plugin-runtime/host-binding.ts` off disk.
- It asserts that the import matches the regex `from "../../contracts/core/extension-capability-vocabulary.js"`.
- Repointing `host-binding.ts:10` to the Jini subpath turns that assertion red. Fixing it means editing an assertion, not an import line.
- This is the same reason Codex kept `site-key-state.ts`.
- To unblock, either the owner approves rewriting that regex to the Jini specifier, or the guard is re-expressed. The move itself is one file plus 2 importer lines.

**One literal change (log it in `plans/P9-BREAKS.md`, which is on the plan branch, so the rows are listed here):**
- `watermark.ts:48` error message: `"... open transaction handle (U-002-B1)"` → `"... open transaction handle"`.
- Jini guard **N4-runtime-spec-id** forbids spec ids in runtime literals. The doc comment keeps `U-002-B1`.
- No test asserts the message; the 3 tests assert the error class.

**Tests:** watermark 3/3 green (moved, green).

**Named mutation (Codex: `stampWatermark`'s transaction guard):**
- Mutation: `if (!tx || !tx.isOpen)` → `if (!(!tx || !tx.isOpen))`.
- Result: **3/3 red** (all three watermark tests). Reverted: 3/3 green.
- Raw: `ex-core-raw/core1-J-mutation.txt`.

**Gates (before → after):**
- `pnpm --filter @jini-ai/core... build`: 0. Core `typecheck`: 0.
- `api:check`: 0. Then `api:update`, additive only: **+1 entry**, `./contracts/site/post-author` with `postAuthorForDisplay: function`.
- `guard` 0 → 0. The first run was 1 on the N4 literal above; it was fixed as described.
- `check:size`, `check:complexity`, `check:hooks`: output identical to base.
- `check:cross-package`: still red. Adds only XP4 rows of the base's class for the new `contracts/site` files. Totals: 2846 → 2886 after both steps (+40, all XP4, all in `packages/core/src/contracts/site/**`).
- Changeset: `.changeset/p9-C-contracts-core-1.md` (patch).

## C-contracts-core-1.T (Tovu `74e3b5381`)

**Deleted:** `contracts/core/post-author.ts`, `contracts/core/gated-mutations/watermark.ts`, `contracts/core/gated-mutations/__tests__/unit/watermark.unit.test.ts`.

**Importers repointed (5)** → `@jini-ai/core/contracts/site/post-author`:
- `features/theme/static-render-content.ts:2`
- `server/inbound/public-http/routes/site/pages/render-context/post-previews.ts:18`
- `server/inbound/public-http/http/site/render/template-render-data.ts:5`
- `server/inbound/public-http/http/site/render/post-body.ts:10`
- `server/inbound/public-http/http/shared/post.ts:2`

Watermark had no importers, only two comments in `platform/db`. Those comments are unchanged.

**Debt files:** no entries named the moved files.

**Tests:** 19 files that import a repointed module or the author contract.
- **18 green.**
- 1 red, `widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts` 64/1 ("unknown embed type" warning). It is **identical at `41e948ee4`**, so BASE-RED.

**Gates vs base:**
- `typecheck` 0, `typecheck:tests` 0.
- `check:boundaries`, `check:size`, `check:complexity`, `check:hooks`, `check:why-comments`: no diff.
- `check:architecture`: same single regressed row as base. Propagation (all-import) went 12.40% → 12.41% only because two modules left the denominator (2293 → 2291); the hub count is unchanged at 315.
- Raw: `ex-core-raw/core1-T-*`.

---

## C-contracts-core-2.J (Jini `7a621602a`)

**Files moved (verbatim):**
- `contracts/core/request-facts.ts` → `packages/core/src/contracts/site/request-facts.ts`. Export `./contracts/site/request-facts`, `universal`.
- `contracts/core/soft-delete.ts` → `packages/core/src/contracts/site/soft-delete.ts`. `universal`.
- `contracts/core/strict-base64.ts` → `packages/core/src/contracts/site/strict-base64.ts`. **`node`**: it uses `Buffer` (Codex).
- Test: `contracts/core/__tests__/unit/strict-base64.unit.test.ts` → `packages/core/src/contracts/site/__tests__/strict-base64.unit.test.ts`. Edits: line 2 vitest; line 4 `../strict-base64.js`.

**Kept in Tovu (Codex FIX):**
- `runtime-mode.ts` + `runtime-mode.unit.test.ts` (reads `TOVU_RUNTIME_MODE`).
- `theme-ids.ts`, `theme-slots.ts`, `settings-vocabulary.ts`.
- `site-key-state.ts` (the parity test reads the Tovu source).

**Product literals → jini form (BREAKS rows):**

| file:line (Tovu) | was | now (Jini) |
|---|---|---|
| `request-facts.ts:10` | `export const TOVU_REQUEST_FACTS = "tovuRequestFacts"` | `export const JINI_REQUEST_FACTS = "jiniRequestFacts"` (locals key changes) |
| `request-facts.ts:12,23,25,35` | `TovuRequestFacts` | `RequestFacts` |
| `request-facts.ts:36,37` | `TOVU_REQUEST_FACTS` | `JINI_REQUEST_FACTS` (the error text now reads `locals.jiniRequestFacts`) |

The `"tovuRequestFacts"` literal had no other reader in Tovu, Jini, admin or e2e. Every writer and reader goes through the constant.

**Tests:** strict-base64 11/11 green (moved, green). Request-facts and soft-delete have no Jini test. Their Tovu tests exercise the Tovu Express adapter and stay.

**Named mutation (Codex: the decode guard):**
- Mutation: `if (!value || value.length % 4 !== 0 || !STRICT_BASE64_PATTERN.test(value)) return null` negated.
- Result: **11/11 red**. Reverted: 11/11 green.
- Raw: `ex-core-raw/core2-J-mutation.txt`.
- The sheet's original mutation, on `theme-ids.ts` checked by `runtime-mode.unit.test.ts`, does not apply: both files stay in Tovu.

**Gates:**
- Build: 0. Core typecheck: 0.
- `api:check`: 0 before the update. `api:update`, additive only, **+3 entries**:
  - `./contracts/site/request-facts`: `JINI_REQUEST_FACTS` (variable), `RequestFacts` (interface), `readRequestFacts` (function)
  - `./contracts/site/soft-delete`: `isTrashed` (function)
  - `./contracts/site/strict-base64`: `decodeStrictBase64` (function)
- `guard`: 0.
- `check:size`, `check:complexity`, `check:hooks`: identical to base.
- `check:cross-package`: covered under core-1.J (+40 XP4 in total, all in `contracts/site/**`).
- Changeset: `.changeset/p9-C-contracts-core-2.md` (patch).

## C-contracts-core-2.T (Tovu `d024b2494`)

**Deleted:** `contracts/core/request-facts.ts`, `soft-delete.ts`, `strict-base64.ts`, `__tests__/unit/strict-base64.unit.test.ts`.

**Importers repointed:**
- **request-facts (7 files)** → `@jini-ai/core/contracts/site/request-facts`. Renamed at every use: `TOVU_REQUEST_FACTS` → `JINI_REQUEST_FACTS` and `TovuRequestFacts` → `RequestFacts`.
  - `assistant/admin-frontend-owner.ts:3`, `assistant/site/visitor-frontend-control.ts:13`, `assistant/site/visitor-request-origin.ts:3`
  - `server/inbound/shared/request-facts.ts:4,18,27`
  - Tests (identifier rename only, no assertion change): `assistant/__tests__/admin-frontend-owner.unit.test.ts:4,15`, `server/inbound/shared/__tests__/request-facts.unit.test.ts:5,52`, `server/runtime/composition/__tests__/jini-routes.unit.test.ts:8,80,146,147`
- **soft-delete, direct (18 files)** → `@jini-ai/core/contracts/site/soft-delete`:
  - `contracts/core/scheduled-publish.ts:1`, `assistant/__tests__/small-contracts.unit.test.ts:8`, `features/widgets/deps.ts:6`, `server/inbound/public-http/routes/site/media-rendition.ts:10`, `features/publish-content/__tests__/apply-loop.test.ts:29`
  - `features/post/{post-import,post-read,post-retire,post-slugs,post-tool-delete,post-trash,post-update,post-write-effects,publish-content,reverters}.ts`
  - `features/post/__tests__/{post.delete,publish-content,retire-post}.test.ts`
- **soft-delete barrel:** `features/post/index.ts:6` `export { isTrashed } …` was **deleted**. `isTrashed` was split out of its 6 barrel users (Codex's list; a multi-line rg confirmed there are no others):
  - `contracts/core/commands/__tests__/post-delete-reverter.test.ts:12`
  - `features/email-templates/operations.ts:10`
  - `features/pages/html-document-store.memory.ts:8`
  - `features/pages/tool-registrations.ts:13`
  - `features/seo/index.ts:15`
  - `server/inbound/admin-http/routes/themes/explore.ts:52`
- **strict-base64 barrel:** `contracts/core/index.ts:7` was **deleted**. Its 3 users were repointed to `@jini-ai/core/contracts/site/strict-base64`:
  - `server/inbound/admin-http/routes/media/replace.ts:3`
  - `media/upload.ts:6`
  - `publish-content/blob-put.ts:4`

No re-export shells. No debt entries named the moved files.

**Tests:** 272 files. They are every test that imports a repointed module (directly or by a sibling-relative path), every changed test, and the sheet's must-stay-green list, filtered to files that still exist.
- **266 green.**
- 1 is the deleted strict-base64 test (moved to Jini).
- 5 red, all **identical at `41e948ee4` (BASE-RED)**:
  - `resolve-html-page-embeds.integration` 64/1
  - `mail/attempts-retention.dialects` 6/2
  - `production-readiness-boot.integration` 7/1 (stale `SqliteWorkspaceRepo` inventory hint)
  - `pages-html-revisions-wiring.integration` 0/2 (`expectedVersion` required)
  - `bundled-inactive-gating.integration` 7/1
- Raw: `ex-core-raw/core2-T-tests.txt`, `core2-T-base-attribution.txt`.

**Gates vs base:**
- `typecheck` 0, `typecheck:tests` 0.
- `check:boundaries`, `check:size`, `check:complexity`, `check:hooks`: no diff.
- `check:why-comments`: same 450 lost / 370 allow-listed. Only the scanned-file count changed (3020 → 3030).
- `check:architecture`: same single regressed row as base. All-import propagation went 12.40 → 12.42 and hubs 13.74% → 13.77%, both because the denominator shrank (2293 → 2288 modules); the hub count is unchanged at 315.
- Raw: `ex-core-raw/core2-T-gates-vs-base.txt`.

---

## FILES-LEFT (Jini-bound files still in Tovu; `plans/P9-data/tools/{scan,plan}.mjs` re-run on the tree)

| | movable | re-export shells | total |
|---|---|---|---|
| before (`41e948ee4`) | 2488 | 21 | **2509** (matches the plan) |
| after (`d024b2494`) | 2483 | 21 | **2504** |

That is −5 files: `post-author`, `watermark`, `request-facts`, `soft-delete` and `strict-base64`.

The scanner still counts as Jini-bound the **17** files from these two sheets that did not move:
- 16 were reclassified STAYS by Codex.
- 1, `extension-capability-vocabulary.ts`, is held under STOP 5.

Re-running `plan.mjs` against the updated `stays-in-tovu.md` would drop them from the count.

## Owner rules checked in the diff

- **Verbatim moves:** only import lines, the jini literals above, the N4 message and the test import lines changed. Every why-comment moved with its code.
- No re-export shells, no new layer or port, and no `@jini-ai/<other>` import added.
- The `_optional = {}` pads (`post-author`, `watermark`, `request-facts`, `strict-base64`) are kept unchanged.
- No hooks or components were touched. Size and complexity are unchanged.
- No `/tovu/i`, `apps/` or `#src` text in the Jini files.
- No CSS.

## Not done / for the owner

1. `extension-capability-vocabulary.ts` is held (STOP 5, above).
2. Add the BREAKS rows above to `plans/P9-BREAKS.md` on the plan branch. I did not push to it.
3. Jini `check:cross-package` XP4 is red on base and flags every runtime statement under `contracts/**`. The P9 destination `contracts/site/*` adds 40 rows of that class. Whether `contracts/site` should be on that rule's allow-list is an owner or plan call.
