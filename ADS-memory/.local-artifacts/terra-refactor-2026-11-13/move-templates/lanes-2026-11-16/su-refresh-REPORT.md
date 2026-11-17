# su-refresh report — lanes S/U plan re-read on `origin/refactor/terra` (2026-11-17)

Run type: PLAN-EDIT only (no product code touched). Branch: `plan/lanes-s-u-2026-11-16` (Tovu origin), fast-forward pushes only.
Base checked out side by side: Tovu `origin/refactor/terra` = `232764af5` (= `integ/merge-final-2026-11-16`), Jini
`origin/refactor/terra` = `65d73b0d5` (= `integ/merge-final-2026-11-16`). Plan worktree started at `0ae79ee2`.

## Status: DONE (every requested sheet re-read and marked; see INDEX-SU §1b)
| Sheet | Status |
|---|---|
| S3a, S3b, S4a, S4b, S5b, S5c, S6a, S6b, S6c, S7a, S7b, S8a, U1a, U1b, U2a, U2b, U2c-1, U2c-2, U2c-3, U3 | READY-WITH-NOTE |
| S5a, S8b | READY |
| S8c | BLOCKED (OD-6 + unwritten memory-outbox behaviour comparison, R3-1) |
"Waits for" per sheet is in INDEX-SU §1b. No xpkg / audit2 prerequisite (R6-R9, N1, C9c, R3b, R11b-3, A07) is on the base;
S0 has not run; owner decisions OD-1..OD-4, OD-6 are still recommendations.

## What was wrong and what was changed
Facts: all 12 facts files regenerate **byte-identical** on refactor/terra (`inv-su.py`, `rep.py`, `facts.py`), so every
blob guard already pointed at the right tree. The defects were in the sheet bodies and the shared template:
1. **T-SQLREPO §6 (a)/(c) fired falsely**: with an empty `NEW_JINI` (any Tovu-only run, or before J1) `rg ... $NEW_JINI`
   searched the whole clone (570 / 746 hits on the base). Guarded with `[ -z "$NEW_JINI" ] ||`.
2. **The base is red on four Tovu ratchets the T1 gate required to exit 0**: `check:size` (17 Worsened), `check:complexity`
   (22 New + 1 Worsened), `check:boundaries` (exit 16, 16 errors), `check:architecture` (exit 1, 4 hard metrics regressed).
   None is in a lane S/U file. Every T1 gate would have stopped before any edit. T-SQLREPO §1 now captures them on the
   unmodified tree; §5 compares (prints only NEW lines). Jini `check:size`, `check:complexity`, `guard` and Tovu
   `typecheck` are green.
3. **`write-path-inventory.ts --check` cannot run** (its `ROOT` resolves to `development/`, no `tsconfig.json` there;
   ts-morph `FileNotFoundError`; in no npm script or CI step). Replaced in §5 by a diff gate: the baseline may only lose rows.
4. **Forwarder rule vs barrels**: S4a/S4b and the members barrel (INDEX §3.4, U2) planned to *repoint* barrel re-export lines
   to Jini specifiers, which xpkg COMMON S3 rejects and the owner rule forbids. Now: delete the barrel line, repoint the
   symbol's barrel importers (lists + a command in S4 and U2: S4a 4 files, S4b 5 + tests, U2b 11, U2c-2 2, U2c-3 3).
5. **S4a `db-port.ts` DELETE** would have widened the write set to 11 files (barrel fan-out, incl. T-PO-01g's
   `server/routes/types.ts`) for a 19-line alias: now STAY-WIRING.
6. **Invented behaviour / concepts (LESSONS 31)**: S6c "status limit is clamped" (it is not); S5c and U3 "per security
   profile" (no such concept; the command printed nothing). Rewritten to today's behaviour: S5c names the real origin-repo
   consumers (egress / redirect allowlists, canonical host); U3 runs the gate rows per `localOwnerSignIn` policy value.
7. **S8a / DD-entry-refs-1**: DD (from `0337a8982`, `move-entry-refs.md` lines 13-95) re-pinned into S8: all 9 Tovu blobs
   and the Jini survivor match; ONE importer moved (`features/publish-content/type-registry.ts` -> `tovu-publish-ports.ts:22`,
   publish-engine P0.3 `6fd46c35`). Added a guard command; it prints nothing on the base and fires on a mutated list/blob.
   S8a runs DD first if it has not landed.
