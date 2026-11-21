R1 done for the specified create/update saves. Changed CMS `resolver.ts`, `redirects.ts`, and `__tests__/redirects.test.ts`. Exported the existing 500 limit and added the capacity guard. Four tests were written first: create/activation refusals should fail before the fix; exact-rule creation and existing-wildcard editing are compatibility controls.

R2 done. Changed admin `RedirectsPage.tsx`, `messages.en.ts`, and `Redirects.unit.test.tsx`. Added the notice above 500 active wildcards and one 501/500 boundary test. The 501 assertion should fail before the fix.

Tests and mutations were not run, per instruction. Chrome look remains owed. No commits, dependency changes, or diff-reread deletions.

Scope limitation: the existing Trash-restore shortcut at `packages/cms/src/redirects/redirects.ts:692` bypasses the normal save guard and remains unchanged.

Recorded the base, files, new constant export, mutation checks, limitation, and look owed in root `COMMIT-PLAN.md`; importer notes are in `REFRESH.md`.
