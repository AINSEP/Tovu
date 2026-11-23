PARTIAL: left — ST-8a, ST-11a (Jini); ST-2a→2b→2c, ST-3, ST-13, ST-12a admin screen choice, ST-16 clean/compact (Tovu); ST-1a needs a packaged-Electron machine

# p11-next (2026-11-23) — ST-7a (Jini), ST-12a + ST-16 report half (Tovu)

Unattended cloud run, Opus high. Nothing in this run deletes, prunes or compacts anything on its own:
ST-7a ships functions no host calls yet, ST-12a only stops a public link at a date the owner chose
(default Never), and ST-16 is a read-only report.

- **Spec:** Tovu `origin/plan/whats-left-1122` — `plans/P11-storage-budget-v2.md` §2c, §2f, §7 and
  `plans/P11-storage-check-v2.md` corrections 4, 7, 8. Owner defaults from the dispatch (binding).
- **Branches pushed (only these):** Jini `codex/p11-next-jini` (from `origin/integ/merge-14-2026-11-22`
  `4902a6a1`), Tovu `codex/p11-next-tovu` (from `origin/codex/st-ready-tovu` `b9267a7c1`). Every push
  was `git pull --rebase` + plain `git push`. No force-push, no `--no-verify`, no tags, no publish,
  no subagents, no codebase-memory. `codex/st-ready-jini` was only fetched and merged into a
  **local-only** verify branch (below); it was never edited or pushed.

## Commits

| repo / branch | SHA | what |
|---|---|---|
| Jini `codex/p11-next-jini` | `1b7dcff86` | ST-7a feature + tests + core port types |
| | `5f63a3706` | step split under complexity 10, README Wiring section, api baseline, mutation records |
| | `dda3172c9` | changeset (db + core patch) |
| | `076f73492` | gate records |
| Tovu `codex/p11-next-tovu` | `b2513fb4a3` | ST-12a expiry field, registry clock, service, tests |
| | `3df699e25a` | ST-12a owner choice through create route + backend |
| | `1cbfcb0b99` | ST-16 `tovu storage report` + tests + introspect inventory |
| | `78830ac4ed` | INFO.md Wiring sections (storage, site-backup) |
| | `16538eb241` | depcruise: storage-report is a CLI composition root; gate records |

Raw outputs: Jini `cloud-results/p11-next-raw/`, Tovu `cloud-results/p11-next-raw/`.

## Why these slices

Plan order with st-ready-jini off-limits: Jini's parallel lane is ST-4, ST-5 (done), **ST-7a**, ST-8a,
ST-11a. Tovu work that needs no new Jini: **ST-12a** (no deps), **ST-16** (after ST-14, done; check
correction 8 says ship its CLI entry apart from compaction — so only `report`). ST-6a/6b/6c/7c need
the ST-4 runner release (st-ready-jini). ST-1a needs a packaged Electron app. ST-2a–2c need the check's
correction 1 (authoritative partition ownership) — too large for the remaining budget.

## ST-7a · stopped-site SQLite conversion + daily step (Jini)

- **Files:** `packages/db/src/sqlite/compaction.ts`, `compaction-steps.ts`, `sqlite/index.ts` (exports),
  `packages/core/src/contracts/storage/sqlite-compaction.ts` (+ barrel line), tests
  `packages/db/src/__tests__/sqlite/compaction.test.ts` (18), `index.test.ts` (export list), README
  "Wiring: SQLite compaction", api baselines, changeset.
