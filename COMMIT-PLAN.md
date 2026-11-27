# w3b-ext-w1 Tovu handoff

## Inputs and restrictions

- Tovu branch: `codex/tv-r2y-ext-w1`; inspected HEAD: `35367ac24959b089f73cec50bbbcc1b7a8b63c7d`.
- Applied the supplied round-2 sheets and approved G-W1/Y1/Y2/Y3 overrides.
- Read the programmer persona and governing bootstrap from `/Users/la/Programming/Tovu/AI-Dev-Shop/`; their absence in this clone is expected by dispatch.
- No subagents, tests, installs, builds, typechecks, linters, package intake, commits, or pushes.

## Completed design commits, in order

None. Prerequisite inspection stopped T18 before test or implementation edits. No design source files were created, changed, or deleted.

## Prerequisite evidence

- The supplied Jini report `o-r2-ext-w1j/r2-ext-w1j.md` says no sheets were built. That report is stale relative to the current readable branch.
- `git -C /Users/la/Programming/Jini log -5 --oneline codex/r2y-ext-w1j` resolves its tip to `f68350412` (`wip(r2y-ext-w1j): Sol extraction sheets (untested)`). Its tree contains J19/J20 contracts and implementations, J21/J22/J23 implementations, and their named test files. No Tovu sheet is skipped for an absent Jini implementation.
- T18's approved prerequisite is explicitly `J19–J22, CRP-02.T and W1 T11`.
- CRP-02.T has not cut over this Tovu HEAD: `apps/website/src/contracts/core/human-confirm.ts:91` still implements `requireHumanConfirm` locally. The body opens the exchange, calls `askOnce`, classifies its answer, and attaches/removes the abort listener; it imports `askOnce` from `@jini-ai/daemon/surface-exchanges`, with no import from `@jini-ai/daemon/surface-exchanges/human-confirm`.
- The corresponding Jini `packages/daemon/src/surface-exchanges/human-confirm.ts` does exist at the inspected Jini tip and exports the moved lifecycle with injected `requireDeleteGrant` and `render`. This does not establish that CRP-02.T landed in Tovu.
- `apps/website/src/contracts/core/chat-delete-grant.ts` also still implements the grant locally, corroborating the missing CRP-02.T cutover.
- Dispatch requires stopping a sheet when a prerequisite fails and forbids extending the design. CRP-02.T is outside this set; it was not implemented here. Further T18 prerequisite/anchor checks were not completed after this failure.

## Sheet disposition

1. **T18 — STOPPED:** required CRP-02.T host cutover is absent. No tests or production moves started; all four existing source files remain.
2. **T19 — LEFT (dependent):** explicitly requires T18; cannot proceed independently. J23 exists in the readable Jini branch. Other T19 prerequisites/anchors were not certified.
3. **T20 — LEFT (REJECT):** superseded by ext-w2b 73. J24 is likewise rejected in favor of ext-w2b 72. No recovery edits made.
4. **J19–J23:** Jini-owned, read-only for this dispatch; no Jini edits made.

## Named tests and mutations pending after prerequisites land

T18, tests first:

- `apps/website/src/assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts`: preserve delegated BAD_REQUEST/internal-error witnesses; add caller-safe copy/theme refusal witness. Mutation: `bind-full-egress-message`.
- `apps/website/src/features/media-import/__tests__/import-video-conversion-wiring.test.ts`: only intended imports use configured conversion. Mutation: `drop-host-conversion`.
- `apps/website/src/features/fs-files/__tests__/copy-library.test.ts`: one host archive reader validates the complete batch and reaches save. Mutation: `omit-archive-reader-at-save`.
- `apps/website/src/features/image-transform/__tests__/tool.test.ts`: retain real site/picked approval and theme reload witnesses. Mutation: `bind-new-exchange-store`.

T19, tests first:

- `apps/website/src/features/media-generation/__tests__/providers-tools.test.ts`: provider alias resolves the persisted key used by the provider tool. Mutation: `use-alias-as-vault-id`.
- `apps/website/src/features/media-generation/__tests__/tool-registrations.test.ts`: admitted late result after Stop cannot write. Mutation: `drop-write-boundary-abort`.
- Preserve existing credential, catalog, diagnostic, guarded download, storage, provenance, and abort witnesses; guarded download must use real dispatch with controlled transport. Mutation: `bind-unguarded-download`.

No tests were added, executed, or mutation-checked. Rejected T20's recovery pins belong to ext-w2b 73, as directed by the approved review.

## Final diff review

- Only this uncommitted handoff file was added.
- No out-of-sheet implementation was introduced; no cleanup deletions were needed or made.
- Next action: land CRP-02.T in the coordinator's Tovu branch, then retry T18 and dependent T19 with tests first. Opus owns later execution and package intake.
