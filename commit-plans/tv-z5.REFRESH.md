# tv-z5 refresh notes

- B02 is stopped at `apps/website/src/assistant/tool-search-keywords.ts:28–29`:
  the guarded mutable `optional.sources` access loses narrowing when moved
  verbatim into a callback. Revisit only with authorization for a local callable
  capture/rewrite; no assertions or extra guards were introduced. All five B02
  source files remain untouched; eight targeted ledger findings remain.
- C06's targeted `git grep -n -F 'readBackstopApplyReport' -- apps/ development/
  packages/` found the expected `import.ts` route and
  `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/apply-report.test.ts`.
  No incidental test import repoints, unlisted production importers, or test
  changes were needed. The route still treats the report as advisory.
- Combine owns the 19 catch-restoration gate mutations and actual ledger
  verification. No tests, builds, installs, type checks, linters, or gate runs
  were performed, and no debt ledger was edited.
- Final diff re-read found no extraneous edits to delete. Only the named catch
  replacements, their idiom imports, and these two requested reports changed.
