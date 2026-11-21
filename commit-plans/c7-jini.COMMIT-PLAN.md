# Commit plan

## C7-J-EXDEV-CAUSE

- Base: `06559affb`.
- Files touched: `packages/cms/src/trash/adapters/directory.node.ts`, `packages/cms/src/trash/__tests__/directory-adapter.test.ts`, `.changeset/c7-trash-exdev-cause.md`, `COMMIT-PLAN.md`, `REFRESH.md`.
- Test changed: `EXDEV keeps the existing message and its cause, and recovers the live tree`. Written first and read before the source edit: the base wrapper has no cause, so `error.cause === cause` fails. Message and both recovery assertions stay unchanged. No tests run, as dispatched.
- Mutation owed to the combine: remove `{ cause: error }`; the edited case must fail.
- Changeset: `.changeset/c7-trash-exdev-cause.md`, patch `@jini-ai/cms`.
- Search review: the extra `across filesystems` match in `packages/agentic/src/skills/tools/installed-skill-tools.ts:124` is an unrelated comment, not a reader of the refusal message.
- Diff re-read deletions: none beyond the specified replacement of the no-cause assertion and inline thrown value. No tests deleted.

## C7-J-AGUI-ERROR

- Base: `06559affb`.
- Files touched: `packages/chat/src/core/assistant-client/ag-ui-transport.ts`, `packages/chat/src/core/assistant-client/__tests__/ag-ui-transport.test.ts`, `.changeset/c7-agui-run-error.md`, `COMMIT-PLAN.md`, `REFRESH.md`.
- Test added: `rejects the start with the HTTP status and keeps the original error as the cause`. Test changed: `reports a mid-stream failure and still hands the collected events to onDone`. Written first and read before the source edit: the base wrapper omits the numeric status and cause, so the new message/cause assertions fail. Every existing expectation keeps its exact text. No tests run, as dispatched.
- Mutation owed to the combine: remove `{ cause: error }`; both cases must fail. Remove the status prefix; the added case must fail. Run `packages/chat/src/core/__tests__/log-safety-g.test.ts` unchanged; its sentinel must remain absent from the error message.
- Changeset: `.changeset/c7-agui-run-error.md`, patch `@jini-ai/chat`.
- Narrowing review: the existing import is from `@jini-ai/core/model-facing-tool-errors`; the supplied `instanceof`, `in`, and numeric checks narrow `error.status` without a cast. Existing ES2023 libs include Error cause support. No cast added.
- Diff re-read deletions: only the specified replacement of the inline wrapper construction with `runStreamError({ error })`; no additional deletions or tests deleted.
