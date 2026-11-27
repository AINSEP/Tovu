# w3b-ext-w1 Tovu handoff

## Completed design commits, in order

None. No Tovu sheet has all required Jini sheets built. Leave this plan uncommitted.

## Sheets stopped / left

1. **T18 — LEFT (unbuilt dependencies J21 and J22).** Requires J19–J22 together; the sheet explicitly makes this one cutover. The supplied Jini report records J19/J20 implemented, J21 stopped, and J22 dependent on J21. Verified `packages/cms/src/asset-transfer/copy-tool.ts` and `packages/cms/src/media/site-transform/tool.ts` are absent from `codex/r2x-ext-w1j`. J21's reported mismatch is independently visible: the current copy registrar passes `ask: ({ prepared }) => prepared.batch !== undefined` to the host approval handler, while G-W1's mandated structural type permits only `flag` and `batch`. No partial T18 bindings, importer edits, tests, or source deletions made.
2. **T19 — LEFT (unbuilt J23 and dependent T18).** The supplied Jini report records J23 stopped because w2a J10's credential-store implementation is absent. Verified `packages/cms/src/media/site-generation/tool-registrations.ts` is absent from `codex/r2x-ext-w1j`. No generation cutover or tests added.
3. **T20 — LEFT (REJECT).** Superseded by ext-w2b 73 under the approved review. No recovery changes made.

J19–J23 are Jini-only and outside this Tovu dispatch. J24 is rejected in favor of ext-w2b 72.

## Tests and named mutations

No tests added or run because every Tovu sheet is dependency-blocked or rejected. Pending sheet pins remain:

- T18: guarded caller-safe copy/theme refusal (`bind-full-egress-message`); intended conversion wiring (`drop-host-conversion`); one archive reader for validation and save (`omit-archive-reader-at-save`); existing real approval/theme reload witnesses (`bind-new-exchange-store`).
- T19: provider alias persisted-key identity (`use-alias-as-vault-id`); late result after Stop (`drop-write-boundary-abort`); real guarded dispatch/download (`bind-unguarded-download`).
- T20 pins belong to surviving ext-w2b 73, including held migration lock refusal, `bind-private-recovery-surface`, and `lose-confirm-abort-signal`.

## Evidence and scope review

- Read the requested Programmer skills file first.
- Read the supplied Jini report at `../o-r2x-ext-w1j/r2x-ext-w1j.md`.
- Used read-only Git object checks against the supplied Jini branch; J19/J20 destinations exist, J21/J22/J23 destinations do not.
- Read the existing copy approval call and host approval handler to verify the reported J21 contract mismatch.
- No tests, builds, installs, typechecks, linters, commits, pushes, or subagents.
- Only file created: `COMMIT-PLAN.md`. No production or test files changed.
- Final diff review: no implementation beyond the sheets; no extra code to delete. Deletions: none.
