# Commit plan

All sheets use base `c39b5bbdd` (`c39b5bbdd87dce47ba97f03b1c8199af50b00a41`). No commits, staging, tests, builds, installs, typechecks, linters, or API baseline generation were performed. Validation below is static reading only.

## ACP-H — done

Base: `c39b5bbdd`.

Proposed commit: `test(daemon): split the ACP executor test harness into two helpers (verbatim moves)`.

Files: `packages/daemon/src/agent-executor/__tests__/agent-executor.test.ts`.

Moved the existing attach initializer into `createFakeAttachAcpSession` and the spawn initializer plus executor construction into `createAcpExecutor`. Existing casts moved unchanged; no new casts. The harness retains its other statements in order. Declaration-through-closing-brace line counts: original `createAcpHarness` 79; final `createFakeAttachAcpSession` 41, `createAcpExecutor` 28, `createAcpHarness` 16. Static branch review is within complexity 10 for each function. No test cases changed. File is 7,240 lines; the allowed file-size exception is recorded here.

Mutation owed: none named. Combine owes existing daemon tests. Changeset: none. API signature changes: none. Diff re-read deletions: none beyond replacing the moved blocks with the named helper calls.

## ACP-3 — STOPPED

Base: `c39b5bbdd`.

Blocker: `packages/daemon/src/agent-executor/contracts.ts` declares `AgentExecutorRunInput.resumeSessionId?: string | null`. `dispatchAcpPrompt` accepts that input type. The sheet requires `RunAcpDispatchInput.resumeSessionId: string | undefined` and the direct assignment `resumeSessionId: input.resumeSessionId`. Those types do not agree. Normalizing null, widening the new field, or changing the existing public contract requires a departure from the exact sheet; no such change was retained.

Final files touched: none. Tests were drafted first and read against the old behavior, then removed with the stopped implementation:

- `fails resume without sending session/load when the agent does not offer it`: base sends load instead of one initialize write, one resume_failed error, and child termination.
- `getDurableSessionId falls back to the ACP sessionId`: base returns null without a vendor handle.
- `forwards resumeSessionId for an ACP load def`: base never forwards it.
- `uses the durable ACP session id at finish for an ACP load def`: base never reads the controller handle.
- `omits resumeSessionId and durable sessionRef for a def without ACP load`: companion gating assertion.

Existing resume initialization fixtures and the durable-id expectation were restored. Mutation owed: none for a stopped sheet. Combine must resolve the input contract before redispatching. Changeset: none retained; `.changeset/jz-acp-3.md` was removed. API baseline: untouched; a completed revision would change `handleInitializeAck`'s required argument and `runAcpDispatch`'s input shape.

Diff re-read deletions: removed all partial ACP-3 tests, harness option/recorded fields, client and daemon implementation edits, fixture changes, and its changeset. ACP-H was preserved.

## ACP-4 — STOPPED

Base: `c39b5bbdd`.

ACP-3 stopped, so its prerequisite `acpRepairOptions` is absent. Files touched: none. Tests added/changed: none. Mutation owed: none for a stopped sheet. Changeset: none. API baseline: untouched; the proposed `findEffortConfigOption` export and effort fields are not implemented. Diff re-read deletions: none.

## ACP-5 — STOPPED

Base: `c39b5bbdd`.

ACP-3 stopped, so its prerequisite `acpRepairOptions` is absent. Files touched: none. Tests added/changed: none. The harness amendment for `listProcessSnapshotsRejects` is not added because this sheet stopped. Mutation owed: none for a stopped sheet. Changeset: none. API baseline: untouched; no beforeRelease field or cleanup phase change is implemented. Diff re-read deletions: none.

## H2-A11Y-RESOURCE — done

Base: `c39b5bbdd`.

Files:

- `packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx`
- `packages/ui/src/features/resource-dashboard/__tests__/ResourceCard.test.tsx`
- `.changeset/jz-h2-a11y-resource.md`

Added the exact inline handler and doc line from the cull, reusing exported `menuFocusIndex`. The kebab-button handler is unchanged. `ResourceCardMenuItems` is 40 lines. No new helper, type, export, cast, or file containing implementation.

Test written first: `moves focus between menu items with the arrow keys`. Static red reason: the base only stops propagation and never focuses another item, so ArrowDown cannot focus the second action. The test checks Down, Up, and that neither card callback fires. Existing test cases are retained.

Mutation owed at combine: remove `entries[next]?.focus();`. Chrome check owed: Tab into the menu, arrows, Enter, and Escape closing from a focused item. Changeset: patch `@jini-ai/ui`, with the exact requested sentence. API signature changes: none. Diff re-read deletions: none.

## J-C1 — done

Base: `c39b5bbdd`.

Files:

- `packages/cms/src/widgets/html/html-embeds.ts`
- `packages/cms/src/widgets/post-embed-resolution.ts`
- `packages/cms/src/widgets/resolvers/contact-form.ts`
- `packages/commerce/src/catalog/storefront.ts`

Exactly five old citation fragments matched and were replaced with the specified neutral comment text. No code changed. The historical editor reference and other mentions are untouched. `html-embeds.ts` is 545 lines; the allowed file-size exception is recorded here.

Validation: exact text check and diff reading. Tests: none. Mutation owed: restore one old citation. Changeset: none. API signature changes: none. Diff re-read deletions: none beyond the five required old comment fragments.

## N-audit-J — done

Base: `c39b5bbdd`.

File: `.github/workflows/ci.yml`.

Inserted exactly the three requested YAML lines immediately after the frozen install in `quality-gates`. No existing audit step was present; no id was added. Tests: none. Combine owes the first CI log showing the audit step and later steps still running. Mutation: cut by the cull; none owed. Changeset: none. API signature changes: none. Diff re-read deletions: none.
