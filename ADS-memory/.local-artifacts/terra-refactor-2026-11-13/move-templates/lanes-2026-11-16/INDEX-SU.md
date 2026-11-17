# Lanes S (database code) and U (users): plan index — revision 2 complete, 2026-11-17. Planning only, nothing executed.

Status: **revision 2 written for every sheet; no sheet carries a HOLD banner.** All 16 judge findings are fixed in the
sheet bodies ("Revision 2 - judge response" below). Of the 8 round-1 remainder items, 6 are closed and 2 stay open
(§7, numbered). What was NOT verified is listed per sheet and in §8; the plan was not compiled or run.

Code read for this revision: Tovu `integ/merge-a-2026-11-16` @ `e801e9ae` (no `merge-final` existed in Tovu; cross-checked
with `merge-b` @ `450ac748`: of all lane files only `platform/db/repos/change-set-repo.ts` differs, 2 lines) and Jini
`integ/merge-final-2026-11-16` @ `af33fcdb` (contains merge-a `dde69a6d` and merge-b `9c982fd9`).
Facts files were regenerated on that Tovu tree (`scripts/` now take `LANE_ROOT`).

## 1. Verified size (production lines, tests excluded; `inventory.tsv`)
| Lane | Lines | Files | Test files importing them (regenerated) |
|---|---|---|---|
| S | **9,705** | 78 | S1 18, S2 27, S3 19, S4 40, S5 12, S6 40, S7 27, S8 54 (overlapping) |
| U | **5,320** | 22 | members 56 + 16, API keys 7 |
`coverage.tsv`: 60 of the 100 files have a CLASSIFY label, 40 have none; 51 labelled files have no other sheet or design.

## 2. Sheets (assemble per `T-SQLREPO.md` §0: xpkg `COMMON.md` + `T-SQLREPO.md` + sheet + facts)
| Run | Sheet | Target | Est. tokens | Needs (beyond S0) |
|---|---|---|---|---|
| S0 | `S/S0-pins.md` | Tovu: 8 pins + `schemaErasedKernel` | 120k | base pair green; OD-8 |
| — | `move-workspace.md` (existing, plan/w1-sheets-d) | cms/workspace/sql | ~80k | calibrates the template |
| S1a / S1b / S1c | `S/S1-…` | cms taxonomy / navigation / presentation `/sql` | 210k / 150k / 80k | move-workspace, xpkg R6-R9 |
| S2a / S2b / S2c | `S/S2-…` | cms content-types/sql, entries/sql, entries memory twin | 100k / 200k / 110k | xpkg R6-R9; not with A08 |
| S3a / S3b | `S/S3-identity-sql.md` | user-management/server/sql | 220k / 120k | xpkg C9c + R3b |
| S4a / S4b | `S/S4-trash-sql.md` | cms/trash (contracts) + trash/sql | 200k / 210k | xpkg R6-R9 |
| S5a / S5b / S5c | `S/S5-…` | db settings / gated-mutations / verified-origin | 180k / 100k / 130k | OD-1 |
| S6a / S6b / S6c | `S/S6-…` | db/events; integrations/webhooks/sql; cms/forms/sql | 200k / 190k / 170k | OD-1 + OD-6 (S6a); xpkg R11b-3 (S6b); xpkg R6-R9 (S6c) |
| S7a / S7b | `S/S7-media-sql.md` | cms/media, cms/media/sql | 110k / 240k | xpkg R6-R9; not with A08 |
| S8a / S8b | `S/S8-….md` | cms/widgets/sql; cms/widgets/markers | 110k / 70k | move-entry-refs |
| U1a / U1b | `U/U1-members-sql.md` | user-management/members/sql | 200k / 190k | A07, S3a, OD-3; U1b: S4a |
| U2c-1 / U2a / U2c-2 / U2b / U2c-3 | `U/U2-members-auth-domain.md` | Tovu split; platform/mail; user-management/members/server | 170k / 90k / 170k / 210k / 200k | U2c-1: nothing; others: A07; U2b: S4a |
| U3a / U3b | `U/U3-api-keys.md` | user-management core + server/api-keys + server/sql | 190k / 210k | S3a, OD-4 |
**Total: 30 runs, about 4.85M Sonnet tokens** (S 3.22M in 21 runs, U 1.63M in 9), every run under 250k. Round 1 said 26
runs / 4.15M plus ~0.9M unwritten and one ~250k Opus design: the design (U2c) and the unwritten S2c are now inside the
total; U3c is gone. Not included: `move-workspace` and `move-entry-refs` (existing sheets), the open items of §7
(~0.5M if all are done), one batched cloud verification run per wave. Estimates use 30k + 25 tokens/line plus the
test-repoint load; none is measured.