- **`convertToIncrementalVacuum({ filePath, open, marker, holdsRunningLease }, { recoveryCopyPath?, reserveBytes = 64 MB, fs?, now? })`**,
  in check-correction-4 order:
  1. running-lease probe (host's `claimSiteRunning`) → `deferred/running`, file not even opened;
  2. a `needs-attention` marker → refused (never auto-retried);
  3. **admission before any byte changes:** `locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE` with `timeout: 0`.
     Probed: in WAL mode any other connection (idle, pinned reader, writer) makes it `SQLITE_BUSY`
     → `deferred/busy`, file byte-identical. Once taken, the lock fences every other connection for the
     whole copy + rewrite;
  4. disk budget per filesystem: same device → 2 × (main + WAL) + reserve; split → each side 1 × + reserve;
  5. recovery copy `VACUUM INTO <copy>.partial` → read-only `integrity_check` → durable publish
     (rename + folder fsync) as `pre-compact-<db>-<ms>.db` — apart from `pre-migrations-*` rotation
     and per database. An interrupted attempt's published copy is reused;
  6. markers `copied` → `rewriting` → rewrite (`journal_mode=DELETE; auto_vacuum=INCREMENTAL; VACUUM`,
     then WAL, TRUNCATE checkpoint busy=0, `integrity_check`, `auto_vacuum` reads 2) → `converted`
     with the file identity (`dev:ino`). A failed check → `needs-attention` (own state, copy kept).
- **`incrementalVacuumStep({ db, filePath, marker }, { maxPages = 2048, minFreeRatio = 0.2, minFreeBytes = 8 MB, busyTimeoutMs = 250 })`**
  on the host's handle: refuses inside a transaction; skips unless marker identity matches the
  current file **and** `auto_vacuum` = 2; skips below both thresholds; busy/locked defers; restores the
  handle's own busy timeout; reports main/WAL/free pages before and after plus elapsed ms and says a
  long reader can delay reclamation.
- **Ports in core:** `SqliteCompactionMarkerStore`, `SqliteCompactionFs`, outcomes — so Tovu can bind
  `ops/maintenance.json` without the driver package. Messages are plain (`COMPACTION_MESSAGES`); no
  driver error text reaches them.
- **Tests (18):** plan names `pinned WAL reader → deferred, file intact`; `competing writer → busy deferral`;
  `low disk → deferred with plain message`; `interrupt then restart completes` (two: after copy, after
  rewrite); `marker only after auto_vacuum reads 2`; plus failed check → needs-attention, per-FS budget,
  lease refusal before open, already-converted no-op, recovery-path refusal and naming; step:
  `unconverted file is skipped`, replaced file does not inherit the marker, `busy defers` (+ timeout
  restored), reclaim ≤ maxPages with sizes, nothing-to-reclaim, transaction refusal.
- **Mutations (killed, restored byte-for-byte):**
  - plan's *write the marker before verification* → 3/18 red (`marker only after auto_vacuum reads 2`,
    `a failed check after the rewrite records needs-attention and never converted`, `interrupt after the rewrite…`);
  - check's *mutate the actual busy gate* (drop the exclusive admission) → 2/18 red (pinned reader, competing writer).
  Raw: Jini `p11-next-raw/st7a-mutation-{1,2}.txt`.

## ST-12a · opt-in share expiry, default Never (Tovu)

- **Files:** `features/site-backup/share-expiry.ts` (new), `share-registry.ts` (`expiresAt?` field;
  clock injected `{ now }`; `findToken` refuses past expiry), `share-service.ts` (`expiresAt` on
  receive/create; refused with a remote provider), `share-backend.ts` (`expiresInDays` validated in
  `createShare` before any job, threaded to both export kinds), `server/inbound/admin-http/routes/system/site-shares.ts`
  (`readShareInput` accepts `expiresInDays: 7 | 30 | 90 | null`), tests
  `features/site-backup/__tests__/share-expiry.unit.test.ts` (7), `…/routes/system/__tests__/site-shares-expiry.unit.test.ts` (11).
- **Rules as built:** choices Never (default) / 7 / 30 / 90 days, anything else refused in plain words
  ("A share link can expire after 7, 30 or 90 days, or never."); rows without the field — all existing
  rows and every peer-uploaded `url: null`/no-`storage` row — never expire; an unparseable value fails
  closed (link stops, never extended). Past expiry the public `/_share/:token/:file` answers 404 because
  `findToken` returns nothing. **Nothing is deleted or flipped**; status stays `active`, ZIP stays.
- **Check correction 7 decisions:** eligibility is affirmative (only an owner-set field), never inferred
  from missing URL/storage. Remote providers cannot honour the date until ST-12b can delete their copy,
  so an expiry with a non-own-folder delivery is **refused** ("Links stored with s3 can't expire yet…").
  Admin download of an expired share still works for the owner (unchanged); ST-12b's lock/flip covers it.
- **Tests:** plan names `no expiry by default`; `peer-uploaded row without URL or storage still served`;
  plus own-date stop without deletion, choices/refusals, remote refusal writes nothing, fail-closed parse,
  backend records the choice from its own clock, route body accept/refuse cases.
- **Mutations (killed, restored):** plan's *default `expiresAt` to 14 days* → 2/6 red (both plan-named
  tests); *findToken ignores `expiresAt`* → 2/7 red. Raw: Tovu `p11-next-raw/st12a-mutation.txt`.
- **Not done:** the admin share screen does not offer the choice yet (the API does).

## ST-16 (report half) · `tovu storage report <dir> [--json]` (Tovu)