8. Smaller line/range fixes: S3 partition range; S3 open-bugs entry that was never committed; S4 `notTrashed` call sites,
   `isTrashedRecord` signature, full `createTableTrashAdapter` caller list, `deps.ts` shared-file note; S5b existing
   reverse adapter (`adaptTokenStore`); S6a optional `claimLeaseMs` + 3 positional test sites + 10 test importers; S6b
   envelope port already aliased; S7 partition ranges, `MediaContentTypeStorePort` decided, port base; U1 `withoutId`,
   `findByTokenHash` (no filtering); U2a construction site and `MailerPort` location; U2b `credentialLifecycle` `??` branch;
   U3 `currentCredential` range.
9. INDEX-SU: §1b status table (new), §3.4 (`deps.ts` now S6a, S4b, U2b; members-barrel rule), §3a additions (barrel
   importers vs K/T sidecars: **T-PO-01g never with S4**, K-04b never with U2; plus re-run counts).
Not changed: product code (none), facts files (identical), CODEX-JUDGE-SU.md, scripts/.

## SHAs pushed (plan/lanes-s-u-2026-11-16)
`88b358b5` (S3-S5), `a73c325c` (S6-S8, DD re-pin), `c118a4df` (U1-U3), `c2be1ce9` (T-SQLREPO gates, INDEX §1b/§3a/§3.4),
then the final commit carrying this report (its SHA is in the push log / `git log -1`).

## Commands run (all on the refactor/terra pair) and results
- Setup: Node v24.22.3 into `~/.local/node24`, corepack pnpm 10.33.2. Jini `pnpm install --frozen-lockfile` ok; `pnpm --no-bail -r build` exit 0.
  Tovu `npm ci` ok; `JINI_PACKAGES_DIR=<jini>/packages node development/scripts/link-jini.mjs` ok (71 links); `packages/contracts` and `packages/sdk` build ok.
- Facts: `LANE_ROOT=<tovu> python3 scripts/{inv-su,rep,facts}.py /tmp/.../facts` -> 8434 files / 30162 edges; `diff -r` vs committed S/ and U/ facts: identical.
- Prerequisite commands: S3 C3 `ok`; C9c, R3b print nothing (correct firing). R6-R9 marker (`ColumnCatalogPort`) absent; N1 (`packages/node-adapters`) absent; A07 (`user-management/src/members`) absent.
- S5 lost-updates detector `rg -c "expectedRevision|expectedVersion" .../settings/repo.ts`: prints nothing (does not fire).
- U3 command K: 5 branches (as the sheet says). U3 hasher/scheme STOP: exactly `wiring.ts:184`, `api-key-secret.ts:45`. U3 declaration-map rg: matches the map.
- S4 / U2 barrel-importer commands: 4 / 11 files, as written into the sheets. S8 DD guard: prints nothing; negative run (stale importer + wrong blob) prints both STOP lines.
- T-SQLREPO §6 (e) kysely gate for user-management, integrations, cms, db: no STOP. (d) delete gate: `J=0`. (a)/(c) after the guard: 0 lines.
- LIMITS eslint (`--rule` 50/10/10/500 with sonarjs): works in Tovu (flags `identity/repo.ts` max-lines 616) and Jini (flags `cms/src/routing/routing.ts` `createRouting` 188 lines).
- TT runner: `identity/__tests__/mfa.repo.dialects.test.ts` + `trash/__tests__/table-adapter.dialects.test.ts`: 18 pass, 0 fail.
- Tovu `npm run typecheck`: exit 0. `check:size` exit 1 (17), `check:complexity` exit 1 (23), `check:boundaries` exit 16, `check:architecture` exit 1, `write-path-inventory.ts --check` crash (all on the UNMODIFIED base).
- Jini `pnpm check:size` exit 0 (157 debt entries), `pnpm check:complexity` exit 0 (17 entries), `pnpm guard` exit 0 (one stale hardwiring-debt advisory, not failing).
- §3a collision command: 111 rows on S/U `c2be1ce9` + K/T `ed2a75243` (110 on the pre-refresh S/U ref); same-path command prints nothing.
Not run: `npm run typecheck:tests` (heavy; not needed for a plan edit), any package test suite beyond the two TT files, the
S0-P* pins (S0 has not run), mutation loops (no characterization test exists yet).

## Left / next step
- Owner: answer OD-1..OD-4 and OD-6 (S6a SKIPs without OD-6); decide whether the four red Tovu ratchets on refactor/terra
  are fixed first or accepted as the captured baseline (the plan now works either way).
- Next run: S0 (alone), then S1w. Before scheduling a wave, re-run the §3a command and add the §3a "su-refresh additions"
  rows to the K/T side (`INDEX.md` "Cross-plan") — this run edited only the S/U branch.
- Not re-read in this run (out of scope): S0, S1w, S1a-c, S2a-c bodies (revision 3 re-read S2).