## 3. Order and prerequisites
Outside this lane, first: xpkg waves 0b-3 for the packages named above (`N1` before U2a; `R6-R9`, `C9c` in wave 1;
`R3b` in wave 2; `R11b-3` in wave 3); audit2 A07 (before U1 and U2c-2) and A08 (never in a wave with S2b or S7);
existing `move-workspace`, `move-entry-refs`. Designs that edit a file a sheet moves run BEFORE that sheet, and the
sheet's facts diff then fails until its table is regenerated: lost-updates (`identity/repo.ts`, `members/repo.ts`,
`settings/repo.ts`, `entries/repo.ts`), error-system (`members/write-service.ts`, `jini-outbox-adapter.ts`), env-schema
(settings defaults), publish-engine (outbox / change-set callers).
1. **S0**, alone: green, every mutation red, facts regenerated and committed.
2. **move-workspace** (calibration). If it does not land clean, fix `T-SQLREPO.md` before any fan-out.
3. Four chains, parallel with each other, serial inside (each run adds an export entry to ONE `package.json`, and an
   export must build in the commit that introduces it):
   - cms: S1a -> S1b -> S1c -> S2a -> S2b -> S2c -> S4a -> S4b -> S7a -> S7b -> S8a -> S8b -> S6c
   - db: S5a -> S5b -> S5c -> S6a
   - user-management: U2c-1 (Tovu only, may start right after S0) -> S3a -> S3b -> U3a -> U3b -> U1a -> U1b -> U2c-2 -> U2b -> U2c-3
     (U1b and U2b also wait for S4a on the cms chain)
   - single runs: S6b (integrations), U2a (platform)
4. Shared Tovu files are serialized by the table in `T-SQLREPO.md` §3 (no coordinator edits; baselines and the `kysely`
   peers travel in the commit that needs them). Two additions:
   - `server/runtime/composition/deps.ts`: at most one sheet per wave whose `wiring` names a line there (S6a is the only
     one known; a census hit in another sheet moves that sheet to the next wave).
   - `features/members/index.ts` (134-line barrel, 60 importers; round-1 item 7): U2c-1, U1a, U1b, U2c-2, U2b, U2c-3 each
     change only the specifier of lines naming a symbol they move, serially on the user-management chain. **R-BARRELS
     runs on this barrel either before U2c-1 or after U2c-3, never in between**; if after, it repoints the importers to
     the final owners these sheets created.

