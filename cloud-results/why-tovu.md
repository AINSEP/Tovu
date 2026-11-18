# why-tovu: lost "why" comments in Tovu

Branch `fix/why-comments-tovu`, base `origin/refactor/terra` (`ada11733f`), Jini sibling checkout `origin/refactor/terra` (`4c1892368`).

## Result
The gate (`npm run check:why-comments`, range `80b00f5bb..HEAD`) found **213 lost blocks** (the 211 of the baseline plus the 2 from combine-1). It now lists **213 blocks, all allow-listed, with a reason each** in `development/why-comments-debt.json`. **No comment was put back and none was written.**

Why nothing was restored: triaging every block (original text from `80b00f5bb`, where the code it explained lives on terra, word-triple overlap against all Tovu and Jini source files) showed no block whose explained code is still in Tovu with its why missing:
- 122 entries: the wording largely survives, reworded, in the same file or in a Jini file (overlap % is in each reason). The refactor rewrote the comment next to the code instead of deleting it.
- 91 entries: the code left the spot (moved to a Jini package or deleted by an A01 / size-06 / Icon-catalog / @jini-ai/devops refactor) and the comment did not travel. 110 reasons name Jini as the code's new home; most are in Jini `packages/devops`, `cms`, `chat`, `mcp`, `ui`, `agentic`.
- Desktop: the `loadNativeUpdater` "imported at call time" comments are now false (electron-updater is imported statically again), so they stay out.

## Follow-up for the owner (not done, out of this branch's scope)
The 91 "comment not carried over" entries are real losses on the Jini side. Restoring them means editing Jini (pushing only this Tovu branch was allowed). Heaviest: `assistant-ag-ui.ts` frame handling (now Jini `translateRunFrame`/`readSseFrames`), `check-coverage-integrity.ts` and `check-jini-registry-drift.mjs` (now `@jini-ai/devops/checks/*`), `external-mcp-probe.ts` (now `@jini-ai/mcp`), `tool-registrations.ts` (now `@jini-ai/agentic/skills/tools`), `media/rules.ts` (now `@jini-ai/cms`). Entry reasons name the commit that moved each.

## Commits (one area each)
- `e33da472` apps/admin (61)
- `18da8dbe` apps/desktop (3)
- `ef5ed3c0` apps/website (105)
- `88a1ef26` development (44)
- report commit: this file

## Gates
- `node development/scripts/check-why-comments.mjs --base 80b00f5bb`: before, exit 1 "213 comment blocks lost (0 allow-listed)"; after, exit 0 "213 comment blocks lost (213 allow-listed)", "why-comments: ok".
- `node --test development/scripts/__tests__/check-why-comments.test.mjs`: 22 pass, 0 fail.
- Only `development/why-comments-debt.json` changed (JSON, no source touched), so typecheck/ratchets are unaffected and were not run.

## Next step
Decide whether to carry the 91 Jini-side comments into Jini; then delete the matching debt entries.
