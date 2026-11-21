All three sheets are **DONE; verification pending**. Base is merge-6 `d3e78b387`; none skipped.

- **J-401:** changed `packages/daemon/src/http/__tests__/tool-execution-rpc.test.ts`. Recorded the dispatch’s flaky-red `ECONNRESET` witness.
- **J-EMBED:** changed `packages/chat/src/embed-widget/react/embed.tsx`, its `__tests__/embed.test.tsx`, new `__tests__/embed-surfaces.test.tsx`, and `packages/chat/docs/spec/api.spec.md`. **BREAKS:** imperative callers must supply `surfaces`.
- **J-LOCK-OWNER:** changed `packages/platform/src/fs/file-lock.ts`, `__tests__/file-lock.agent-plugins.test.ts`, and `__tests__/file-lock.test.ts`. Tests were edited before the production fix.
- Added root `COMMIT-PLAN.md` with per-sheet files, red-witness provenance, mutations, proposed commit messages, and diff-review accounting.

No `REFRESH.md` entries or work outside the cull. Final diff review found no extraneous changes to remove.

Tests, builds, type checks, linters, and mutations were not run, as instructed. Runtime red/green verification and Chrome open/close/unmount remain owed. No commits were created because `.git` must remain read-only.