## 4. Owner decisions (local ids; not the xpkg ids)
| # | Decision | Recommendation |
|---|---|---|
| OD-1 | SQL adapters of ports declared in `@jini-ai/core` (settings, confirmation tokens, verified origin, change sets, outbox) live in `@jini-ai/db/<name>` | YES |
| OD-2 | `kysely` as an optional peer of `@jini-ai/user-management` (S3a's J1) and `@jini-ai/integrations` (S6b's J1), added in those commits with the lockfile | YES (no coordinator step any more) |
| OD-3 | Members SQL repos move to `user-management/members/sql` (A07 listed them as staying) | YES, after A07 |
| OD-4 | API keys enter `@jini-ai/user-management`; the scheme prefix stays a Tovu value passed as data | YES; stored hash format frozen, no migration |
| OD-5 | Dialect helpers reach a Jini SQL adapter as an injected port | DECIDED by the owner rule (option C); the alternative is withdrawn |
| OD-6 | One outbox port shape (core contract) or two | (a) core-contract shape; unblocks S6a, S8c, move-events |
| OD-7 | Delete `members/consent-service.ts` (labelled DELETE; writes privacy records; exported by the members barrel) | keep until a reachability proof exists |
| OD-8 (new) | One Tovu helper `schemaErasedKernel` holding the single schema-erasing cast, instead of one cast per binding (three bindings do that today) | YES; with NO, every binding copies the precedent cast and the "no new casts" gate lists them |
| OD-9 (new) | New Node subpath `@jini-ai/user-management/members/server` for member credential code (A07's `./members` stays universal) | YES |

## 5. Lock keys carried by these lanes (S0-P1 pins each)
`identity:<ws>` · `taxonomy:<ws>` (2) · `workspace:roster` · `setting_revisions` · `origin_settings:<ws>` ·
`gated_mutation_tokens:<token>` · `outbox_events:claim` · `webhook_deliveries:claim` ·
`["form-delivery-plan",ws,submission]` · `["form-receiver-pull",ws,receiver]` · `asset_blobs:<ws>:<sha>` · the media slug key (5 sites) ·
`trash:<entityType>:<ws>:<id>` (table adapter) = `trash:member:<ws>:<id>` (member session repo x2, password persist) ·
`trash:user:<ws>:<principal>` (stays in Tovu) · `trash:sweep-claim` · `members:magic-tokens:<ws>`.

## 6. Schema and data
No sheet changes a table, column, stored format or default; the Drizzle chain stays frozen and ADR-066 TS migrations
stay in Tovu. Existing installs need no migration: S0's N-1 fixtures (P4 key hash, P5 digests, P8 outbox row) are the
proof. No sheet adds a delete; each existing one that moves is listed in its sheet with why it exists.

## 7. Round-1 remainder items
| # | Item | Status |
|---|---|---|
| 1 | S4c trash adapters of other domains | **Closed** as a per-file ownership table (`S/S4`): five stay as Tovu product adapters, two stay as wiring, two are constants; one move is open (R3-2 below) |
| 2 | S2c trash-aware memory entry repo | **Closed**: written (`S/S2`, run S2c), same invalidation contract as S2b |
| 3 | S8c memory bus | **Open**, blocked on OD-6 and a behaviour comparison (R3-1) |
| 4 | U2c write-service | **Closed**: dependency-graph design and three runs in `U/U2` |
| 5 | U3c grant-clamp dedupe | **Closed**: compared, reused in U3b; U3c deleted |
| 6 | Identity files outside the SQL / API-key scope (audit row A26, CLASSIFY row 55) | **Open**, not planned here (R3-4) |
| 7 | `features/members/index.ts` barrel | **Closed** as a scheduling rule (§3.4) |
| 8 | Exact wiring texts and table types | **Closed by rule**: every sheet gives the binding expression, table map and port bindings; column lists are copied from the generated type at execution and compared by S0-P6 under `typecheck:tests` (not pasted here) |
### Still open (numbered)
R3-1 S8c memory bus (OD-6 + comparison; ~90k). R3-2 `trash/adapters/directory.ts` -> `@jini-ai/node-adapters` (needs xpkg
N1 and a function partition of its 75-line factory; ~120k). R3-3 S4d: bespoke trash adapters -> registry entries, one per
commit, only where S4b's parity table is identical (up to ~300k, Tovu only). R3-4 identity files of A26 / row 55
(`repo.memory.ts`, `user-purge-types.ts`, `tool-registrations.ts`, `owner-reset-env.ts`, `builtin-role-grants`,
`delete-user-service`, `permission-grants`, `permission-list-tool`, `wiring`): unplanned. R3-5 `consent-service.ts` (OD-7).

## 8. What was verified, and what was not
Verified by reading the code on the base pair: every file, line and declaration this revision cites (the invalidation
call sites and the cache keying; the content-type mapper's owner lookup; the trash registry, table adapter and its
closure; the three owner-factor stores and the identity guard; the session repo's upsert; the user purge; the settings
repo's method list; the token store's port shape; the form-delivery `store` body; the media repo's class ranges, locks
and deletes; the members write-service call graph (generated), password auth and the access resolver in full; the two
grant clamps; `issueApiKey` in full; the bearer path in `dev-auth.ts`; Jini's export map, `kysely` declarations, the
SQL precedent and the token helper). Generated: line counts, blobs, importer lists, tables, lock sites (facts files).
NOT verified: method-by-method port compatibility (step 0 of every sheet); the bodies each sheet lists under "Not
verified"; function sizes inside the new files (the eslint gate decides, with fixed split points); A07's final port
names (A07 has not landed); the xpkg lanes named as prerequisites (none has landed on the base pair); nothing was
compiled, typechecked or run, and no mutation was tried. The sandbox clock was unreliable: no wall-clock figures.

## Revision 2 - judge response (16 accepted, 0 rebutted, 16 fixed in sheet bodies)
| # | Sev. | Change made (file) |
|---|---|---|
| 1 | Blocker | `S/S2` S2b: required `onWriteSettled({ repo })` called in `finally` of `save` and `transaction` (success and failure), bound to `invalidateMediaAccessEvidence({ owner: repo })`; tests use the real linked cache incl. a pending entry, failed writes and a second owner. S2c shares it |
| 2 | Blocker | `U/U2`: write-service designed by its call graph; run U2c-1 (Tovu-only split) and U2c-2 (credential + challenge core to Jini) come BEFORE U2b; `requestPasswordReset` joins the host-coupled group so password auth no longer imports it |
| 3 | Blocker | `U/U2`: new Node subpath `./members/server` with its manifest lines and importer list; A07's `./members` stays universal with a command that proves it |
| 4 | Blocker | `S/S4`: registry TYPES and the lock-key builder land in S4a's J1 with the files that import them; `buildTrashRegistry` stays whole in Tovu; the invented validator test is removed |
| 5 | Major | `U/U1`: exact intermediate tree after U1a (reduced `repo.ts`, `repo.rows.ts`, split bindings, `withoutId` owner, table map) and U1b's successor guard |
| 6 | Major | `S/S2`: `declaredOwners` required data port + exact refusal text + prototype-key cases; `EntryPublishReadPort` / `TrashableEntryRecord` destination; `offset` added to the Jini query type; pagination test |
| 7 | Major | `S/S6` S6c: required `outboxRow` mapper port (the pattern `SqlUserPurge` already uses), insert stays in the plan transaction; rollback and end-to-end stored-row tests; S6c no longer depends on S6a |
| 8 | Major | `S/S0` P5 split into three pins on the three real producers with a mutation each; `S/S3` chain rewritten: outer anti-replay guard, MFA clear deletes passkeys, passkey ownership predicates, caller-owned recovery store |
| 9 | Major | `U/U2` chains R1-R3, P1-P6 describe the real resolver and password paths; the comparer and sign-in-lock rows are withdrawn; existing race tests mapped |
| 10 | Major | `S/S5`: settings table pins unconditional upserts and ledger ordering (no expected-revision claim); lost-updates is an either-order prerequisite with a detecting command; the action binding is located in the core service |
| 11 | Major | `U/U3` bearer gate: positive control asserting principal and credential kind, session precedence, non-operator fall-through, one test per credential-kind branch |
| 12 | Major | Partitions with line ranges: taxonomy (`S/S1`), identity repos (`S/S3`), table adapter (`S/S4`), media (`S/S7`), `issueApiKey` + full declaration map (`U/U3`) |
| 13 | Major | `T-SQLREPO.md` rewritten: inherits the xpkg COMMON (not the move-templates one), per-commit gate table incl. `typecheck:tests` and the mutation loop, STOP table with commands, no coordinator edits |
| 14 | Major | `T-SQLREPO.md` §3: successor guards via regenerated facts; shared-file table (the transaction test is edited by S6a only; `user-purge.sqlite.ts` stays so S3b does not touch it); `S/S0` commits regenerated facts |
| 15 | Major | `U/U3`: clamps compared; U3b imports the package's own `assertGrantClamp` by leaf path; U3c deleted |
| 16 | Minor | counts fixed (round 2a); `S/S1` and `S/S2` no longer call the navigation / content-type bindings unused |

## Revision 3 - Opus review + coordinator decisions (PARTIAL, 2026-11-16; agent stopped at its context cap)
Renamed: `INDEX.md` -> `INDEX-SU.md`, `CODEX-JUDGE.md` -> `CODEX-JUDGE-SU.md` (decision 2; lanes K/T keep `INDEX.md`).
Coordinator decisions recorded here and to be mirrored in K/T `INDEX.md`:
1. Ownership: lane S owns the SQL repositories. Taxonomy SQL (`features/taxonomy/{repo,repo.rows,repo.sqlite,contracts}.ts`)
   = S1a (K-06a/K-06b RETIRED); trash SQL (`trash/{repo,table-adapter,entry-sql,entry-sql.types,not-trashed}.ts`,
   `trash/adapters/marker-sql.ts`) = S4a/S4b (K-08 RETIRED). Lane K owns only the agent-tool layers; K-05 waits for S1a T1,
   K-07b for S4b. Lane K wave 1 loses K-06a.
2. Index files renamed (above).
3. Facts re-pinned: every facts file and `inventory.tsv` regenerated on Tovu `integ/merge-final-2026-11-16` @ `232764af5`
   (`scripts/facts.py` takes `LANE_REF` / `LANE_SHA`). Drift vs merge-a: `change-set-repo.ts` (comment), `capability-card.ts`
   (import), 7 test files (blobs only). T-SQLREPO §1 base updated (Jini `65d73b0d5`).
4. Prerequisites found: both sheets exist on `plan/w1-sheets-d` of the Tovu GitHub origin (not in the terra clone).
   `move-workspace` used the old T-MOVE template, so it is folded into NEW `S/S1w-workspace-sql.md` (the calibration run;
   facts generated). `move-entry-refs`: exact location + fetch command in S8; S8a needs only its DD slice (real command).
5. U2c-3: the observer error goes to a required `report` port bound to `ObservabilityPort.reportError`; result unchanged.
Review items done: T-SQLREPO §5/§6 rewritten as fenced blocks (delete gate, kysely gate, multi-line import gate tested on a
scratch tree; T0 loop uses `git show HEAD:<p> > <p>`; LIMITS 50/10/10 block); U3 STOP `-g '*.ts'` + quoted literal; U3
credential-kind command fixed (round 2 matched nothing: server code uses single quotes; 5 branches); S3 `transactions.ts`
signature as TypeScript + C9c/R3b proving commands + row 3 references the open-bugs entry; S4 lock-key builder test moved
out of T0 (P5); S1 existing deletes listed (S1a, S1b were missing them) and `contracts.ts` importer list (round-2 rg also
matched other folders' `contracts.js`).
Rebuttal: P4 "sheets cannot be found" - they exist (origin `plan/w1-sheets-d`, commit `0337a8982`); the fix was template, not location.
### Remaining (numbered; next agent)
R4-1 Cross-plan collision table in this file AND K/T `INDEX.md`, generated by one fenced command comparing the two plans'
     write sets (S/U: facts "Files" + importer lines; K/T: `*.files.tsv` + `*.importers.tsv`). Known shared files to
     expect: Jini `packages/cms/package.json` + README (S/U cms chain vs T-PO-02), `packages/cms/src/taxonomy/index.ts`
     (S1a vs K-05), `packages/cms/src/trash/index.ts` (S4a vs K-07), `scripts/inv.py` (same path on both branches:
     rename one, e.g. S/U `scripts/inv-su.py`).
R4-2 K/T branch edits: retire K-06a/K-06b (+ `K-06.*` sidecars) and K-08 (`K-08.*`, queue entry) pointing to S1a / S4;
     K-05 prerequisite -> S1a T1 (`test ! -e apps/website/src/features/taxonomy/repo.ts`); K-07b prerequisite (2) -> S4b;
     wave 1 = K-01, K-02b, T-PO-01; chain K drops K-06b; record decisions 1-2 in K/T `INDEX.md`.
R4-3 This file's §2/§3 tables: add S1w (replaces the `move-workspace` row), cms chain `S1w -> S1a -> ...`, totals.
R4-4 S6a sheet: drop the "differs between merge-a and merge-b" note (facts now on merge-final).
R4-5 Not re-read by anyone yet: S2 full body, S5/S6 beyond the line checks done here (S5 and S7 line claims verified on
     merge-final; S6c `store`/lock lines verified).
