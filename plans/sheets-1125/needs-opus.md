DONE 5 sheets

# NEEDS-OPUS build sheets: G06.RUN.J, J10/T10, T4c, T5 (2026-11-25)

**What this is.** These are the Opus design sheets for the five rows that `origin/plan/sheets-check-1125:reviews/sheets-check-1125.md` marked NEEDS-OPUS. They are:
- arch G06.RUN.J
- ext-a J10 and T10
- p11rest T4c
- p11rest T5

Each sheet gives the types first and the mechanical steps second, so Codex Sol can build it without running tests.

**Supersedes.** These sheets replace those rows in `plans/sheets-1125/w3-{arch,ext-a,p11rest}.md`. They also carry the check's FIX text for those rows and the OWNER DECISIONS the owner approved (answers 3, 4, 6 and 10).

**Bootstrap.** I read `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.2, 2026-11-05) first. I used its boundary, ownership, implementation-outline and critical-internal-constraint lens. These are build sheets, not a pipeline ADR. The CIC-style constraints are written inline as **Invariant** lines.

**Anchors.** Code was read at:
- Jini `origin/integ/merge-23-2026-11-25` = `e04253142`
- Tovu `origin/integ/merge-23-2026-11-25` = `dbb9fa5d5`

No anchor used here differs from the check's `fd06f45b1`/`c0f1068a5` reads. `git diff ad71bf68d..HEAD -- packages/daemon/src/agent-executor` is empty. Builders re-resolve every `path:line` before editing.

**Paths.** `J/` = Jini `packages/`, `W/` = Tovu `apps/website/src/`, `A/` = Tovu `apps/admin/src/`.

**Global rules (every sheet).**

- **Builder.** `BUILDER: SOL (OPUS-REVIEW)`. Sol writes the named tests first and does not run them. Opus runs the tests, applies and reverts each named mutation, and runs the gates: `pnpm guard`, `pnpm typecheck`, package tests via `npm --prefix packages/<pkg> run test`, and `api:check`.
- **Signatures.** Use `(required, _optional: Record<string, never> = {})` unless a typed options object is named. Every effect is injected. Every hook a moved component needs is a REQUIRED prop: no default custom hook, no ambient `window`/`process` fallback added. Functions are ≤ 80 lines with cyclomatic complexity ≤ 10.
- **Strict TS** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`):
  - narrow every indexed read;
  - build optional keys with conditional spread;
  - a slot that must always exist is a required key typed `X | undefined` or `X | null`;
  - no `any`, no non-null `!`, no cast from `Partial<…>` to a completed shape.
- **Jini neutrality.** No host/product name, `TOVU_*` name, or vendor branch in Jini code. No re-export shells: no file whose only job is to re-export another module, and no compatibility forwarders.
- **Commits.** Commit per step with a `wip:` prefix where useful. Never gate a commit on tests (repo cloud rules).

## Build order and dependencies

| # | Sheet | Repo | Depends on | Can run in parallel with |
|---:|---|---|---|---|
| 1 | **T5a** `withIdleTurn` kernel primitive | Jini `db` | none | 2, 4, 5 |
| 2 | **T4c** restore-copy / keep-current recovery | Tovu website | p11 **T4a** (lease `isHeld`) and **T4b** (`compactionMarkerStore`), both SOL per the check | 1, 4, 5 |
| 3 | **T5b** serving free-page policy | Tovu website | **T5a** released into Tovu's linked `@jini-ai/db`, plus **T4** (T4a–T4d) | 4, 5 |
| 4 | **G06.RUN.J** executor launch-phase split | Jini `daemon` | arch **K03.BRIDGE.J** landed (re-anchor `launch.ts:1471–1473` after it) | 1, 2, 5 |
| 5 | **J10** Email views into `user-management` | Jini `user-management` | none (ext-a G1/G4 rules apply) | 1, 2, 4 |
| 6 | **T10** Email mount and lazy routes | Tovu admin | **J10** | 3 |

Activation hold: T4c and T5b are staged code only. Compaction and serving reclaim stay **disabled until G1–G3** clear. Neither sheet registers a timer or changes `scheduledDryRun`.

---

## 1. T5a — `withIdleTurn`: the SQLite idle-turn primitive (Jini `@jini-ai/db/kernel`)

`BUILDER: SOL (OPUS-REVIEW)` · Owner decision 4 · Neutral (works for any one-connection kernel; no vendor, no host words)

**Why this exists.** On better-sqlite3 (and PGlite), every caller shares ONE connection. A Kysely transaction is a `BEGIN IMMEDIATE` on that connection (`J/db/src/kernel/sqlite/driver.ts:108–118`).

`incrementalVacuumStep` (`J/db/src/sqlite/compaction.ts:222–240`) checks `db.inTransaction` only at entry. It then awaits `marker.read`, `io.identity` and `io.size` before `PRAGMA incremental_vacuum`. In that await gap:
- an unrelated request's `kernel.transaction()` can `BEGIN` on the same connection;
- the vacuum would then join the transaction and roll back with it;
- or the vacuum would run with page moves interleaved into a request.

The kernel already serializes work with a per-file `TurnLock` (`J/db/src/kernel/turn-lock.ts:18–49`, `kernel-core.ts:73–87,168`). What is missing is an **exclusive, non-queuing** turn that only starts when the kernel is idle.

**Contract (Invariants).**

- **I1.** The body runs only while this process holds the file's turn lock **exclusively**. So no `run()` body and no owned `transaction()` of any kernel on that file in this process overlaps it.
- **I2.** Admission never waits. If any run or transaction holds the lock, or any caller is queued, the result is `{ ran: false, reason: "busy" }` immediately. Serving traffic never queues behind maintenance.
- **I3.** Admission is refused (no body call) in four cases:
  - inside this kernel's `run()`/`transaction()` scope → `"in-scope"`;
  - when this call chain already holds the lock through another kernel → `"in-scope"`;
  - when a foreign transaction is open on the connection (`driver.foreignTransactionOpen() === true` or `own.transactions > 0`) → `"transaction-open"`;
  - on a multi-connection kernel (no turn lock: postgres) → `"unsupported"`.
- **I4.** Inside the body, any `kernel.run()`/`query()`/`transaction()` on the same file throws through the existing `heldLocks` check (`kernel-core.ts:75–79`). The body uses only the raw handle the host passes it.
- **I5.** The lock is released in `finally`, including when the body throws. `withIdleTurn` never catches the body's error.
- **I6.** It is never called from a migration. The migration runner wraps steps in transactions, so I3 returns `"in-scope"`. The static pin is in T5b.

**Types and code.**

`J/db/src/kernel/turn-lock.ts`: add one method to `TurnLock` (after `acquire`, :29):

```ts
  /** Take the lock only if it is free AND nobody is queued; never waits. O(1). */
  tryAcquire(kind: Kind): boolean {
    if (this.waiting.length > 0 || !this.fits(kind)) return false;
    this.take(kind);
    return true;
  }
```

New file `J/db/src/kernel/idle-turn.ts`:

```ts
import type { KyselyKernel } from "./port.js";

export type IdleTurnRefusal = "busy" | "in-scope" | "transaction-open" | "unsupported";
export type IdleTurnResult<T> =
  | { readonly ran: true; readonly value: T }
  | { readonly ran: false; readonly reason: IdleTurnRefusal };

/** Private per-kernel control, registered by buildKernel (same pattern as registerOwnedTransaction). */
export interface IdleTurnControl {
  /** Synchronous admission + exclusive take; returns the release function, or the refusal. */
  tryTake(): { readonly release: () => void } | { readonly refusal: IdleTurnRefusal };
  /** Runs `body` with the lock marked held for this async chain (so nested kernel calls throw, I4). */
  runHeld<T>(body: () => Promise<T>): Promise<T>;
}

const controls = new WeakMap<KyselyKernel<unknown>, IdleTurnControl>();

export function registerIdleTurn(
  { kernel, control }: { kernel: KyselyKernel<unknown>; control: IdleTurnControl },
  _optional: Record<string, never> = {},
): void { controls.set(kernel, control); }

/** A schema/wrapper kernel shares its source's lock. */
export function inheritIdleTurn(
  { from, to }: { from: KyselyKernel<unknown>; to: KyselyKernel<unknown> },
  _optional: Record<string, never> = {},
): void { const c = controls.get(from); if (c) controls.set(to, c); }

/**
 * Run `body` in an exclusive turn on a one-connection kernel, only if the kernel is idle right now.
 * Never queues (I2), never joins a transaction (I3), always releases (I5).
 * @complexity O(1) admission plus the body.
 */
export async function withIdleTurn<T>(
  { kernel, body }: { kernel: KyselyKernel<unknown>; body: () => Promise<T> },
  _optional: Record<string, never> = {},
): Promise<IdleTurnResult<T>> {
  const control = controls.get(kernel);
  if (control === undefined) return { ran: false, reason: "unsupported" };
  await kernel.ready;
  const taken = control.tryTake();
  if ("refusal" in taken) return { ran: false, reason: taken.refusal };
  try {
    return { ran: true, value: await control.runHeld(body) };
  } finally {
    taken.release();
  }
}
```

`J/db/src/kernel/kernel-core.ts`, in `buildKernel` (:167–203). After `registerOwnedTransaction(...)`, add `registerIdleTurn({ kernel, control: idleTurnControl({ rt }) })`, plus this module-private function (≤ 25 lines):

```ts
function idleTurnControl<DB>({ rt }: { rt: KernelRuntime<DB> }): IdleTurnControl {
  return {
    tryTake() {
      const { lock, scope } = rt;
      if (lock === undefined) return { refusal: "unsupported" };
      if (scope.getStore() !== undefined || heldLocks.getStore()?.has(lock) === true) return { refusal: "in-scope" };
      if (rt.own.transactions > 0 || rt.driver.foreignTransactionOpen?.() === true) return { refusal: "transaction-open" };
      if (!lock.tryAcquire("exclusive")) return { refusal: "busy" };
      return { release: () => lock.release("exclusive") };
    },
    runHeld: (body) => heldLocks.run(new Set([...(heldLocks.getStore() ?? []), ...(rt.lock ? [rt.lock] : [])]), body),
  };
}
```

**Wrapper kernels.** At every existing `inheritOwnedTransaction(` call site, add `inheritIdleTurn({ from, to })` beside it. Find them with `git grep -n "inheritOwnedTransaction(" -- packages/db/src`.

