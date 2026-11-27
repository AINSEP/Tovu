# y5p-pages — Tovu half

## Ordered design commits

1. Completed `adm-pages` Tovu remainder: bind the two page-editor files to Jini.
   Files touched, in order:
   - `apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts`
   - `apps/admin/src/features/pages/PageEditor.tsx`
   - `apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx`
   - `apps/admin/src/features/pages/__tests__/PageEditor.interactive-flush.unit.test.tsx`
   - `apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts`
   - `apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts`
   - `apps/admin/src/lib/__tests__/fixtures/admin-literal-copy.baseline.json`
   - `plans/count-1125/y5-adm-keeps.md`

## Prerequisites and tests first

- Tovu started clean on `codex/tv-y5p-pages`, tracking `origin/codex/tv-y5-adm-3`.
- Jini prerequisite: `origin/codex/y5p-pagesj` at
  `5757657dd1076473cf08706244a23a1e65dd73f6` provides both binders.
- Opened the existing editor/controller anchors and named consumers before edits.
- Read Jini `packages/admin/src/pages/__tests__/y5-page-editor.test.tsx` before
  changing Tovu production files. Its six cases cover root/home collision,
  preview branches/sandbox/remount, authored documents, metadata-first conflict
  and partial HTML failure, pending edit flush/dirty refresh, and exact HTML edits.
- Named mutation `BODY_WRITE_BEFORE_CAS`: perform HTML write before metadata CAS;
  the conflict case must observe no HTML write and turn red.
- Named mutation `DROP_PENDING_HTML_CHANGE`: omit the HTML pane's `setHtml` call;
  the exact-source case must turn red on the working-copy assertion.
- No tests or mutations executed, per dispatch. Jini's supplied report records
  its view tests-first ordering deviation; validation remains with Opus.

## Constraints

- Tovu only; no new helpers, types, hooks, adapters, files, or behavior beyond
  the named bindings and required caller/probe/ledger changes.
- Preserve both binder-produced hook forms for the unchanged theme test.
- Preserve the CMS `PageBodyWriteError` class by injecting its actual value.
- No installs, builds, tests, typechecks, linters, commits, pushes, or `.git` writes.

## Final review

- `PageEditor.tsx`: binding, 58 lines. Imports plus one `bindPageEditor` call;
  required hook references, UI kit, host ports/copy, one-expression video URL adapter.
- `hooks/use-page-editor.hooks.ts`: binding, 62 lines. Imports plus one
  `bindPageEditorHooks` call; returns both injected and live hooks. No hook calls,
  state, effects, loops, SQL, class bodies, or statement branches remain.
- Re-read both final files against G3, then appended exactly their two anchored
  regexes inside the existing `## Keep rules` text fence.
- Three tests now import `PageEditorController` directly from Jini; behavioral
  calls remain on the binder-produced hook because those fixtures inject host ports.
- Refresh source probe now reads Jini `pages/hooks/page-editor-recovery.hooks.ts`,
  which contains the actual `useContentRefreshSubscription` call.
- Theme test and all theme files are unchanged. The lazy route already imports
  the bound view directly; `features/pages/index.ts` already has no editor forwarder.
- No files deleted in this round. `PageEditorPreview.tsx` was already absent;
  `rules.ts` was already bound and recorded in the keep ledger.
- Deletions required by the sheet: both duplicate editor implementations and
  two relocated `PageEditor.tsx` literal-copy baseline rows. No extra helpers,
  scaffolding, types, comments, or unrelated changes were added during review.
- `git diff --check`: clean. No behavioral verification claimed.
- True counter attempted with the exact supplied arguments and output directed
  to `/private/tmp/y5p-pages-count`. STOPPED: the required root `keep` directory
  does not exist in this clone. The script exited 1 at keep expansion after
  producing `tv.json` and `plan/planned.json`; no final total is available.
- All work remains uncommitted. Opus still needs to execute the named tests and
  mutations after Jini integration. No other sheets were in scope.
