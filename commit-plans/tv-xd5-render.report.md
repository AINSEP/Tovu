Completed **R7b.1 Tovu**, applying F11.

- Kept `listing-state.ts` with `export const listingState = createListingRequestState({})`; repointed all seven callers.
- Moved the named projection declarations verbatim into `post-previews.ts` and removed Tovu’s generic state copies.
- Preserved path capture before rewriting and JSON typing before returning the batch body.
- Strengthened the two characterization cases before production edits. Named mutations: skipping the pagination assertion and replacing the JSON cursor with `null`.

No steps stopped. No runtime files created or files deleted. No checks, builds, installs, commits, version changes, or lockfile edits ran.

One sheet entry, touched files, deletions, and cloud follow-ups are recorded in [COMMIT-PLAN.md](SCR/c-tv-xd5-render/COMMIT-PLAN.md). Changes remain in the working tree.
