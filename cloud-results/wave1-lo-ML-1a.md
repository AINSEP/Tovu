# wave1 lo-ML-1a — sheet ML-1a (TESTS, Tovu): DONE

Branch `wave1/lo-ML-1a` in Tovu only. Jini unchanged (checkout of `integ/merge-final-2026-11-16` at 65d73b0d, built, linked; no Jini commit).
Base Tovu `232764af` = `origin/integ/merge-final-2026-11-16`.

## Commits (Tovu)
- `16dacee9` test(mail-status): security acceptance for activity access and suppression removal (ML-1a). Two new files, 355 lines, no source edit.
- this report (next commit)

## Steps done
All seven ML-1a groups, in two new files in `apps/website/src/features/mail-status/__tests__/`:
- `activity-access.unit.test.ts` (14 tests): groups 1, 2, 3, 4, 7 (maskRecipient table, limits 0/1/100/101 + non-numbers, cursor round trip, tampered cursors).
- `suppressions-access.unit.test.ts` (12 tests): groups 1 (suppression list), 5, 6, and the changed-entry case of 7.
Existing test files were not edited (the sheet's "extend where they exist" was met by new files; existing cases overlap partly and are untouched).

## Gates
- S-BLOB: 3 sidecar blobs match, no drift. S-PRE: none for this sheet.
- Setup: Node 24.11.1; Jini `pnpm install --frozen-lockfile` exit 0, `pnpm --no-bail -r build` exit 0; Tovu `npm ci` exit 0; `link-jini` (71 links); contracts + sdk built.
- Baseline (V1), unmodified source: the two existing suites that cover this code (delivery-visibility, suppressions-feedback) green. `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:tests` clean on the base.
- V2 after the commit: the 4 mail-status suites `ℹ tests 61 / pass 61 / fail 0`; both `tsc` commands clean; `npx eslint` on both files exit 0 (0 warnings after one fix); S-LIM per-file command exit 0 (tests excluded by its filter; files 195 and 160 lines).
- S-SUPPRESS, S-MOCK, S-NET, S-FORWARD (on the files), S-SCHEMA, S-DELETE, S-BOOT, S-CRED: all print nothing. No Jini commit so S-IMPORT/BARREL/TEXT/RUNTIME/ARGS/GUARD not applicable.
- Repo ratchets `npm run check:size` and `npm run check:complexity` exit 1 on the BASE (23 violation lines, e.g. `composition/deps.ts` max-lines 1952 vs baseline 1926, `assistant-byok.ts:453` cognitive-complexity 11). None are in files this run touched (no tracked file changed). Pre-existing red; not fixed (sheet lists no such edit).
- No test or server process left running.

## V3 mutations (each restored with `git show HEAD:<file> > <file>`, `git diff --quiet` confirmed)
1. `activity.ts` masked branch `return "masked"` -> `return "full"`: RED `status permission only: access is masked ...` (actual 'full', expected 'masked') and `masked output carries no sentinel text ...` (leaked provider-message-id-SENTINEL).
2. `activity.ts` `requireFull: query.filter.recipient !== undefined` -> `false`: RED `no permission: list, filtered list and detail ...` and `status permission only: a recipient filter and a detail lookup ...` (Missing expected rejection).
3. `suppressions.ts` owner comparison `if (permission === MANAGE && principalId !== await deps.ownerPrincipalId)` -> `if (false)`: RED 4 tests (non-owner with permission, absent owner, other owner, ownership lost); "Missing expected rejection (ownerOnly)".

## Findings pinned vs requirement
- Case 6 (authorization revoked between plan and run): today's code DOES re-check (`runMailSuppressionRemoval` goes through `authorizedRepo`), so it is committed as current behaviour. Ownership transfer between plan and run is also refused.
- Changed entry between plan and run: the run passes the PLANNED revision to `repo.remove`; a re-suppressed entry (new revision) is not removed, answer `{ removed: false }`; an already-removed entry also `{ removed: false }`. The real SQL repo claims `revision = planned` the same way (read at `suppression-admin.repo.ts` remove). Pinned with a revision-claiming fake.
- Requirement, NOT committed (would be red/hollow today): `maskRecipient` on an address whose first character is outside the BMP (e.g. an emoji) returns a lone surrogate (`"\ud83d***@x.test"`) because it indexes `address[0]`. Belongs in a HARDEN sheet (or ML-1b M3 if it moves).
- Observation: a well-formed but forged cursor is accepted (cursors are unsigned timestamp+key); only malformed ones are refused. The tests pin that a cursor carries only `{c,k}` and no address with the fake's keys; the real `cursorKey` is `activity_id` (not checked against SQL here).
- Observation: empty-string principal equals an empty-string owner would pass the owner gate (`"" !== ""` false); not pinned, not in the sheet.

## Deviations
- Sheet says "extend existing files where they exist": new files only, existing files untouched.
- COMMON-LO and the sheet were read from `origin/plan/left-out-areas-2026-11-16` in Tovu only (the branch does not exist in Jini).

## Next step
ML-1b (SEAM+MOVE): precondition `ls apps/website/src/features/mail-status/__tests__/activity-access.unit.test.ts` is now satisfied on this branch; needs this branch's SHA to replay green (W stage).
