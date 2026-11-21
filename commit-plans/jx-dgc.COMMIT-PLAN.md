# DG-C Jini handoff

Branch: `codex/jx-dgc`. Base: `3556de08b` (`codex/jx-engaps2`, following merge-9 `fb41117be`). Coordinator stages and commits; git state was not modified. No tests, builds, installs, type checks, linters or mutations ran, per dispatch. Implementation status below does not claim runtime verification.

## J1 — done, verification owed

- Base: `3556de08b`.
- Files: `packages/agent-plugins/src/lifecycle/host-tools/search-tool.ts`; new `packages/agent-plugins/src/lifecycle/host-tools/__tests__/search-tool.authorization.test.ts`.
- Witness written before source: one typed in-memory ports object, denied and allowed calls through the same real registration with the same workspace/input. The denial must precede layout access; the allowed result is the empty page and both permission requests identify the configured `use` permission and workspace entity. Before the source change, denial is never called, so the rejection witness would fail. Test declarations: 0 → 1.
- Mutation owed to combine: remove the permission call; confirm witness failure. V1 owes the integrated executor witness and host authorizer binding.
- API-baseline delta (Jini): `@jini-ai/agent-plugins/lifecycle/host-tools#buildAgentPluginSearchRegistrations` requires `AgentPluginSearchToolDeps & { requirePermission: RequireHostToolPermission }`. Existing `_optional` pad, loader input and barrel export preserved. Combine owns baseline, changeset, paired release review and linkage to V1.
- Importer lookup found only the listed production export. REFRESH: no test repoints.
- Look owed: none.
- Diff re-read deletions: none.

## J3 — done, verification owed

- Base: `3556de08b`. Target write service was byte-identical to merge-9; no S6 overlap found.
- Files: `packages/cms/src/content-types/__tests__/tool-registrations.cov-j2.test.ts`, `packages/cms/src/content-types/tool-registrations.ts`, `packages/cms/src/content-types/write-service.ts`.
- Witnesses written before source: admission abort after `defineRecipe`, asserting identical abort reason, version 1, unchanged revisions and index calls; committed control aborting in the existing index provisioner, asserting the successful version 2 result and stored version. Before the fix, the admission case would resolve and persist instead of rejecting. The committed control intentionally pins existing successful behavior. Test declarations: 10 → 12.
- Mutation owed to combine: remove the transaction callback's abort check; confirm admission witness failure. Run both new cases and existing package checks.
- API-baseline delta (Jini): additive second argument `optional: { signal?: AbortSignal | undefined } = {}` on `@jini-ai/cms/content-types#updateContentTypeFields`. One-argument callers remain valid. Combine records the fingerprint. Existing exports/imports preserved.
- Importer lookup found no unlisted production importer. REFRESH: no test repoints.
- Look owed: none.
- Diff re-read deletions: only the two declaration line breaks removed to make the required one-line declaration; no statements removed.

## J4 — STOPPED, no edits

- Base: `3556de08b`. Target write service was byte-identical to merge-9; no S6 overlap found.
- Stop: unlisted production importer at `packages/cms/src/widgets/host-ports.ts:3`, importing `updateEntry` from `../entries/index.js`; `WidgetHostPorts.entries.updateEntry` exposes `typeof updateEntry` at line 58. This triggers the brief's hard production-importer STOP even though it is a type import.
- Files touched: none. Tests added: none; stopped at preflight before writing the witness.
- Mutation owed to combine: none on this candidate. The sheet's callback-check mutation and both cancellation witnesses remain owed after a refreshed importer brief.
- API-baseline delta (Jini): none; `updateEntry` unchanged.
- REFRESH: importer evidence recorded; no test repoints.
- Look owed: none.
- Diff re-read deletions: none.

## QJ1 — done, verification owed

- Base: `3556de08b`.
- File: `packages/cms/src/routing/__tests__/routing.ports.test.ts` only.
- Added the two specified behavioral assertions after the existing read and visibility history assertions. Hidden `/hello` resolves inactive; visible `/hello/?q=1` matches after normalization. These pin existing behavior and are not claimed red on the original implementation. Test declarations: 5 → 4, removing only the named README-string case; retained URL-null, phase ownership and capture-isolation cases.
- Mutation owed to combine: change the absent-resolution branch of `routing.ts` to return true and confirm hidden-entry failure; verify a README rewrap has no effect.
- API-baseline delta (Jini): none. REFRESH: none.
- Look owed: none.
- Diff re-read deletions: the specified `readFileSync` import and README-string test, including its separating blank lines. No additional deletions needed.

## Static review

No touched file exceeds 500 lines. The revised `updateContentTypeFields` spans 49 lines; its guard flow remains within complexity 10 by manual inspection. The other changed/new functions and test callbacks fit both caps. No new casts, dependencies, comments, helpers beyond the named `unexpected` stub, package/lock edits, or pad changes. Added assertions all carry plain-words messages. Runtime, type and mutation evidence is deferred to combine by the machine rule.
