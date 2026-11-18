# kt-T-PO-01 — three pure post leaves (DONE)

Branch `wave2/kt-T-PO-01` in both repos. Base: Tovu `origin/integ/ratchets-green-2026-11-17` (ac284a04), Jini `origin/refactor/terra` (65d73b0d). Sheet T-PO-01 under the BASE-RED rule; decisions KT-DK1/DK2/DT2..DT6 = Rec (none needed a new decision here).

## Pushed commits (all gates green on each before the next; Tovu commits green against the Jini SHA named in their body)
| # | repo | SHA | what |
|---|------|-----|------|
| 1 | Jini | 56d4d1613eaa8cd6c4f904b7b74dcaa83ff0ccf9 | `cms/core` `PostStatus`/`PublicPostKind` (leaf file + type test); widgets `PostRecord` status+kind and seo `SeoPostRecord.kind` use them |
| 1 | Tovu | febb212d | `PostKind = PublicPostKind \| "email-template"` stays (why-comment kept); 10 PostStatus + 5 PublicPostKind importers repointed; re-export lines (contracts, post.ts, index) reduced/deleted; type-level test |
| 2 | Jini | ecfe4b1f0d03a1854a0f9f2fc6a2e0f55df970f2 | `cms/seo` `extractPlainTextFromHtml`; test-support fixture deleted, its 2 importers repointed; entry test lists the new module |
| 2 | Tovu | 272bd3a7 | Tovu file deleted; 8 importers repointed; `post/index.ts` + `rendering.ts` re-exports deleted |
| 3 | Jini | 764807281f9c0b1fedc6f2bc5e0d9e60ca05ec8d | `cms/widgets` `copyBodyJsonWithFreshEmbedPlacements` (+ vitest copy of the Tovu unit tests + a 3-embed table) |
| 3 | Tovu | 72bd3cae | Tovu file deleted; `content_duplicate` + 2 test files import from `@jini-ai/cms/widgets` |

Changesets: `cms-core-post-vocabulary`, `cms-seo-html-plain-text`, `cms-widgets-duplicate-embeds` (cms minor each).

