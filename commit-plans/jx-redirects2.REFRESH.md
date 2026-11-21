# T07 refresh notes

Base: `26d5ddfdd15d2d1de22cf8e894eb8afd4da2056a`, branch `codex/jx-redirects2`.

- `packages/cms/src/redirects/tool-registrations.ts:24`: importer, unchanged
  signature (`createRedirect` / `updateRedirect`); no repoint required, per the
  coordinator ruling.
- `packages/admin/src/redirects/react/index.ts:19`: importer, unchanged signature
  (dynamic `RedirectsPage` import); no repoint required, per the coordinator ruling.
- `packages/admin/src/redirects/react/__tests__/legacy-harness.ts` continues using
  the unchanged page and hook seams; no test importer repoint required.
- `DYNAMIC_SET_LIMIT`: only new export; remains in `resolver.ts`, value 500.
  New production importer is the sheet-authorized `redirects.ts` capacity guard.
- No package/lockfile edits, dependency changes, commits, or pushes.
- Tests, mutation checks, and post-combine Chrome look remain owed; see
  `COMMIT-PLAN.md`. Existing Trash restoration is separately flagged there because
  it bypasses the normal save path named by R1.
