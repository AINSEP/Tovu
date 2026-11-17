# combine-1 (Tovu): `integ/merge-2026-11-17`

Cut from `origin/refactor/terra` = `232764af5`. Companion Jini branch of the same name (cut from `65d73b0d5`). Node 24.22.3, npm ci in root + apps/admin + apps/site-chat + apps/desktop, `link-jini.mjs` against the **merged Jini** (`/home/user/Jini` on `integ/merge-2026-11-17`, built with `pnpm --no-bail -r build`), contracts + sdk built. `apps/desktop/node_modules/@jini-ai/*` symlinked to the local Jini by hand. Never force-pushed; `refactor/terra`, `main`, `plan/*` not touched.

## Merges (one `--no-ff` each, in the requested order; all 10 merged, no conflicts)

| # | Branch | Merge SHA | Notes |
|---|---|---|---|
| 1 | integ/ratchets-green-2026-11-17 | `838a7b5ff` | clean |
| 2 | integ/wave1-merge-2026-11-17 | `a481c9085` | clean |
| 3 | wave1/hooks-sweep-1 | `41a6bf4e0` | clean |
| 4 | fix/hang-bugs-i18n | `5362463a3` + fix `346e252d4` | semantic conflict, see below |
| 5 | fix/site-share-errors-shell | `28506bbcb` | clean |
| 6 | fix/b07-copy-overwrite | `cffada52a` | report only (same `fixes-1.md`), empty tree change |
| 7 | fix/charts-recharts-repin | `8335d8a4b` | clean; root `package.json`/lock pin `@jini-ai/provider-plugins` 0.7.1 |
| 8 | ci/why-comment-gate | `6dbb9fda7` | clean |
| 9 | wave2/daemon-r7 | `52f748dac` | clean; pairs with the Jini `wave2/daemon-r7` merge |
| 10 | integ/desktop-p0-2026-11-17 | `ae00c7722` | report only (4 cloud-results files) |

Final report commit (this file) comes after `ae00c7722`; its SHA is in the final message.

**Fix commit `346e252d4`** (after merge 4, one commit): `ratchets-green` moved `formatUploadFailureMessage` from `use-post-editor.hooks.ts` into `hooks/post-editor-file-upload.ts`; `fix/hang-bugs-i18n`'s `posts-i18n.unit.test.ts` (cut before the move) still imported it from the old path (red: `formatUploadFailureMessage is not a function`). Repointed the import, no re-export. admin `src/features/posts` + `pages` i18n tests: 27 files / 715 pass.

## Per-merge gates (each merge: `npm run typecheck`, the 5 ratchets, changed-file tests)

Ratchet outputs per step compared line by line (sorted diff, lines present after the merge that were not present before): **no new line after any of the 10 merges.** Outputs kept in `/tmp/rat/T/r1..r8` (container only).

- `npm run typecheck`: after merges 1-7 exactly **one** error, the expected pair gap: `agent-daemon-scope.ts(88,295): '"@jini-ai/daemon/http"' has no exported member named 'registerToolCatalogRoutes'` (the merged Jini `wave2/daemon-r7` deleted it; the Tovu half is merge 9). After merge 9: **0 errors**.
- Base (unmodified `232764af5`) ratchets, for reference: `check:size` red (17 worsened), `check:complexity` red (22 new + 1 worse), `check:architecture` red, `check:errors` 0 (WARN, 12 New), `check:hooks` 0 (ok at 284).
- Changed-file tests per merge: merge 1 admin 0 fail, node:test 120/122 (2 = `serve-command-wiring.unit.test.ts`, base-red); merge 2 pass; merge 3 admin + node pass; merge 4 admin 1 fail (the semantic conflict, fixed above); merge 5 pass; merge 7 node 6/8 (2 = charts pin tests, see base-red); merge 8 22/22; merge 9 47/48 (1 = `component-catalog-routes.integration`, base-red).

## Final tree (`ae00c7722`) gates

| command | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:tests` | exit 0 |
| `npm run check:size` | exit 0: "ok: 203 violations (162 functions, 41 files); 193 debt entries, 10 accepted exceptions." (base was red) |
| `npm run check:complexity` | exit 0: "ok: 43 entries (23 cyclomatic, 20 cognitive)." (base was red) |
| `npm run check:errors` | exit 0: "Error gate passed: 817 findings in 483 file/rule entries." (9 entries improved; base had 12 New) |
| `npm run check:hooks` | exit 0: "hook-injection: ok" (151 components, 238 direct calls; base 284) |
| `npm run check:architecture` | **exit 1** (red on base too, PARTIAL upstream in ratchets-green). Hard metrics now: back-edges into composition root 0 (base 6), largest SCC 5 (base 60, baseline 22), module cycles: one NEW pair `site-backup <-> source-control` (base: 3 new pairs), API surface 853 vs baseline 821 (base 852). Warn tier unchanged: propagation (runtime-only) 3.18 vs 3.06, hub count 363 vs 335. No new line vs the tree before any merge. |
| `npm run check:why-comments` (against `origin/refactor/terra`; recorded, NOT fixed) | exit 1: 187 files with removed lines, **2 comment blocks lost**: `apps/admin/src/integrations/chart-providers/__tests__/recharts-bundle-integer-ticks.unit.test.ts:15` (`[9506bf0b3b6a]`, comment about keeping in step with `recharts_browser_approval.version`; reworded when the test started reading the version from the root manifest) and `apps/website/src/assistant/tool-catalog-live-query.ts:30` (`[696836198311]`, "stable identity — pass this into `registerToolCatalogRoutes` exactly once"; the function was replaced by `toolCatalogRoutes`). |
| `cd apps/desktop && npm ci`, `@jini-ai/*` symlinked to the local Jini, electron binary fetched with `node node_modules/electron/install.js`, `npm run gates` | **6 gates: 6 pass, 0 fail** (tree-quiet, tests, typecheck, coverage, complexity, js-backslide), `check-gates: OK` |
| Changed test files of every merged branch re-run on the final tree (56 files): admin vitest | 23 files, 462 pass, 0 fail |
| same, node:test (website / packages / development) | 355 tests, 350 pass, 5 fail, **all 5 also fail on an unmodified `origin/refactor/terra` worktree** (run: 6 of the same 15 fail there): `serve-command-wiring.unit.test.ts` x2 (source-text wiring pins, `runServeCommand ... app.listen(port, host)` and `BR-07 shutdown`), `recharts-package-pin.unit.test.ts` x2 ("approval equals the packaged manifest", "every pinned file is on disk with exactly the pinned bytes": the local Jini link is not byte-identical to published 0.7.1, by design; documented in `fixes-2.md`), `component-catalog-routes.integration.test.ts` ("a live run is required"). BASE-RED standing rule: no new failure. |

## Not done / for the owner

- `check:architecture` still red (pair `site-backup <-> source-control`, API surface 853 vs 821): suggested cut is in `cloud-results/ratchets-green.md`.
- `check:why-comments`: the two blocks above need either to be put back/moved or listed in `development/why-comments-debt.json` with a reason.
- Charts pin: stays red under a linked Jini until Jini publishes the terra build of `@jini-ai/provider-plugins` and Tovu re-pins (DX-OD10 release step).
- Jini `wave1/hooks-sweep-1` was **skipped** in the Jini repo (see its report); the Tovu half merged fine because the Tovu hook sites are independent.
- Push: normal `git push -u origin integ/merge-2026-11-17`; the desktop pre-push hook ran its gates (see the push line in the final report).