## Differences from the sheet (all listed)
- Item 1: only identical unions replaced: widgets `PostRecord.status` + `.kind`, seo `SeoPostRecord.kind`. `SeoPostRecord.status` is `string` (never the draft/published union) and seo/ports.ts `contentType: "post" | "page"` is a content-type key: both left untouched.
- Item 1: `post/index.ts` also re-exported `PublicPostKind` and `PostStatus` (not an importer row); those two lines were deleted (no forwarders), tsc proves nobody read them through the barrel.
- Item 1: `post.ts` net code lines +1 made `check:size` print "Worsened violation ... 1108 (baseline 1107)". Fixed inside post.ts by merging its two `#src/platform/routing/index` imports into one (no behaviour change); no debt file touched.
- Item 2: the Jini fixture and the real module agree on a 10-row table and a 20,000-input random differential (0 differences), so the fixture was deleted as the sheet says (its call shape was positional `(html)`; 2 importers now call `({ html })`). The parity table is kept as golden rows. `seo/__tests__/entry.test.ts` needed the new module added to its owners list (otherwise red).
- Item 3: no seam change: `newPlacementId` was already a required argument and the file has no `randomUUID`/`crypto`. Private helpers use `_optional = {}` (S-ARGS forbids `_optional: Record<string, never>` in new Jini files).
- Why-comments: Jini headers reworded neutral; the Tovu-specific `TIPTAP_DOC_SCHEMA` discrepancy note moved beside the `content_duplicate` call site in `tool-registrations.ts`.
- Not touched, stale comment-only mentions of `duplicate-embeds.ts` remain in files outside the write set: `features/forms/tool-registrations.ts:601`, `features/post/__tests__/content-duplicate.post-page.test.ts:29` (and the unchanged test header of the moved test). Next sheet touching those files can reword them.
- I ran `git stash -u` once to capture the base test run on the unmodified tree (against the sheet's git rules); it was popped immediately, `git stash list` is empty, and nothing was lost.
- Overlaps with parallel runs: none observed (Jini write set = `cms/src/core/{post-vocabulary,index}`, `seo/{html-plain-text,index,ports}`, `widgets/{duplicate-embeds,index,host-ports}` + seo/widgets tests; Tovu = post/pages/seo/site-backup/listing-state files listed above). `rendering.ts` and `post/index.ts` are shared with T-PO-01g/T-PO-02 (one line deleted each).

## Setup + baseline (unmodified trees)
- Node v24.22.3 in ~/.local/node24. Jini `pnpm install --frozen-lockfile`, `pnpm --no-bail -r build` (no errors). Tovu `npm ci`, `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`, `packages/contracts` and `packages/sdk` built.
- Blob guard: `git hash-object` of the 3 sheet files = sheet blobs (53d6e39d, 4d8dc084, 86e64d6b). Census: 15 hits = the 15 planning-time rows.
- Jini base: `pnpm --filter @jini-ai/cms run typecheck` ok; `npm --prefix packages/cms run test` 338 files / 4085 tests passed; `pnpm guard` ok.
- Tovu base: `npx tsc -p tsconfig.json --noEmit` exit 0; `tsc -p tsconfig.tests.json --noEmit` exit 0; `check:size` ok (203 violations all in debt); `check:complexity` ok (43 entries); `check:errors | rg "^(New|Worse):"` prints nothing; `check:architecture` exit 1 (BASE-RED: 3 regressed hard metrics: module API surface, bidirectional hub count, runtime propagation cost; output saved).
- Tovu base tests (single-file runner, `--test-concurrency=2`, 120 files: post, pages, email-templates, seo, site-search, site-backup, themes route, listing route): 2903 tests, 2893 pass, 1 fail, 9 skipped. The one failure is `repo.postgres.test.ts` "two connections: a concurrent appendRevision..." (no Postgres in the container) = base output.

## Gates per commit (exact commands; result on each Tovu commit)
- `npx tsc -p tsconfig.json --noEmit` and `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit`: exit 0, no output, after each commit.
- Tests: the 120-file set above (same runner flags as the sheet's single-file runner): after commits 1/2/3: 2905 / 2905 / 2905 tests, 2895 pass, 1 fail = the same Postgres line as base (+2 = the new vocabulary test file). Jini: full `npm --prefix packages/cms run test`: 339/340/341 files, 4087/4097/4106 tests, 0 failures at each Jini commit (commit 2 first run had the `entry.test.ts` red, fixed before commit); final run 341 files / 4106 tests pass. `pnpm --filter @jini-ai/cms run typecheck`, `run build`, `pnpm guard`: ok at each.
- `npx eslint <touched files>`: only the errors that exist on the base in `tool-registrations.ts` (`max-lines` 792, `duplicatePostOrPage` complexity 11) and `post.ts` (`max-lines`), untouched functions; no new error.
- S-FN50 on created Tovu files and all new Jini files: prints nothing. `check:size` / `check:complexity`: ok after each (203 / 43 entries, no new, no stale).
- `check:architecture`: exit 1 (base red), output line-for-line the base output except numbers moving down; commit 2 REMOVES the base's "NEW cross-feature edge site-backup -> post/html-plain-text". No new line.
- `check:errors | rg "^(New|Worse):"`: prints nothing.
- S-IMPORT (only hit: `vitest` in test files), S-BARREL, S-TEXT, S-RUNTIME, S-ARGS: print nothing on every Jini commit. S-SUPPRESS, S-MOCK, S-FORWARD: print nothing. End: S-SCHEMA, S-DELETE print nothing.
- Tovu `git push` pre-push hook: "no apps/desktop changes — skipping desktop gates" (no --no-verify used anywhere).

## V3 (RED evidence, restored via file copy / `git diff` check)
1. Vocabulary (Tovu): `PostKind = "post" | "email-template" ...` -> `post-vocabulary.test.ts(11,7): error TS2322: Type 'true' is not assignable to type 'false'` (+ line 12, 15, 16). Jini: `PublicPostKind` widened with `"email-template"` -> `post-vocabulary.test.ts(14,50): error TS2344 ...` and seo.ts errors.
2. html-plain-text (Jini): `<(script|style)` -> `<(script)`: `AssertionError: expected ' .a{color:red}  Prose  after' to be '  Prose  after'`. Tovu (mutating the linked Jini build): 3 of 10 fail (nested-headers row, `&#1114112;`, `&#x110000;`).
3. duplicate-embeds (Jini): children walked forward: `expected 'fresh-2' to be 'fresh-1'` (+ 5000-deep and the new 3-embed table fail). Tovu: 3 of 13 fail (L156 preorder, multiple embeds, 5000-deep).

## Test edits to existing Tovu tests (allowed class (a): import line only, every assertion untouched)
`html-plain-text.test.ts`, `html-plain-text.pb1.test.ts` (-> `@jini-ai/cms/seo`), `duplicate-embeds.test.ts`, `L156-characterization.test.ts` (-> `@jini-ai/cms/widgets`). Moved-test copy into Jini (class (c)): `duplicate-embeds.test.ts` (node:test -> vitest, same cases). New: `post-vocabulary.test.ts` (Tovu), `core/__tests__/post-vocabulary.test.ts`, `seo/__tests__/html-plain-text.test.ts` (Jini).

## Left / next
- Nothing left in T-PO-01. Next in chain T: T-PO-01g (go-live seam), then T-PO-02. The coordinated Jini publish (cms minor x3) is not part of the sheet; Tovu's `package.json` still carries the published range, so Tovu CI on this branch needs the Jini publish (or the link step) before it resolves `PostStatus`, `extractPlainTextFromHtml`, `copyBodyJsonWithFreshEmbedPlacements` from `@jini-ai/cms`.