**Step-level re-check (closes the await gap for a *foreign* raw `BEGIN`).** In `J/db/src/sqlite/compaction.ts` `incrementalVacuumStep` (:222–240), add one line immediately before `const started = mono();` (:233). There must be no `await` between it and `runBoundedVacuum`:

```ts
  if (db.inTransaction) return { status: 'skipped', reason: 'busy', message: COMPACTION_MESSAGES.busy, before };
```

The entry throw at :224 stays.

**Exports and package.**

- `J/db/src/kernel/index.ts`: add `export { withIdleTurn, type IdleTurnResult, type IdleTurnRefusal } from "./idle-turn.js";`. `registerIdleTurn`/`inheritIdleTurn` are imported by `kernel-core.ts` and wrapper modules directly and are **not** exported.
- No new `package.json` leaf: the existing `./kernel` entry carries the export.
- Changeset `.changeset/db-idle-turn.md`: `"@jini-ai/db": minor`, body naming `withIdleTurn`, `IdleTurnResult`, `IdleTurnRefusal` and `TurnLock.tryAcquire`. Opus refreshes `api-baseline/jini-ai__db.json`.

**Tests first.** New file `J/db/src/kernel/__tests__/idle-turn.test.ts`, run on a file-backed kernel in a temp dir and an in-memory kernel:

1. `step never runs while a kernel transaction is open`: start `kernel.transaction(async () => { await gate; })`, call `withIdleTurn`, expect `{ ran:false, reason:"busy" }`, body spy not called.
2. `refuses inside run() and inside transaction()` → `"in-scope"`.
3. `refuses when a foreign BEGIN is open on the raw handle` (`client.exec("BEGIN IMMEDIATE")` outside the kernel) → `"transaction-open"`.
4. `queued work is never overtaken`: hold a `run()`, queue a `transaction()`, release the run. While the transaction waits, `withIdleTurn` → `"busy"`.
5. `a transaction requested during the body waits until the body returns`: record order `[body-start, body-end, tx-start]`.
6. `kernel calls inside the body throw` (I4).
7. `releases after the body throws`: then `kernel.transaction` succeeds.
8. `postgres-shaped kernel without a turn lock returns unsupported` (build with `oneConnection:false`).

In `J/db/src/sqlite/__tests__/compaction*.test.ts`, add `a transaction opened during the step's awaits makes it skip busy, not join`. Use a fake `fs.size` that runs `db.exec("BEGIN")` on its first call.

**Mutations.**
- `M7c-idle-turn-queues`: replace `tryAcquire` with `await lock.acquire("exclusive")`. Tests 1 and 4 fail.
- `M7c-skip-foreign-check`: delete the `foreignTransactionOpen` clause. Test 3 fails.
- `M7c-no-step-recheck`: delete the new compaction line. The compaction test fails.

---

## 2. T4c — `restore-copy` / `keep-current`: replacing a live database file from a recovery copy (Tovu)

`BUILDER: SOL (OPUS-REVIEW)` · Owner decision 3 · After T4a + T4b · Staged, disabled until G1–G3

This replaces the `resolveCompactionAttention` bullet of p11 T4. T4a, T4b and T4d stay as the check fixed them.

**Inputs that already exist.**
- `SqliteCompactionMarker` `needs-attention` state with `recoveryCopyPath` (`J/core/src/contracts/storage/sqlite-compaction.ts:21–22`).
- `compactionRecoveryCopyPath` → `pre-compact-<db>-<ms>.db` beside the database (`J/db/src/sqlite/compaction.ts:41–44`).
- `assertSqliteStopped` and `inspectStoppedSqlite` (`J/db/src/sqlite/stopped.ts:39,62`; exported from `@jini-ai/db/sqlite` `index.ts:11`).
- `processCopyCoordinator.holdCopy` (`W/platform/db/sqlite/copy-coordinator.ts:15–20,139`).
- `claimSiteRunning` (`W/platform/site-dir/site-running.ts:22`), with T4a's `isHeld()`.
- `LEDGER_TABLE = "tovu_migrations"` (`W/platform/db/migrations/runner.ts:13`).

**File roles during one restore of database `content`.**

| Name | Path | Owner | Deleted by this flow? |
|---|---|---|---|
| `M` live main | e.g. `<site>/data/content.db` | site | never; it is replaced only by atomic rename |
| `C` recovery copy | `marker.recoveryCopyPath` | site | **never** (source copy stays) |
| `T` staged replacement | `${M}.restore.partial` | this flow | yes, only this flow's own partial |
| `F` preserved failed main | `<dir of M>/failed-compact-<db>-<ms>.db` (a hard link to the old inode) | site | **never** in this flow; only via the approval card below |
| `J` restore journal | `<site>/ops/compaction-restore.json` | this flow | cleared (set to `{v:1, entries:{}}`) on completion |

**Invariants.**
- **R1.** `M` always exists. The old inode is preserved by `link(M, F)` **before** `rename(T, M)`, so there is no instant where `M` is absent and a boot could create an empty database.
- **R2.** `C` is never modified or removed.
- **R3.** No step runs unless this process holds the `maintenance` lease (T4a `isHeld()` true) **and** SQLite exclusive admission on `M` succeeds. Admission is `assertSqliteStopped`, with `BEGIN EXCLUSIVE` and timeout 0, so any process with an open transaction or reader lock refuses. Both are re-checked immediately before the publishing rename.
- **R4.** Nothing is published unless `T` matches `C` on all three checks:
  - byte-identical SHA-256;
  - `integrity_check` = ok;
  - an identical migration ledger, every applied step id of which this binary knows (no newer schema).
- **R5.** The marker is cleared only after the **published** `M` re-verifies against `C` (SHA-256, integrity and ledger).
- **R6.** Write-ahead journal: the journal step is durably recorded **before** each irreversible filesystem step. Each write is temp → fsync → rename → fsync dir. After a crash, `resumeCompactionRestore` either finishes verification or rolls back to the pre-restore state. It never guesses.
- **R7.** It is refused when the site serves (lease attached), and when any connection holds a transaction or lock (admission busy). The CLI is the only entry point: an import-graph pin keeps `compaction-recovery.ts` out of the server/boot graph.
- **R8.** Every deletion of owner data goes through the approval card (§2.6). The restore itself deletes nothing the owner owns.

### 2.1 Types (`W/features/storage/compaction-recovery.types.ts`, new)

```ts
import type { SqliteCompactionMarker } from "@jini-ai/core/contracts/storage";

export type CompactionDatabaseName = "content" | "chat";

/** What the owner saw and confirmed. Every field is re-checked; any mismatch → "stale". */
export interface RestoreConfirmation {
  readonly action: "restore-copy" | "keep-current";
  readonly database: CompactionDatabaseName;
  readonly markerAt: number;              // marker.at shown on the card
  readonly recoveryCopyPath: string;      // marker.recoveryCopyPath shown on the card
  readonly mainIdentity: string;          // fs.identity(M) when the card was built
}

/** One applied migration row, as read from the ledger of a stopped file. */
export interface AppliedStep { readonly id: string; readonly checksum: string }

export type LedgerRead = { readonly kind: "ok"; readonly steps: readonly AppliedStep[] } | { readonly kind: "unreadable" };

export type RestoreJournalStep = "staging" | "staged" | "preserved" | "published";
export interface RestoreJournalEntry {
  readonly v: 1;
  readonly database: CompactionDatabaseName;
  readonly step: RestoreJournalStep;
  readonly mainPath: string;
  readonly stagedPath: string;
  readonly preservedPath: string;
  readonly recoveryCopyPath: string;
  readonly sha256: string;                  // of C
  readonly ledgerDigest: string;            // sha256 of JSON.stringify(steps) of C
  readonly oldMainIdentity: string;         // identity(M) before publish
  readonly stagedIdentity: string | null;   // identity(T) once staged and fsynced; null before
  readonly at: number;
}

export type RestoreRefusal =
  | "stale" | "running" | "busy" | "not-needs-attention" | "copy-missing" | "copy-not-whole"
  | "schema-unknown" | "low-disk" | "verify-failed" | "publish-verify-failed" | "journal-pending";

export type RestoreOutcome =
  | { readonly status: "restored"; readonly preservedPath: string; readonly recoveryCopyPath: string; readonly message: string }
  | { readonly status: "kept-current"; readonly message: string }
  | { readonly status: "refused"; readonly reason: RestoreRefusal; readonly message: string };

/** Filesystem effects, all injected. Real binding in compaction-recovery-ports.ts. */
export interface RestoreFs {
  lstatKind(path: string): Promise<"file" | "symlink" | "other" | "missing">;
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  freeBytes(directory: string): Promise<number>;
  identity(path: string): Promise<string>;          // `${dev}:${ino}`
  sha256(path: string): Promise<string>;            // streaming, O(bytes)
  copyExclusive(from: string, to: string): Promise<void>;  // COPYFILE_EXCL, then fsync(to)
  link(existing: string, alias: string): Promise<"linked" | "unsupported">; // EPERM/ENOTSUP/EXDEV → "unsupported"
  renameAtomic(from: string, to: string): Promise<void>;   // rename, then fsync(dirname(to))
  removeOwn(path: string): Promise<void>;           // ENOENT ok; never follows symlinks
}

export interface RestoreJournal {
  read(): Promise<RestoreJournalEntry | undefined | "damaged">;
  write(entry: RestoreJournalEntry): Promise<void>;   // temp → fsync → rename → fsync dir
  clear(): Promise<void>;                            // writes the empty versioned record
}

/** T4b's per-database marker store, extended with clear(). */
export interface RecoveryMarkerStore {
  read(): Promise<SqliteCompactionMarker | undefined>;
  clear(): Promise<void>;
}
```

### 2.2 Entry signature (`W/features/storage/compaction-recovery.ts`, new; split into helpers ≤ 80 lines each)