- **Files:** `cli/commands/storage-report.ts` (new), `cli/program.ts` (`storage` gets `report` beside
  `move`), `cli/commands/__tests__/storage-report.test.ts` (5), introspect inventory test
  (`storage report`, `tovu_storage_report`), `.dependency-cruiser.mjs` (storage-report joins the CLI
  composition roots, with why-comment), `features/storage/INFO.md`.
- **Behaviour:** no boot, no DB open (so nothing migrates), no running lease, `resolveSiteDatabasePaths`
  with `reserveIdentity: false` (no registry write), share folder derived instead of
  `resolveShareDirectory` (which `mkdir`s). Locations follow the server's own resolvers and `TOVU_*_DIR`
  env. App-data databases are listed under `elsewhere` with main/WAL/SHM sizes. Plain output:
  total + "Cleaned automatically / Yours / Shown only".
- **Tests:** plan name `report does not migrate` (tree snapshot incl. mtimes and hashes identical),
  categories/classes, app-data DB listed apart, `--json` vs plain lines, env overrides.
- **Mutation (killed, restored):** *resolve shares through `resolveShareDirectory`* (creates `ops/shares`)
  → 1/5 red (`report does not migrate, open a database, or create anything`). Raw: `p11-next-raw/st16-mutation.txt`.
  The plan's *open writable before the lease* belongs to `clean`/`compact`, which are not shipped.

## Verification

**Jini** (`codex/p11-next-jini`): frozen install 0; `pnpm -r build` 0 on the unmodified tree; core/db/platform
rebuilt after edits; typecheck of core, db and every db dependent 0; `pnpm guard` 0; `api:check` 0
(additive) then `api:update`; why-comments 0; hooks 0; eslint on new files clean; db suite 968/968,
core contracts 416/416. **Size and complexity ratchets exit 1 on rows in files this run did not touch**
(`cms/redirects`, `daemon/launch`, `agent-runtime/session-results`, `chat/event-projection`,
`core/errors/reporter`, `ui/ErrorNotice` — same BASE-RED pattern st-ready recorded); no row names a
compaction file.

**Tovu** (`codex/p11-next-tovu`): `npm ci --ignore-scripts` 0; linked Jini via `JINI_PACKAGES_DIR`;
contracts + sdk built; **baseline typecheck green before edits**; final `npm run typecheck` 0; changed
tests: share suites 504/504 (after ST-12a), CLI storage-report 5/5, introspect 3/3, expiry 18/18;
`check:boundaries` 0 errors (112 base warnings); `check:complexity`, `check:hooks`, `check:errors` 0;
why-comments vs `origin/codex/st-ready-tovu` 0 lost. `check:size`, `check:architecture` and the
default-base why-comments exit 1 on rows in files this run did not touch (they compare against
`refactor/terra`). CLI unit suite: 5 failures that are **also red on the unmodified base** (export
fresh-site, serve listen host, BR-07 shutdown, two generate-index) — `p11-next-raw/cli-tests-base.txt`.

**How Tovu was linked (important for whoever re-runs this):** `codex/st-ready-tovu` imports
`@jini-ai/platform/retention`, which only `codex/st-ready-jini` has. Tovu was therefore verified against
a **local-only** Jini branch `local/verify-p11` = `codex/p11-next-jini` + `origin/codex/st-ready-jini`
(at `3a2f7d23`/its FIX commits; one export-list conflict in `db/__tests__/sqlite/index.test.ts`
resolved as the union). Never pushed.

## Finding for the st-ready-jini FIX run

With current `origin/codex/st-ready-jini` linked, Tovu's **unchanged** ST-14 test
`features/storage/__tests__/measure.test.ts` › `an unreadable folder is reported unknown, not 0` is red
(expected `knownBytes` 1700, got null). The cause is Jini `1f50c5f71` (ST-14 review FIX 4 — "identity
loss reports the folder unknown"), not this run: neither `measure.ts` nor its test changed here. The
Tovu half of that FIX (test expectation or `measure.ts`) needs updating with it.

## Steps left (plan order)

- **Jini:** ST-8a (chat pin + scoped bulk delete with check-5 fences), ST-11a (durable media GC; must map
  the forms `cleanupJournal` path first), ST-8b, ST-8c (report-only until terminal readers traced).
- **Tovu, no new Jini needed:** ST-2a → 2b → 2c (with check correction 1), ST-3, ST-13, ST-12a admin-screen
  choice, ST-1a (packaged Electron measurement; not runnable in this container).
- **Tovu, after Jini releases:** ST-6a (runner, needs st-ready-jini), ST-6b/6c, ST-7b (CLI `compact` on
  ST-7a under the running lease), ST-7c, ST-9 → ST-10, ST-11b, ST-12b, ST-15 → ST-17, ST-18.
