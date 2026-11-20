Implemented T2 → T4 → T5 → T6, with each sheet’s tests written before its source edits.

- **T2 done:** Changed `features/site-backup/import-backend.ts` and its `__tests__/import-backend.unit.test.ts`. Tests cover completed verify/restore traces and archive rejection with failure recording and cleanup. Named mutation: drop either trace.
- **T4 done:** Changed `server/runtime/composition/serving-app.ts`; added `__tests__/serving-app-trash-sweep.test.ts`. Tests cover the traced sweep result and failed settlement reaching `[trash-sweeper]` logging. Named mutation: pass the sweep unwrapped.
- **T5 done:** Changed `serving-app.ts` and `__tests__/serving-app-domain-binding-sweep.test.ts`. Tests cover one due-pass trace and an absent sweep retaining the idle handle. Named mutation: always install a callback.
- **T6 done:** Changed `features/post/go-live-sweep.ts` and `serving-app.ts`; added `features/post/__tests__/go-live-trace.unit.test.ts`. Tests cover one traced pass and rejection preserving the retry watermark. Named mutations: trace outside `try`; advance the watermark before awaiting completion. Protected import, file comment and `go-live.test.ts` remain untouched.

[COMMIT-PLAN.md](SCR/c-tv-po/COMMIT-PLAN.md) has one entry per sheet. Scope-review deletions removed extra T2 replay assertions and T4 clock/lease assertions; none for T5/T6.

Tests, mutations and other execution checks were **not run**, per the machine rule. `.git` was untouched; no commits or pushes.