```ts
export interface ResolveCompactionAttentionRequired {
  readonly dir: string;                                     // site folder
  readonly mainPath: string;                                // resolved M (resolvePaths, reserveIdentity:false)
  readonly confirmation: RestoreConfirmation;
  readonly claim: (required: { dir: string; purpose: "maintenance" }) => { readonly attached: object | null; readonly isHeld: () => boolean; readonly release: () => void };
  readonly marker: RecoveryMarkerStore;
  readonly journal: RestoreJournal;
  readonly fs: RestoreFs;
  readonly admitStopped: (required: { path: string }) => "stopped" | "busy";          // assertSqliteStopped, SQLITE_BUSY → "busy"
  readonly inspect: (required: { path: string }) => "ok" | "failed";                 // inspectStoppedSqlite, throw → "failed"
  readonly readLedger: (required: { path: string }) => LedgerRead;
  readonly isKnownStep: (required: { id: string }) => boolean;                      // binary's migration step ids
  readonly holdCopy: <T>(required: { path: string; work: () => Promise<T> }) => Promise<T>; // processCopyCoordinator.holdCopy
  readonly now: () => number;
}
export async function resolveCompactionAttention(
  required: ResolveCompactionAttentionRequired,
  { reserveBytes = 64 * 1024 * 1024 }: { reserveBytes?: number } = {},
): Promise<RestoreOutcome>;

export async function resumeCompactionRestore(
  required: Omit<ResolveCompactionAttentionRequired, "confirmation"> & { readonly database: CompactionDatabaseName },
  _optional: Record<string, never> = {},
): Promise<RestoreOutcome | { readonly status: "nothing-pending" }>;
```

### 2.3 The exact `restore-copy` sequence (each numbered step is one helper or one line; on any refusal return `{status:"refused"}` with plain words)

**A. Admission (no byte changes).**

1. `journal.read()`. If an entry exists, or the result is `"damaged"`, refuse `journal-pending`. The owner runs `storage compact --resume` first.
2. `marker.read()`. It must be `state === "needs-attention"`, else refuse `not-needs-attention`. It must have `at === confirmation.markerAt` and `recoveryCopyPath === confirmation.recoveryCopyPath`, else refuse `stale`.
3. `lease = claim({ dir, purpose: "maintenance" })`. If `lease.attached !== null`, refuse `running`. From here, `try { … } finally { lease.release(); }`.
4. `fs.identity(mainPath) === confirmation.mainIdentity`, else refuse `stale`.
5. `admitStopped({ path: mainPath })`. If `"busy"`, refuse `busy`.

   This proves no process holds a transaction or reader lock. It checkpoints an unclean-stop WAL into `M` exactly as the site's next open would, and leaves no `-wal`/`-shm`.
6. `holdCopy({ path: C, work })`. The rest runs inside `work`, so no pruner removes `C` mid-read.

**B. Source proof.**

7. `fs.lstatKind(C) === "file"`, else refuse `copy-missing`. `C-wal`/`C-shm` must not exist, else refuse `copy-not-whole`. `inspect({ path: C }) === "ok"`, else refuse `copy-not-whole`.
8. `readLedger({ path: C })` must be `"ok"` and every `steps[i].id` must satisfy `isKnownStep`. Otherwise refuse `schema-unknown`. A copy newer than this binary never publishes.
9. `sha = fs.sha256(C)`; `ledgerDigest = sha256(JSON.stringify(steps))`.
10. Budget: `fs.freeBytes(dirname(M)) >= fs.size(C) + reserveBytes`, else refuse `low-disk`. The `link` fallback (step 16) re-checks with `+ fs.size(M)`.

**C. Stage (write temp, fsync, verify).**

11. `journal.write({ step: "staging", stagedIdentity: null, oldMainIdentity: confirmation.mainIdentity, … })`.
12. `fs.removeOwn(T)` (a crashed run's own partial; `T`'s name is fixed). Then `fs.copyExclusive(C, T)`, which fsyncs `T`.
13. Verify `T`:
    - `fs.sha256(T) === sha`;
    - `inspect({ path: T }) === "ok"`;
    - `readLedger({ path: T })` is ok with a digest `=== ledgerDigest`.

    On any miss: `fs.removeOwn(T)`, then `journal.clear()`, then refuse `verify-failed`. The marker is unchanged and `C` is kept.
14. `journal.write({ step: "staged", stagedIdentity: await fs.identity(T) })`.

**D. Publish (atomic, `M` never absent).**

15. Re-check R3 just before the irreversible part:
    - `lease.isHeld()`;
    - `admitStopped({ path: mainPath }) === "stopped"`;
    - `fs.identity(mainPath) === confirmation.mainIdentity`;
    - `M-wal` and `M-shm` absent.

    Any miss: `removeOwn(T)`, `journal.clear()`, refuse `running`/`busy`/`stale`.
16. Preserve the old main as `F = failed-compact-<db>-<now()>.db` (same directory):
    - `await fs.link(mainPath, F)`;
    - on `"unsupported"`: re-check the budget with `size(M)`, then `fs.copyExclusive(mainPath, F)` and verify `sha256(F) === sha256(M)`;
    - `journal.write({ step: "preserved", preservedPath: F })`.
17. `fs.renameAtomic(T, mainPath)`. This is the single publishing step; rename replaces atomically. Then `journal.write({ step: "published" })`.

**E. Verify published, then clear.**

18. Verify `M`:
    - `fs.identity(mainPath) === entry.stagedIdentity`;
    - `fs.sha256(mainPath) === sha` (hash **before** any open);
    - `inspect({ path: mainPath }) === "ok"`;
    - ledger digest `=== ledgerDigest`.
19. On a miss (rollback):
    - `fs.renameAtomic(F, mainPath)` restores the old inode;
    - `journal.clear()`;
    - leave the marker `needs-attention`;
    - refuse `publish-verify-failed`. `C` is kept.
20. On success: `marker.clear()`, then `journal.clear()`. Return `restored` with `preservedPath: F` and `recoveryCopyPath: C`. The message says: "Restored from the copy made before compaction. The previous file was kept at <F>; nothing was deleted."

   The restored file has a new identity, so it never inherits `converted` (`compaction.ts:242–248`). The next compaction re-converts.

**`keep-current`.** Steps 1–5, then `inspect({ path: mainPath }) === "ok"`. Only then `marker.clear()`. Otherwise refuse `verify-failed` and keep the marker. Nothing is staged, linked or removed.

**`resumeCompactionRestore`** (run by `storage compact --resume`, and refused by step 1 otherwise). It reads `J`, claims the lease, admits, then:

| `J.step` | Observed | Action |
|---|---|---|
| `staging` | — | `removeOwn(T)`; `journal.clear()`; → `refused:"verify-failed"` (`M` untouched) |
| `staged` | `identity(M) === oldMainIdentity` | `removeOwn(T)`; `journal.clear()` |
| `preserved` | `identity(M) === oldMainIdentity` and `identity(F) === oldMainIdentity` | rename never happened: `removeOwn(T)`. Removing the name `F` frees no data, since it is the same inode as `M`; do it only after asserting identity equality on both. Then `journal.clear()` |
| `preserved`/`published` | `identity(M) === stagedIdentity` | rename happened: run step 18, then 19 or 20 |
| any | anything else | leave every file; return `refused:"journal-pending"` with "needs a person: compare <M>, <F>, <C>" |

### 2.4 Ports binding (`W/features/storage/compaction-recovery-ports.ts`, new)

- `admitStopped` wraps `assertSqliteStopped({ path, open: openNativeSqlite })` (`W/platform/db/kernel/drivers/sqlite.ts:48`). An error whose message starts `Database is open in another process` → `"busy"`; any other error propagates.
- `inspect` wraps `inspectStoppedSqlite({ path, open })`: return → `"ok"`, throw → `"failed"`.
- `readLedger`: open read-only, `fileMustExist:true`. Ledger table: `LEDGER_TABLE` for `content`, and for `chat` the chat runner's ledger name (`git grep -n "ledgerTable" -- apps/website/src/platform/db/sqlite/chat-db.ts`). Rows are `{ id, checksum }` per `J/db/src/migrate/ledger-contracts.ts:3–7`, ordered by `applied_at, id`. A legacy-mapped ledger is read through `readLegacyLedger` (`J/db/src/migrate/legacy-ledger.ts:45`) with the host's existing mapping. Any read error → `{ kind:"unreadable" }`. **If neither reader resolves on a fixture site, STOP and report to Opus; do not invent a column.**
- `isKnownStep`: a `Set` of `steps.map(s => s.id)` from the same step arrays the content/chat runners pass.
- `fs` binds node `fs/promises`:
  - `lstat` for `lstatKind`; `stat` dev:ino for `identity`; `statfs` for `freeBytes`;
  - `crypto.createHash("sha256")` over `createReadStream` for `sha256`;
  - `copyFile(…, COPYFILE_EXCL)` then open+`fsync`+close for `copyExclusive`;
  - `link` with the error-code map above;
  - `rename` + directory `fsync` for `renameAtomic`.
- `journal` writes `ops/compaction-restore.json` as `{ v:1, entries: { [database]: RestoreJournalEntry } }`. Damaged JSON → `"damaged"`.

### 2.5 CLI wiring

- `W/cli/program.ts` (storage command block, the check's anchor `:107,139–157`): under the same `compact` registration T4b adds, add `compact --resolve <database> --action <restore-copy|keep-current> --confirm <json>` and `compact --resume <database>`. Both are registered **only** when T4b's bound `compactStoppedSite` capability is present (`storageOperations` at `W/cli/commands/storage-maintenance.ts:139–141`). `{ operations }` JSON stays unchanged: no new operation name.
- `--confirm` takes the `RestoreConfirmation` JSON that the desktop/CLI card printed.

### 2.6 Owner approval card (only place anything is deleted)

`discardCompactionLeftovers({ dir, items, confirmation, claim, fs, holdCopy }, _optional = {})` lives in the same file. `items` is the exact list `{ path, kind: "preserved-failed-main" | "recovery-copy", identity, bytes }`.

The card shows every path, its size, the plain sentence "These files will be deleted permanently", and a "Delete" button. The confirmation token binds `{ paths, identities, markerState }`.

After the click, the flow:
1. re-claims the lease;
2. refuses if any identity changed, or if the database's marker is still `needs-attention` (a pending decision must not lose its copy);
3. removes each file with `unlink`, under `holdCopy`.

T7's desktop sheet renders this card through its existing confirm seam. Nothing else in T4c calls `unlink` on owner files.

### 2.7 Tests first, mutations, pins

New `W/features/storage/__tests__/compaction-recovery.test.ts` runs on real temp SQLite files with real ports, plus a fault-injecting `fs`.

**Tests:**
- `failed restore preserves both copies and the attention marker` (carried from T4)
- `refused while the site serves` (lease attached)
- `refused while another connection holds a transaction` (open `BEGIN IMMEDIATE` on a second connection)
- `copy with a newer migration than this binary is never published`
- `staged bytes that differ from the copy are not published` (fault: flip one byte in T after copy)
- `main is never absent: crash after link and before rename leaves the old main serving` (fault: throw at `renameAtomic`, then `resumeCompactionRestore`)
- `crash after rename resumes to verification and clears the marker`
- `publish verification failure rolls back to the old inode`
- `marker cleared only after the published file verifies`
- `keep-current requires a fresh integrity check`
- `discard refuses while the marker still needs attention`
- `stale confirmation is refused`

Add to `W/platform/db/migrations/__tests__/no-vacuum.test.ts`, as a second test, `no migration imports compaction or idle-turn primitives`. It uses the same walk and asserts `doesNotMatch(/withIdleTurn|incrementalVacuumStep|convertToIncrementalVacuum|compactStoppedSite|resolveCompactionAttention/)`. The existing `:6` test is unchanged.

New pin `W/features/storage/__tests__/recovery-entry-points.unit.test.ts`, named `compaction-recovery is imported only by the storage CLI`. It runs `git grep -l "compaction-recovery"` over `apps/website/src` and expects exactly `cli/commands/storage-maintenance.ts` (or `program.ts`) plus tests.

**Mutations:**
- `M7b-clear-marker-before-verify` (from T4): move `marker.clear()` before step 18.
- `M7b-rename-before-link`: swap steps 16 and 17. The "main is never absent" test fails.
- `M7b-skip-ledger-check`: drop step 8's `isKnownStep`.
- `M7b-no-recheck-before-publish`: delete step 15.

**Package.** No new Tovu export, changeset or baseline (p11 contract).

---

## 3. T5b — `createDbFreePagesPolicy` on `withIdleTurn` (Tovu)

`BUILDER: SOL (OPUS-REVIEW)` · After T4 and T5a · Same G1–G3 hold

This replaces p11 **T5**'s dependency list and its "Prove the same kernel turn…" sentence. The rest of T5 (measurement, budget, drain, the only-this-policy schedule) stays as written.

**Types (`W/server/runtime/composition/retention-policies/db-free-pages.ts`).**

```ts
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { withIdleTurn as WithIdleTurn } from "@jini-ai/db/kernel";
import type { incrementalVacuumStep as IncrementalVacuumStep } from "@jini-ai/db/sqlite";
import type { SqliteCompactionFs, SqliteCompactionMarkerStore, SqliteDb, SqliteVacuumStepOutcome } from "@jini-ai/core/contracts/storage";

/** One sweepable database: the SERVING kernel and its own raw handle. Never a second handle. */
export interface SweepableDatabase {
  readonly name: "content" | "chat";
  readonly filePath: string;
  readonly kernel: KyselyKernel<unknown>;
  readonly handle: SqliteDb;                 // sqliteConnectionOf({ kernel }) — same connection
  readonly marker: SqliteCompactionMarkerStore;
}

export interface DbFreePagesRequired {
  readonly databases: () => readonly SweepableDatabase[];   // empty for non-SQLite, memory, missing, unknown identity, stopped
  readonly withIdleTurn: typeof WithIdleTurn;
  readonly incrementalVacuumStep: typeof IncrementalVacuumStep;
  readonly fs: SqliteCompactionFs;
  readonly mono: () => number;
  readonly yieldTurn: () => Promise<void>;                  // setImmediate wrapper
  readonly signal: AbortSignal;
}
export interface DbFreePagesOptions { maxStepsPerPass?: number; budgetMs?: number; maxPages?: number; busyTimeoutMs?: number }

export type FreePagesStep =
  | { readonly database: string; readonly outcome: SqliteVacuumStepOutcome }
  | { readonly database: string; readonly outcome: { readonly status: "skipped"; readonly reason: "busy" | "in-scope" | "transaction-open" | "unsupported" } };

export function createDbFreePagesPolicy(
  required: DbFreePagesRequired,
  { maxStepsPerPass = 8, budgetMs = 2_000, maxPages = 2_048, busyTimeoutMs = 250 }: DbFreePagesOptions = {},
): { readonly run: () => Promise<readonly FreePagesStep[]>; readonly drain: () => Promise<void> };
```

**The one rule.** Each step is exactly:

```ts
withIdleTurn({ kernel: db.kernel, body: () => incrementalVacuumStep(
  { db: db.handle, filePath: db.filePath, marker: db.marker, fs, mono },
  { maxPages, busyTimeoutMs: Math.max(0, Math.min(busyTimeoutMs, remainingMs)) }) })
```

- A `{ ran:false }` result maps to `skipped` with that reason and stops this database for the pass.
- Between steps, `await yieldTurn()`.
- Do not start a step when `signal.aborted`, when `steps >= maxStepsPerPass`, or when `mono() - started >= budgetMs`.
- `drain()` awaits the in-flight step promise. The retention handle calls it **before** closing the store (`W/server/runtime/composition/retention.ts:44–70`).
- `handle` comes from `sqliteConnectionOf({ kernel })` (`W/platform/db/kernel/drivers/sqlite.ts:43–45`) on the kernels `openSiteStore` already holds (`W/server/runtime/composition/open-site-store.ts:69–91`).
- No `openNativeSqlite`/`new Database` anywhere in this file. Pin: a test greps the file for both.

**Tests first** (replacing T5's list; carried names kept):
- `step never runs while a kernel transaction is open` (owner wording)
- `unconverted or replaced file is skipped`
- `busy defers and restores timeout`
- `report has main and WAL sizes`
- `stops starting steps after the time budget`
- `shutdown drains before closing SQLite`
- `daily free-page work cannot invoke any other policy`

**Mutations:** `M7c-ignore-marker`, `M7c-open-second-writer`, `M7c-enable-global-sweep`, plus `M7c-bypass-idle-turn` (call `incrementalVacuumStep` directly). The first test fails under the last one.

**Callers to refresh:** `git grep -n -E "openSiteStore|sqliteConnectionOf|startSiteRetention" -- apps/website/src`. No new export, changeset or baseline. Never from a migration: the T4c `no-vacuum` addition covers `withIdleTurn`/`incrementalVacuumStep`.

---

## 4. G06.RUN.J — executor launch-phase split (Jini `daemon`)

`BUILDER: SOL (OPUS-REVIEW)` · Owner decision 10 · After K03.BRIDGE.J

Anchors are at Jini `e04253142` (`launch.ts` is 1623 lines). After K03 lands, re-anchor:
- the bridge call at `:1472–1473`, which gains `mechanism`;
- `:898–900`.

Everything else is unchanged by K03.

**Invariants (from the current code; each is load-bearing).**

- **E1.** One run-owned resource state. Every staged slot starts explicitly `null`/`undefined`. `cleanupStagedFiles` disposes in this exact order: HTTP MCP → filesystem temps → prompt file → log file → MCP JSON → staged home → staged config dir → overlay file (`:1436–1465`).
- **E2.** For the five clearable slots, clear the slot **before** awaiting its disposer: HTTP, MCP JSON, home, config dir, overlay. Prompt/log are `const` and are **not** cleared (today's behavior; `agent-executor.test.ts:7223` pins that a rejecting prompt cleanup stops later cleanups). Sequential awaits, no `Promise.all`, no `catch` added.
- **E3.** Failures before the runtime lock receive `cleanupStagedFiles`: HTTP MCP preparation and bridge resolution (`:1471–1472`). Failures after the lock receive `releaseStagedResources`. Admission failures go through `failBeforeSpawn` only (`:967–979`).
- **E4.** `releaseRuntimeLock` = `processExitedController.abort()` + `runtimeLockHold?.release()`, both idempotent (`:1490–1500`).
- **E5.** From `spawnAgentChildProcess` through `child.once('exit', …)`, `wireRunInput` (live-map registration, `child.once('close')`) and the `try` around `confirmChildSpawned`, there is **no `await` and no microtask yield** before `confirmChildSpawned` (`:1582–1609`).
- **E6.** On a spawn-confirmation failure, the run is removed from both live maps and the error is rethrown (`:1605–1608`). The handoff watcher is armed unawaited **after** confirmation (`:1616`). Then `dispatchPrompt` runs.
- **E7.** One `buildRunArgs` call. Argv variants are fitted after staging, never by re-running `buildArgs` (`:1509,1564`).

### 4.1 Types — new file `J/daemon/src/agent-executor/launch-run.ts` (executor-private; no package export, no vendor strings)

```ts
import type { AgentExecutor } from './contracts.js';
import type { RuntimeAgentDef } from '@jini-ai/core/contracts/agents';
import type { McpBridgeDelivery } from './mcp-bridge.js';           // re-anchor the module that exports it today
import type { PreparedHttpMcp } from './http-mcp.js';
import type { PreparedRunHome } from '../ports/agent-runtime.js';
import type { StagedConfigDir } from './staged-config-dir.js';

type NoOptions = Record<string, never>;
export type RunRequired = Parameters<AgentExecutor['run']>[0];
export type RunOptions = NonNullable<Parameters<AgentExecutor['run']>[1]>;

/**
 * The phase-result and resource types below are DEFINED in launch.ts (they name launch.ts's
 * module-level helpers via `typeof`) and imported here type-only. That keeps launch.ts the owner
 * and avoids a type cycle. launch-run.ts declares only the driver and the phase interface.
 */
import type { AdmittedLaunch, PreparedLaunch, StagedLaunch } from './launch.js';

export interface LaunchPhases {
  admit(required: { requiredArgs: RunRequired; optionalArgs: RunOptions }, optional?: NoOptions): Promise<AdmittedLaunch>;
  prepare(required: { admitted: AdmittedLaunch }, optional?: NoOptions): Promise<PreparedLaunch>;
  stage(required: { prepared: PreparedLaunch }, optional?: NoOptions): Promise<StagedLaunch>;
  handoff(required: { staged: StagedLaunch }, optional?: NoOptions): Promise<void>;
}

/** Sequencing only: admit → prepare → stage → handoff, each awaited in order. Owns no resource. */
export function createLaunchRunner({ phases }: { phases: LaunchPhases }, _optional: NoOptions = {}): AgentExecutor['run'] {
  return async (requiredArgs, optionalArgs = {}) => {
    const admitted = await phases.admit({ requiredArgs, optionalArgs }, {});
    const prepared = await phases.prepare({ admitted }, {});
    const staged = await phases.stage({ prepared }, {});
    await phases.handoff({ staged }, {});
  };
}
```

(Remove the four unused type imports above if `tsc` flags them. They are listed so Sol knows where each name lives today.)

In `launch.ts`, add these types at module level, after the imports. The `typeof` targets are the helpers lifted in §4.2.

```ts
type StagedPromptFile = Awaited<ReturnType<typeof stagePromptFile>>;      // nullable, as today
type StagedLogFile = Awaited<ReturnType<typeof stageLogFile>>;
type RuntimeLockHold = Awaited<ReturnType<typeof acquireRuntimeLockIfConfigured>>;
type RunOverlay = ReturnType<typeof resolveRunOverlay>;                    // { systemPromptOverlay, overlayDelivery, composePrompt }
type RunRuntimeContext = ReturnType<typeof withHttpMcpJsonPath>;
type PreparedOverlayFile = Awaited<ReturnType<typeof prepareSystemPromptOverlayFileIfNeeded>>;

/** admitLaunch's result: every decision made before a byte is staged (launch.ts:1355–1380). */
export interface AdmittedLaunch {
  readonly input: MutableRunInput;
  readonly def: RuntimeAgentDef;
  readonly streamFormat: SupportedStreamFormat;
  readonly imageDelivery: ImagePromptDelivery;
  readonly launch: ConfirmedAgentLaunchResolution;
  readonly spawnEnv: NodeJS.ProcessEnv;
  readonly overlay: RunOverlay;
  readonly modelCatalog: ModelCatalogSnapshot | undefined;
}

/** The ONE run-owned resource state (E1/E2). Mutable slots, explicitly initialised; never Partial-cast. */
export interface LaunchResources {
  readonly runId: string;
  readonly preparedPromptFile: StagedPromptFile;
  readonly preparedLogFile: StagedLogFile;
  preparedHttpMcp: PreparedHttpMcp | null;
  writtenMcpJsonPath: string | undefined;
  preparedRunHome: PreparedRunHome | null;
  preparedClaudeConfigDir: StagedConfigDir | null;
  preparedSystemPromptOverlayFile: PreparedOverlayFile;   // already `X | null`
}

/** Lock control built right after the lock is taken (E3/E4). */
export interface LaunchLock {
  readonly hold: RuntimeLockHold;
  readonly selectedModel: string | undefined;
  readonly processExited: AbortSignal;
  readonly releaseRuntimeLock: () => void;
  readonly releaseStagedResources: () => Promise<void>;
}

/** prepareLaunchInputs' result (launch.ts:1389–1500). */
export interface PreparedLaunch {
  readonly admitted: AdmittedLaunch;
  readonly resources: LaunchResources;
  readonly cleanupStagedFiles: () => Promise<void>;
  readonly mcpBridge: McpBridgeDelivery | null;
  readonly runtimeContext: RunRuntimeContext;
  readonly lock: LaunchLock;
}

/** stageLaunchConfiguration + prepareLaunchInvocation's result (launch.ts:1509–1577). */
export interface StagedLaunch {
  readonly prepared: PreparedLaunch;
  readonly childEnv: NodeJS.ProcessEnv;
  readonly invocation: CommandInvocation;
}
```

`MutableRunInput`, `SupportedStreamFormat`, `ImagePromptDelivery`, `ConfirmedAgentLaunchResolution` and `ModelCatalogSnapshot` are the names `launch.ts` already uses. Keep their current imports. Export the four phase types only from `launch.ts`'s module scope: they are **not** added to `index.ts` or `package.json`.

### 4.2 Executor scope (replaces closures; launch.ts, module-private)

```ts
/** Everything a phase reads from the executor. Built once in createAgentExecutor; never mutated after. */
interface ExecutorScope {
  readonly options: CreateAgentExecutorOptions;
  readonly lifecycle: CreateAgentExecutorOptions['lifecycle'];
  readonly agentRuntime: CreateAgentExecutorOptions['agentRuntime'];
  readonly runtime: CreateAgentExecutorOptions['runtime'];
  readonly hostEnv: NodeJS.ProcessEnv;                    // the already-selected env (:930)
  readonly failBeforeSpawn: FailBeforeSpawn;
  readonly cleanupFilesystemTemp: (required: { runId: string }, optional?: NoOptions) => Promise<void>;
  readonly filesystemTemps: Map<string, string[]>;
  readonly liveRunInputs: Map<string, StdinCloseHandle['sendUserMessage']>;
  readonly liveRunRelays: Map<string, RunMessageRelay>;
  readonly processTree: { readonly listProcessSnapshots: …; readonly collectProcessTreePids: …; readonly stopProcesses: … }; // the three Fn values at :932–936, typed by ReturnType<typeof createProcessTreeDeps>
  readonly createCommandInvocation: ReturnType<typeof createCommandPlanner>;
  readonly onCleanupFailure: …; readonly bufferedStdoutMaxBytes: …;   // ReturnType<typeof resolveMiscExecutorDeps>
  readonly claudeConfigDirIsolationEnabled: boolean;
}
```

Write the `…` member types with `ReturnType<typeof …>[key]` from the named factory; do not restate them. `failBeforeSpawn`, `cleanupFilesystemTemp`, `sendUserMessage` and `claimUserMessages` stay inside `createAgentExecutor`: they close over the maps. Pass the first two in the scope.

### 4.3 Mechanical moves (in order; each move is one commit; no behavior change)

1. **Lift helpers to module scope** with an added first-object member `scope: ExecutorScope`. Bodies are unchanged except `x` → `scope.x`. Keep why-comments with their code.

   | Helper | Lines |
   |---|---|
   | `prepareRunContext` | :1000–1009 |
   | `enforceNativeToolPolicy` | :1011–1026 |
   | `enforceFilesystemPaths` | :1031–1044 |
   | `enforceFilesystemRuntime` | :1050–1088 |
   | `resolveRunOverlay` | :1090–1121 |
   | `resolveRunLaunch` | :1126–1139 |
   | `selectRunModel` | :1141–1155 |
   | `bridgeProbeEntryForRun` | :1155–1160 |
   | `wireRunInput` | :1162–1200 |
   | `childLifecycleOptions` | :1202–1209 |
   | `dispatchAcpPrompt` | :1211–1257 |
   | `dispatchPiPrompt` | :1259–1291 |
   | `dispatchStdinPrompt` | :1293–1309 |
   | `dispatchPrompt` | :1311–1329 |
   | `prepareRunHttpMcp` | :1332–1342 |

   Each keeps its `_options = {}` pad. Call sites inside `run` pass `scope`.
2. **`admitLaunch({ scope, requiredArgs, optionalArgs }, _optional = {}): Promise<AdmittedLaunch>`** contains `:1355–1380` verbatim, in this order:
   - `prepareRunContext`, `enforceNativeToolPolicy`, `resolveImageDeliveryAndArgvBudget`, `enforceFilesystemPaths`;
   - `resolveRunLaunch`, `enforceFilesystemRuntime`, `resolveRunOverlay`, `selectRunModel`;
   - `ensureCapabilities`.

   It returns the `AdmittedLaunch` literal. The image-delivery why-comment (:1358–1366) moves with it.
3. **`createLaunchResources({ runId, preparedPromptFile, preparedLogFile }, _optional = {}): LaunchResources`** returns `{ runId, preparedPromptFile, preparedLogFile, preparedHttpMcp: null, writtenMcpJsonPath: undefined, preparedRunHome: null, preparedClaudeConfigDir: null, preparedSystemPromptOverlayFile: null }`. Move the five slot doc-comments (:1404–1434) onto the interface fields.
4. **`createLaunchCleanup({ resources, cleanupFilesystemTemp, removeMcpJsonFile }, _optional = {}): () => Promise<void>`** is the body of `:1436–1465`, reading/writing `resources.*`.
   - Same order (E1).
   - Same "copy to local, null the slot, await the disposer" pattern (E2).
   - `removeMcpJsonFile` = `mcpJsonInjection?.removeFile ?? defaultRemoveMcpJsonFile` (:1413).
5. **`createLaunchLock({ hold, selectedModel, cleanupStagedFiles }, _optional = {}): LaunchLock`** builds `processExitedController`, `releaseRuntimeLock` and `releaseStagedResources` exactly as at `:1488–1500`, with their comments.
6. **`prepareLaunchInputs({ scope, admitted }, _optional = {}): Promise<PreparedLaunch>`** does, in order:
   - `:1389–1397` `stagePromptFile` → `stageLogFile`;
   - `createLaunchResources`;
   - `createLaunchCleanup`;
   - `:1471` `resources.preparedHttpMcp = await prepareRunHttpMcp(…cleanupStagedFiles)`;
   - `:1472` bridge (after K03: with `mechanism`);
   - `:1475–1476` runtime context;
   - `:1482–1483` `selectedModel = input.model` and `acquireRuntimeLockIfConfigured`;
   - `createLaunchLock`.

   The HTTP-MCP/bridge mutual exclusion (`preparedHttpMcp ? null : …`) stays a single expression.
7. **`stageLaunchConfiguration({ scope, prepared }, _optional = {})`** does `:1509–1560` in this order:
   - `buildRunArgs` (gets `lock.releaseStagedResources`);
   - `resources.writtenMcpJsonPath = await writeMcpJsonIfNeeded(…)`;
   - `resources.preparedRunHome = …`;
   - `resources.preparedClaudeConfigDir = …`;
   - `resources.preparedSystemPromptOverlayFile = …`;
   - `boundStrategies`, `httpSpawnEnv`, `computeChildEnv`.

   It returns `{ baseArgs, childEnv }`. The `hostEnv: input.cliParity ? spawnEnv : hostEnv` choice (:1525) is unchanged. Keep every "Mechanism N of 5" / SEC comment in place; R15 counts them in this file.
8. **`prepareLaunchInvocation({ scope, prepared, baseArgs, childEnv }, _optional = {}): Promise<StagedLaunch>`** does `:1564–1577`: `fitArgvPromptVariant` → `guardWindowsCommandLineBudget` → `prepareRunCommand` → `confirmArgvPromptSelection`. It returns `{ prepared, childEnv, invocation }`.

   The `stage` phase = `stageLaunchConfiguration` then `prepareLaunchInvocation`.
9. **`handoffLaunch({ scope, staged }, _optional = {}): Promise<void>`** is `:1582–1619` verbatim. It passes `writtenMcpJsonPath: staged.prepared.resources.writtenMcpJsonPath` and `httpMcp: staged.prepared.resources.preparedHttpMcp !== null` to `wireRunInput`.

   **Invariant E5:** the statements from `spawnAgentChildProcess(` to `try { await confirmChildSpawned` stay in one function with no `await` between them. Keep `armHandoffWatcher` unawaited and `dispatchPrompt` last.
10. **In `createAgentExecutor`** (:925): build `scope` after `failBeforeSpawn`/`cleanupFilesystemTemp`/maps exist. Replace `async function run(…)` (:1354–1620) with:

    ```ts
    const run = createLaunchRunner({ phases: {
      admit: (r) => admitLaunch({ scope, ...r }),
      prepare: (r) => prepareLaunchInputs({ scope, ...r }),
      stage: async ({ prepared }) => { const s = await stageLaunchConfiguration({ scope, prepared }); return prepareLaunchInvocation({ scope, prepared, ...s }); },
      handoff: (r) => handoffLaunch({ scope, ...r }),
    } });
    ```

    Move `run`'s JSDoc (:1343–1353) onto `createLaunchRunner`'s call site. `createAgentExecutor`'s exported signature and its returned `{ run, sendUserMessage, claimUserMessages }` are unchanged.

### 4.4 Tests first, mutations, debt

In `J/daemon/src/agent-executor/__tests__/r8a-pins.test.ts`, using `createRig`/`createFakeChild` (`r8a-rig.ts:28,69`), add:

- `a synchronous spawn failure releases an acquired lock and each staged home once`. Use a def with `runtimeLock` and staged home/config. Spawn throws. Assert:
  - the lock `release` is called once;
  - each staged `cleanup` is called once;
  - the order is `[stage-home, stage-config, release-lock, cleanup-home, cleanup-config]`;
  - no prompt dispatch.
- `an immediate child exit cannot beat lifecycle registration`. The fake child emits `exit` + `close` synchronously inside `spawn`'s next microtask. Assert `liveRunInputs` is empty afterwards and the lock is released once.
- `prepare-phase failure before the lock uses cleanupStagedFiles only`. HTTP MCP preparation throws. Assert the lock is never acquired and HTTP cleanup is called once.

Retain `agent-executor.test.ts:5129,6098` (failures after MCP file / scratch home) and `:7223` (rejecting prompt cleanup stops later cleanups) **unchanged**.

**Mutations:**
- `M-double-release-staged-home`: in `createLaunchCleanup`, await `home.cleanup()` before nulling the slot, and call it a second time.
- `M-yield-before-child-wiring`: insert `await Promise.resolve()` after `spawnAgentChildProcess`.
- `M-cleanup-order-swap`: swap MCP JSON and staged home.

**Package and debt.**
- No exports change.
- `.changeset/g06-launch-phases.md`: `"@jini-ai/daemon": patch`. No API baseline drift is expected; Opus confirms with `api:check`.
- Retire `scripts/size-debt.json:220–221` (`createAgentExecutor.run`) only after Opus confirms every new function is ≤ 80 lines.
- Re-measure `:213` (whole file) and do not retire it.
- Add no R15, size, log-safety or error-gate rows.
- Importers of `launch.js` (`agent-executor/index.ts:143` and the four `__tests__` named in w3-arch) need no change.

---

## 5. J10 — Email views into `@jini-ai/user-management/react/mail` (Jini)

`BUILDER: SOL (OPUS-REVIEW)` · Owner decision 6: `parts` = component map `{ Overview, Sender, Activity, Templates }`

**Boundary fact that drives the design.** `@jini-ai/admin` is only a **devDependency** of `user-management` (`J/user-management/package.json:757`), and `ui`/`chat` are not runtime deps either. So the four moved files may import only:
- `react`;
- `@jini-ai/core/*` (`agentHandle`, `agentHandleSegment`, `resolveActiveTabId`);
- `user-management`'s own `../kit.js` (`SecretInput`, `ConfirmDialog` slot components, `J/user-management/src/react/kit.tsx:86–97`).

Everything else (admin email tabs, `t`, `Chip`/`Section`/`Loaded`, `TabBar`, `ChatSettingsSegmented`, DevicePreview, router) comes in through typed props. All admin types are **structural local copies of only the members read**. The host proves compatibility at the T10 call site, where TS checks assignability.

**Files.** `A/features/email/{Email.tsx, EmailProviderTab.tsx, EmailSegments.tsx, EmailTemplateEditor.tsx}` → `J/user-management/src/react/mail/{Email.tsx, EmailProviderTab.tsx, EmailSegments.tsx, EmailTemplateEditor.tsx}` plus a new `email-view.types.ts`.

`EmailSegments.tsx` becomes a component that takes the injected segmented control: no `@jini-ai/chat` import.

### 5.1 `J/user-management/src/react/mail/email-view.types.ts` (new; types only)

```ts
import type { ComponentType, ReactNode } from 'react';

export type EmailTone = 'ok' | 'warning' | 'neutral' | 'error';
export type EmailTranslate = (required: { locale: string; key: string }) => string;
export type EmailSummary = 'not_set_up' | 'no_external_delivery' | 'needs_attention' | 'configured';
export type EmailLoadView<T> =
  | { readonly kind: 'loading' } | { readonly kind: 'forbidden' }
  | { readonly kind: 'error'; readonly message: string } | { readonly kind: 'loaded'; readonly data: T };
export type EmailStatusView<S> =
  | { readonly kind: 'loading' } | { readonly kind: 'forbidden' } | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly status: S };

/** Members of the host's mail status that these views read. */
export interface EmailStatusShape {
  readonly warnings?: readonly string[] | undefined;
  readonly lanes?: readonly { readonly lane: 'transactional' | 'bulk'; readonly providerId: string | null; readonly state: string }[] | undefined;
}
export interface EmailStatusControl<S extends EmailStatusShape> { readonly view: EmailStatusView<S>; readonly locale: string; readonly retry: () => void }

export interface EmailProviderField {
  readonly key: string; readonly label: string; readonly type: 'secret' | 'text' | 'url' | 'email';
  readonly placeholder?: string | undefined; readonly defaultValue?: string | undefined; readonly help?: string | undefined;
}
export interface EmailProviderView {
  readonly id: string; readonly label: string; readonly hosted: boolean;
  readonly lanes: readonly ('transactional' | 'bulk')[];
  readonly credential: { readonly required: boolean; readonly saved: boolean; readonly updatedAt?: string | undefined };
  readonly selectable: boolean; readonly refusal?: string | undefined;
  readonly setup: { readonly fields: readonly EmailProviderField[]; readonly helpUrl?: string | undefined };
}
export interface EmailProviderChoice { readonly pluginId: string; readonly summary?: string | null | undefined; readonly description: string | null }
export type EmailCredentialKey = 'token' | 'username' | 'baseUrl';
export interface EmailProviderControl<P extends EmailProviderView, Ch extends EmailProviderChoice> {
  readonly choices: readonly Ch[] | null; readonly adding: string | null;
  readonly addError: string | null; readonly addWarning: string | null;
  readonly retryAdd: () => Promise<string | undefined>;
  readonly addProvider: (required: { pluginId: string }) => Promise<string | undefined>;
  readonly view: EmailLoadView<{ readonly providers: readonly P[]; readonly refusals: readonly string[] }>;
  readonly reload: () => void;
  readonly drafts: Readonly<Record<string, { readonly token?: string; readonly username?: string; readonly baseUrl?: string }>>;
  readonly setDraftField: (providerId: string, key: EmailCredentialKey, value: string) => void;
  readonly busyId: string | null;
  readonly notice: { readonly providerId: string; readonly tone: 'ok' | 'error'; readonly text: string } | null;
  readonly saveKey: (provider: P) => Promise<void>;
  readonly pendingSwitch: P | null;
  readonly askSwitch: (provider: P | null) => void;
  readonly confirmSwitch: () => Promise<void>;
}

/** The host's concrete type set. Instantiated once by the host (T10) as `Email<HostEmailTypes>`. */
export interface EmailTypes {
  readonly status: EmailStatusShape;
  readonly provider: EmailProviderView;
  readonly choice: EmailProviderChoice;
  readonly overview: unknown; readonly sender: unknown; readonly templates: unknown; readonly activity: unknown;
}

/** Each tab's state hook. REQUIRED, all five; mounted only while its tab shows. */
export interface EmailTabHooks<T extends EmailTypes> {
  readonly overview: () => T['overview'];
  readonly provider: (optional: { onChanged?: () => void }) => EmailProviderControl<T['provider'], T['choice']>;
  readonly sender: (optional: { onChanged?: () => void }) => T['sender'];
  readonly templates: (optional: { newName?: string }) => T['templates'];
  readonly activity: () => T['activity'];
}

/** Owner decision 6: the four admin tab views, as a component map. */
export interface EmailParts<T extends EmailTypes> {
  readonly Overview: ComponentType<{ controller: T['overview']; locale: string; part?: 'uses' | 'test' }>;
  readonly Sender: ComponentType<{ controller: T['sender']; warnings?: readonly string[]; locale: string; part?: 'sender' | 'dns' }>;
  readonly Activity: ComponentType<{ controller: T['activity']; locale: string; part?: 'sends' | 'blocked' | 'reports' }>;
  readonly Templates: ComponentType<{ controller: T['templates']; locale: string }>;
}

export interface EmailTabBarProps {
  readonly tabs: readonly { readonly id: string; readonly label: string; readonly handle?: string | undefined; readonly handleLabel?: string | undefined }[];
  readonly activeId: string; readonly onChange: (id: string) => void; readonly ariaLabel: string; readonly containerHandle?: string | undefined;
}
export interface EmailSegmentedProps {
  readonly name: string;
  readonly items: readonly { readonly key: string; readonly label: string; readonly checked?: boolean | undefined; readonly change: () => void }[];
}
export interface EmailLoadedProps<T> { readonly view: EmailLoadView<T>; readonly locale: string; readonly retry?: (() => void) | undefined; readonly children: (data: T) => ReactNode }

/** Presentational components the Email views render with (host UI library + admin email parts). */
export interface EmailKit<S extends EmailStatusShape> {
  readonly TabBar: ComponentType<EmailTabBarProps>;
  readonly Segmented: ComponentType<EmailSegmentedProps>;
  readonly Chip: ComponentType<{ tone: EmailTone; children: ReactNode }>;
  readonly Section: ComponentType<{ id: string; title: string; hideTitle?: boolean; children: ReactNode }>;
  readonly Loaded: <T>(props: EmailLoadedProps<T>) => ReactNode;
  /** The sender-domain line under the status summary (admin `SenderDomain`, bound to the status shape by the host). */
  readonly StatusFacts: ComponentType<{ status: S; locale: string }>;
}

/** Pure rules the views call; host binds the admin implementations so nothing is duplicated. */
export interface EmailRules<S extends EmailStatusShape, P extends EmailProviderView, Ch extends EmailProviderChoice> {
  readonly summarize: (required: { status: S }) => EmailSummary;                 // admin emailSummary
  readonly isFullyActive: (required: { provider: Pick<P, 'lanes'> }) => boolean; // admin isFullyActive
  readonly when: (required: { iso: string; locale: string }) => string;          // admin when
  readonly providerLabel: (required: { locale: string; providers: readonly P[] }) => (id: string | null) => string; // createEmailProviderLabel
  readonly displayName: (choice: Ch) => string;                                  // agentPluginDisplayName
}

/** Copy: the screen dictionary and the nav dictionary (both `({locale,key}) => string`). */
export interface EmailCopy { readonly t: EmailTranslate; readonly navLabel: EmailTranslate }

export type EmailTabId = 'overview' | 'provider' | 'sender' | 'templates' | 'activity';
/** Tab and section navigation; the host owns the URL shape (T10 builds `/email?tab=…&p=…`). */
export type EmailNavigate = (required: { tabId: EmailTabId; part: string | null }) => void;
export type EmailThemeBoundaryHook = (required: Record<string, never>, optional: Record<string, never>) => Readonly<Record<string, string>>;
```

### 5.2 Component signatures and move steps

**`EmailSegments.tsx`.**

```ts
export function Segments(props: { name: string; label: string; items: readonly { key: string; label: string }[]; active: string; onSelect: (key: string) => void; Segmented: ComponentType<EmailSegmentedProps> })
```

The body is unchanged, except that `<ChatSettingsSegmented …>` becomes `<props.Segmented …>`.

**`EmailProviderTab.tsx`.**

```ts
export function EmailProviderTab<P extends EmailProviderView, Ch extends EmailProviderChoice, S extends EmailStatusShape>(props: {
  controller: EmailProviderControl<P, Ch>; status: S | null; locale: string;
  selectedId?: string | null; onSelect?: (id: string) => void;
  kit: EmailKit<S>; copy: EmailCopy; rules: EmailRules<S, P, Ch>;
})
```

Move steps:
- Every internal component (`Lanes`, `KeyField`, `ProviderChips`, `ProviderKeyForm`, `ProviderSwitch`, `ProviderNoticeLine`, `ProviderCard`, `AddProvider`, `ProviderCards`) gains the `kit`/`copy`/`rules` members it uses, passed down explicitly.
- `t(…)` → `copy.t(…)`.
- `isFullyActive({provider})` → `rules.isFullyActive({provider})`.
- `when(…)` → `rules.when(…)`.
- `createEmailProviderLabel` → `rules.providerLabel`.
- `agentPluginDisplayName(plugin)` → `rules.displayName(plugin)`.
- `createEmailProviderSelect({props})` → inline `(id: string | undefined) => { if (id) props.onSelect?.(id); }`. It is a one-line local helper with the same name, `selectAdded`, and is not exported.
- `Chip`, `Section`, `Loaded` come from `kit`.
- `SecretInput` and `ConfirmDialog` come from `../kit.js`.
- `<Segments …>` gets `Segmented={kit.Segmented}`.
- `Lanes` reads `status?.lanes ?? []`.
- Keep the exports `shownProviderId`, `segmentLabel`, `ADD_PROVIDER_PART` and `CAPABILITIES_PART` unchanged (pure; generic over `P`).
- Keep the `new-password` why-comment and the `MOVE:` comment.
- `LANE_STATE[lane.state] ?? {…}` already narrows.
- `drafts[provider.id]?.[key]` already narrows.

**`Email.tsx`.**

```ts
export interface EmailProps<T extends EmailTypes> {
  readonly tabId?: string | null | undefined; readonly part?: string | null | undefined;
  readonly useEmailHook: () => EmailStatusControl<T['status']>;
  readonly tabHooks: EmailTabHooks<T>;
  readonly useAdminThemeBoundaryHook: EmailThemeBoundaryHook;
  readonly parts: EmailParts<T>;
  readonly kit: EmailKit<T['status']>;
  readonly copy: EmailCopy;
  readonly rules: EmailRules<T['status'], T['provider'], T['choice']>;
  readonly navigate: EmailNavigate;
}
export function Email<T extends EmailTypes>(props: EmailProps<T>): ReactElement
```

Move steps (bodies otherwise verbatim):

1. Keep these module constants (English keys into `copy.t`; neutral words):
   - `TAB_IDS`, `TAB_LABELS`;
   - `OVERVIEW_PARTS`/`_LABELS`, `SENDER_PARTS`/`_LABELS`, `ACTIVITY_PARTS`/`_LABELS` (:51–69);
   - `pickPart` (:72–76);
   - `SUMMARY` (:84–97), typed `Record<EmailSummary, { tone: EmailTone; chip: string; line: string }>`.
2. Delete `WIRED_TAB_HOOKS` (:136–142) and the `useWired*` import. `tabHooks` is required and complete: no `Partial`, no spread merge.
3. Delete `createEmailTabLabel` usage. `tabLabel = (id: EmailTabId) => props.copy.t({ locale, key: TAB_LABELS[id] })` is the same algorithm (`Email.hooks.ts` is 3 lines; the duplication is accepted to avoid an admin import).
4. `StatusBody(props: { view; locale; retry; kit; copy; rules })`:
   - `SUMMARY[props.rules.summarize({ status: view.status })]`;
   - the `<SenderDomain …/>` line → `<props.kit.StatusFacts status={view.status} locale={locale} />`.
5. `PartProps` adds `kit`, `copy`, `navigate`. `onPart` becomes `({ next }) => props.navigate({ tabId: activeId, part: next })`. The header `onChange` becomes `(next) => props.navigate({ tabId: next as EmailTabId, part: null })`, narrowed with `TAB_IDS.find((id) => id === next)` (ignore an unknown id).
6. `OverviewTab`, `SenderTab`, `ActivityTab` and `TemplatesTab` render `parts.Overview`/`parts.Sender`/`parts.Activity`/`parts.Templates` with exactly today's props. `ProviderTab` renders the moved `EmailProviderTab` with `kit`/`copy`/`rules`. The keep-mounted why-comments stay.
7. `translateAdminNavLabel` → `props.copy.navLabel`. `TabBar` → `props.kit.TabBar`. `useAdminThemeBoundaryHook({}, {})` is unchanged.
8. Delete the CSS side-effect imports (`assistant.css`, `email.css`, `settings-dialog.css`). They stay at the host entry (T10). Keep the `@file` doc, reworded "host" for product terms (G4).

**`EmailTemplateEditor.tsx`.**

```ts
export interface EmailTemplateEditorKit {
  readonly Icon: ComponentType<{ name: string; size: number; 'aria-hidden': 'true' }>;
  readonly Chip: EmailKit<EmailStatusShape>['Chip'];
  readonly Loaded: EmailKit<EmailStatusShape>['Loaded'];
  readonly DevicePreviewFrame: ComponentType<{ width: number; frameRef: unknown; paneWidth: unknown; children?: ReactNode }>; // copy the admin prop shape (DevicePreviewFrame.tsx) — members passed at today's call site only
  readonly DevicePreviewToggle: ComponentType<{ device: string; setDevice: (device: string) => void; t: (key: string) => string; handlePrefix: string }>;
  readonly devicePreviewWidths: Readonly<Record<string, number>>;
  readonly previewSandbox: string;                       // PAGE_PREVIEW_IFRAME_SANDBOX
  readonly adminBase: string; readonly adminHref: (required: { routePath: string }) => string;
}
export interface EmailTemplateEditorHooks<C, V> {
  readonly useEditorHook: (required: { id: string }) => C;
  readonly useAdminLocaleHook: () => string;
  readonly useEmailTemplateViewHook: () => V;
  readonly useTabBarKeyboardHook: (required: { tabs: readonly { id: string; label: string }[]; activeId: string; onChange: (id: string) => void }) => { onKeyDown: (event: KeyboardEvent<HTMLElement>) => void };
  readonly useDirtyGuardHook: (required: { current: boolean; original: boolean | null }, optional: { host: Window; translate: (key: string) => string }) => { confirmLeave: () => boolean };
}
export function EmailTemplateEditor<C extends EmailTemplateEditorControl, V extends EmailTemplateViewControl>(props: {
  id: string; locale?: string | undefined;
  hooks: EmailTemplateEditorHooks<C, V>; kit: EmailTemplateEditorKit;
  copy: { readonly t: EmailTranslate; readonly pageEditorT: EmailTranslate };
  resolveTabIndex: (required: { tabs: readonly { id: string; label: string }[]; activeId: string; tab: { id: string; label: string } }) => number;
})
```

Sol completes `EmailTemplateEditorControl` and `EmailTemplateViewControl` as structural interfaces. Their members are exactly those read in the file:
- `controller`: `name`, `setName`, `commitName`, `html`, `setHtml`, `save`, `dirty`, `saving`, `savedAt`, `mode`, `setMode` (if read by `AsSentToggle`), `fieldNames`, `preview: { data, error, pending }`, `view` (`EmailLoadView<{ subject: string }>`).
- `view`: `tab`, `setTab`, `device`, `setDevice`, `frameRef`, `paneWidth`.

Copy each member type from `J/admin/src/screens/email/hooks/use-email-template-editor.hooks.ts` and `use-email-template-view.hooks.ts`, **narrowed to the read members only**. If a member's type names another admin type, copy that type structurally too. Record each copied type in the commit body.

Move steps:
- `editorStatus` stays exported, with the same order: saving → dirty → saved/null.
- `TABS`, `Fields`, `AsSentToggle`, `Preview`, `Header`, `Toolbar`, `Actions`, `leavesEditor`, `replacesCurrentWindow` and `isPlainNavigationClick` stay with the same bodies; their imports become `kit`/`copy`/`hooks` members.
- `useEditorKeys` stays module-private. It takes `{ controller, locale, useDirtyGuardHook, adminBase, t }`, keeps its `{ host = window, documentHost = document }` options, and preserves the capture-phase click listener and Ctrl/Cmd+S.
- `useEditorLocale` is replaced by `props.locale ?? hooks.useAdminLocaleHook()`. The hook is always called; the override wins.
- `createEmailPageTranslator` is inlined as `(key: string) => copy.pageEditorT({ locale, key })`.
- The html/preview branch order is preserved. Keep the sandbox why-comment.

### 5.3 Package, exports, changeset

- Leaves in `J/user-management/package.json` `exports`, with `jini.entries` `"browser"`:
  - `./react/mail/Email`
  - `./react/mail/EmailProviderTab`
  - `./react/mail/EmailTemplateEditor`
  - `./react/mail/email-view.types`

  Each uses `types`/`import`/`default` → `dist/react/mail/<name>.{d.ts,js}` (pattern of `./react/auth/owner-mfa-api`, `package.json:489–493`). `EmailSegments` is internal: no leaf. No `typesVersions`; the tsconfig already has jsx/DOM. No `react/index.ts` barrel change.
- `.changeset/admin-extraction-10.md`: `"@jini-ai/user-management": minor`, listing the four leaves and their exported symbols. Opus refreshes `api-baseline/jini-ai__user-management.json`.
- G1: tests go in `J/user-management/src/react/mail/__tests__/`.
- G4: grep the moved files for `-iE 'tovu|open design|OD_'`. Comment hits become "the host".

**Tests first** (fakes for every prop; render with `@testing-library/react`; wrap in `UserManagementKitProvider` with fake `SecretInput`/`ConfirmDialog`):

- `EmailPanel.part-routing.unit.test.tsx`:
  - `?tab=sender&p=dns renders parts.Sender with part "dns"`;
  - `an unknown p falls back to the first section`;
  - `switching a section calls navigate with the active tab and the part`;
  - `only the active tab's hook is called`;
  - `status summary uses rules.summarize and kit.StatusFacts`.
- `EmailProviderTab.secret.unit.test.tsx`: `a saved key is never echoed in status, placeholder or notice`. The draft value comes only from `drafts`.
- `EmailTemplateEditor.preview-copy.unit.test.tsx`:
  - `preview never marks an unsaved template saved`;
  - `editorStatus order is saving, dirty, saved`.

**Mutations:**
- `M-reveal-provider-key-in-status`: render `drafts[id].token` into the notice line.
- `M-preview-marks-unsaved-template-saved`: swap the dirty/saved branches in `editorStatus`.
- `M-ignore-part-prop`: `pickPart` always returns `parts[0]`.

---

## 6. T10 — Email mount and lazy routes (Tovu admin)

`BUILDER: SOL (OPUS-REVIEW)` · After J10

**New `A/features/email/email-panel.tsx`.** It is the only file that builds J10's props: one bound component per screen. It is not a re-export shell; it owns the binding.

```ts
import type { AdminMailStatus } from "@jini-ai/admin/screens/email/api/mail-status-api.types";
import type { MailProviderConfiguration } from "@jini-ai/admin/screens/email/email-api.types";
import type { AdminAgentPluginRow } from "@jini-ai/core/contracts/site/cms-agent-plugins";
import type { EmailOverviewController } from "@jini-ai/admin/screens/email/hooks/use-email-overview.hooks";
// … EmailSenderController, EmailTemplatesController, EmailActivityController (same module paths as email-hooks-host.ts:3–10)

type HostEmailTypes = {
  status: AdminMailStatus; provider: MailProviderConfiguration; choice: AdminAgentPluginRow;
  overview: EmailOverviewController; sender: EmailSenderController; templates: EmailTemplatesController; activity: EmailActivityController;
};

const TAB_HOOKS: EmailTabHooks<HostEmailTypes> = { overview: useWiredEmailOverview, provider: useWiredEmailProvider, sender: useWiredEmailSender, templates: useWiredEmailTemplates, activity: useWiredEmailActivity };
const PARTS: EmailParts<HostEmailTypes> = { Overview: EmailOverviewTab, Sender: EmailSenderTab, Activity: EmailActivityTab, Templates: EmailTemplatesTab };
const KIT: EmailKit<AdminMailStatus> = {
  TabBar, Segmented: ChatSettingsSegmented, Chip, Section, Loaded,
  StatusFacts: ({ status, locale }) => {
    const verification = status.senderDomainVerification;
    return <SenderDomain status={{ senderDomain: verification?.domain ?? null, providerVerification: verification ?? null }} locale={locale} />;
  },
};
const RULES: EmailRules<AdminMailStatus, MailProviderConfiguration, AdminAgentPluginRow> = {
  summarize: emailSummary, isFullyActive, when,
  providerLabel: createEmailProviderLabel, displayName: agentPluginDisplayName,
};
const COPY: EmailCopy = { t, navLabel: translateAdminNavLabel };
const navigateEmail: EmailNavigate = ({ tabId, part }) =>
  navigate({ routePath: part === null ? `/email?tab=${tabId}` : `/email?tab=${tabId}&p=${encodeURIComponent(part)}` }, { replace: true });

export function EmailPanel(props: { tabId?: string | null; part?: string | null }) {
  return <Email<HostEmailTypes> {...props} useEmailHook={useWiredEmail} tabHooks={TAB_HOOKS} useAdminThemeBoundaryHook={useAdminThemeBoundary}
    parts={PARTS} kit={KIT} copy={COPY} rules={RULES} navigate={navigateEmail} />;
}
export function EmailTemplateEditorPanel(props: { id: string; locale?: string }) { /* same pattern: hooks = { useEditorHook: useWiredEmailTemplateEditor, useAdminLocaleHook: useAdminLocale, useEmailTemplateViewHook: useEmailTemplateView, useTabBarKeyboardHook: useTabBarKeyboard, useDirtyGuardHook: useDirtyGuard }, kit = { Icon, Chip, Loaded, DevicePreviewFrame, DevicePreviewToggle, devicePreviewWidths: DEVICE_PREVIEW_WIDTHS, previewSandbox: PAGE_PREVIEW_IFRAME_SANDBOX, adminBase: ADMIN_BASE, adminHref }, copy = { t, pageEditorT }, resolveTabIndex: resolveTabBarTabIndex */ }
```

`email-panel.tsx` also does these things:
- It keeps the CSS side-effect imports that were at `Email.tsx:5,28–29` and `EmailTemplateEditor.tsx:7,21`: `@jini-ai/ui/settings-dialog.css`, `../../styles/assistant.css` and `@jini-ai/admin/screens/email/email.css`.
- `agentPluginDisplayName` comes from `../plugins/rules`.
- The `useAdminThemeBoundary` signature `(required: object, optional: { root?: HTMLElement })` must satisfy `EmailThemeBoundaryHook`. If TS rejects the `optional` variance, bind `(r, o) => useAdminThemeBoundary(r, o)` (a hook calling a hook).
- `useWiredEmailProvider`'s `(optional = {})` already satisfies the hook shape, and the controllers assign structurally. If any assignment fails, fix the J10 structural type in J10 (Opus), never with a cast here.

**Repoints** (ledger verified against `rg`):
- `A/features/email/index.ts:5–6` → `export { EmailPanel as Email, EmailTemplateEditorPanel as EmailTemplateEditor } from "./email-panel";`. This keeps the feature barrel contract the lazy loader and pins use. It is an owned binding, not a shell.
- `A/panel-pages.ts:55,56`: unchanged specifiers (`./features/email` → `module.Email` / `module.EmailTemplateEditor`). Verify they still resolve.
- `A/__tests__/unit/admin-route-lazy-loading.unit.test.tsx:42`: unchanged.
- `A/panels.tsx:1246` and `A/__tests__/unit/panels-render.unit.test.tsx:44,423`: unchanged props (`id`).
- Tests:
  - `A/features/email/__tests__/Email.unit.test.tsx:5` → render `Email` from `@jini-ai/user-management/react/mail/Email` with fakes, or `EmailPanel` for wiring cases;
  - `EmailTabs.unit.test.tsx:7` → `@jini-ai/user-management/react/mail/EmailProviderTab`, passing `kit`/`copy`/`rules` fakes;
  - `EmailTemplateEditor.unit.test.tsx:4` → the Jini leaf with `hooks`/`kit` fakes;
  - `email-controller.test-helpers.ts:2` → `import type { EmailTabHooks } from "@jini-ai/user-management/react/mail/email-view.types"`, instantiated with `HostEmailTypes` (export that alias type-only from `email-panel.tsx`).
- Delete `A/features/email/{Email.tsx, EmailProviderTab.tsx, EmailSegments.tsx, EmailTemplateEditor.tsx}` only after `git grep -n -E "features/email/(Email|EmailProviderTab|EmailSegments|EmailTemplateEditor)\b|from \"\\.\\./(Email|EmailProviderTab|EmailTemplateEditor)\"" -- apps` is empty.
- Stale strings: `A/lib/__tests__/dictionary-lookup-sinks.unit.test.ts:49,309–322` and `fixtures/admin-literal-copy.baseline.json:39` already name paths that do not exist. Leave them, and list them in the commit body for Opus. They are not this sheet's regression.
- `email-hooks-host.ts` and provider-edit/typed-secret wiring are unchanged (two controller families bound independently, as the ext-a T10 text requires).
- Verify `UserManagementKitProvider` wraps the admin route tree (`git grep -n "UserManagementKitProvider" -- apps/admin/src`). If it does not wrap `/email`, wrap `EmailPanel`/`EmailTemplateEditorPanel` in it with the host's existing kit object. Do not create a second kit.

**First test (G2).** `A/features/email/__tests__/email-panel.binding.unit.test.tsx`:
- `the panel binds the real admin parts and rules`: render `EmailPanel` with a stubbed `mailStatusApi`; assert the Overview status chip text comes from admin `emailSummary`;
- `section change writes ?tab and ?p with encoding`: spy `navigate`; the part `a b` → `/email?tab=sender&p=a%20b`, `{ replace: true }`.

**Mutation:** in `navigateEmail`, drop `encodeURIComponent`. The second test fails.

**Package.** No Tovu changeset or baseline. Record the `@jini-ai/user-management` range bump for release integration.

---

## Residual notes for Opus review

- **J10 is a large generic surface.** `EmailTemplateEditor`'s structural controller types are the one place Sol fills members from source. The sheet bounds that to "members read in the file" and requires listing them in the commit body.
  - If the review prefers it, the alternative is to put `Email.tsx`/`EmailProviderTab.tsx` in `@jini-ai/admin/screens/email/`, where all their siblings already live. That drops most injection, but it contradicts the sheet's `user-management` destination and the approved `parts` map, so I did not take it.
- **T4c `readLedger` binding** depends on which ledger reader the content and chat runners actually use (standard `LedgerRow` vs legacy mapping). The sheet makes Sol stop rather than guess.
- **T5a changes `TurnLock`** (one method) and adds one early-return line in `incrementalVacuumStep`. Both are covered by named mutations.
- **G06 type exports.** `launch.ts` exports `AdmittedLaunch`/`PreparedLaunch`/`StagedLaunch`/`LaunchResources`/`LaunchLock` at module scope only. If `api-extractor` picks them up through `agent-executor/index.ts`, the export is wrong. Verify that `index.ts:143` imports named symbols only.
