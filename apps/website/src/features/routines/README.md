# Routines (serving-site host)

Recurring AI jobs (P3). Jini owns the scheduler (`RoutineService`), the durable store
(`@jini-ai/daemon/routines/sqlite`) and the row contracts (`@jini-ai/core/contracts/site/routines`).
This folder is Tovu's **host**: where the data file lives, who may change it, how it opens and closes,
and the hint the desktop app reads. The feature is dark: `ROUTINES_RELEASE_ENABLED`
(`@tovu/contracts/routines`) is `false`, and `composeAssistantRoutines` is not yet called from `createServingApp`. Its routes pass through the owner command gate: the Jini factories keep parsing, copy and status mapping, while access, availability, creator stamping and post-commit reschedule/beacon stay in `routine-commands.ts`.

| File | Role |
|---|---|
| `routines-paths.ts` | `routinesPaths({ contentDbPath })` → `{ dir, db, beacon }` under `<dirname(contentDbPath)>/ops/` |
| `routine-commands.ts` | `createRoutineCommands(...)`: the owner command gate |
| `routine-host.ts` | `openRoutineSidecar`, `closeRoutineHost`, `writeRoutineBeacon` |
| `W/platform/db/sqlite/routines-db.ts` | `openRoutinesDb`: the tuned sidecar connection |
| `W/server/runtime/composition/modules/assistant-routines.ts` | `composeAssistantRoutines(...)`: eligibility gate, sidecar, scheduler start/stop with the assistant switch, drain-before-close, admin routes at `/api/admin/assistant/routines` (`/:id`, `/:id/run`, `/:id/runs`) |

## Host contract

- **Own connection, own file.** `ops/routines.db` opens on a separate connection with WAL,
  `busy_timeout=5000` and `foreign_keys=ON`. It follows the *actual* content path, so relocated
  content (`data.nosync`, app-data) keeps routines beside it. Never guess `<siteDir>/content.db`.
- **Migrate before the store.** `openRoutineSidecar` runs Jini's `migrateJiniRoutines` through the
  injected `@jini-ai/db/migrate` runner on that connection's kernel, then hands the *borrowed*
  handle to `createSqliteRoutineStore`. The store never closes it; the host's close registration does.
- **Open failure keeps the site up.** It returns `{ ok: false, availability: 'error' }` and logs;
  every command then refuses with `ROUTINES_STORE_OPEN_FAILED`.
- **Close order** (`closeRoutineHost`): quiesce (no new claims) → drain active runs for at most
  2 s (raced against injected timers) → mark this boot's still-running rows `interrupted`, which also
  expires their waiting approvals → `stop({}, { releaseLease: true })` → close the DB **last**. Rows
  held by another boot (a passive window) are never interrupted. Each step's failure is logged and
  the DB still closes. Approval watchers arrive with T3.T and are disposed before the lease release.
- **Inject everything.** Clock, ids, timers, DB opener, migration runner, logger and fs are
  parameters; nothing here reads env or a singleton.

## Commands

Every command takes a trusted `RoutineActor` (from the authenticated session, never a body), re-checks
`access({ actor }, {})` and then the live availability. `create` stamps `creatorId` from
`actor.principalId` once and takes `target` only from composition; body `owner`/`creatorId`/`target`
are ignored. `update`, `setEnabled` and `delete` forward `expectedRevision`. Reschedule/unschedule and
`onCommandCommitted` (the beacon writer) run only **after** the store resolves; their failures are
logged and never undo or misreport the committed write. Pause and delete stop future slots, not an
active run.

Envelopes:

| Command | Success |
|---|---|
| `list({ actor })` | `{ ok: true, routines: RoutineRow[], availability: 'ready' }` |
| `get({ actor, id })` | `{ ok: true, routine }` |
| `create({ actor, draft })`, `update(...)`, `setEnabled(...)` | `{ ok: true, routine }` |
| `delete({ actor, id }, { expectedRevision })` | `{ ok: true }` |
| `runNow({ actor, id })` | `{ ok: true, run: { projectId, conversationId, agentRunId } }` |
| `listRuns({ actor, id }, { cursor, limit })` | `{ ok: true, runs: RoutineRunSummary[], nextCursor }` |

Rows and run summaries are allowlist projections: no `context`, `holderId`, `approvalRef` or
credentials. Refusals are `{ ok: false, status, reason, message, availability? }`:

| Case | Status | `reason` | Message |
|---|---|---|---|
| access denied | 403 | `ROUTINES_FORBIDDEN` | Only the site owner can manage routines. |
| missing routine | 404 | `ROUTINE_NOT_FOUND` | That routine no longer exists. |
| `desktop-only` | 503 | `ROUTINES_UNAVAILABLE` | Routines run only while the desktop app is open. |
| `assistant-off` | 503 | `ROUTINES_ASSISTANT_OFF` | Turn on the AI assistant to run routines. |
| `other-window` | 503 | `ROUTINES_LEASE_HELD` | Routines for this site are running in another Tovu window. |
| `error` | 503 | `ROUTINES_STORE_OPEN_FAILED` | Routines are unavailable because their data file could not be opened. |

Store errors (invalid schedule, stale revision, active run, busy, full storage) propagate unchanged so
the route layer keeps J2.J's status and reason mapping.

## Beacon

`ops/routines-beacon.json` = `{ "v": 1, "enabled": <live enabled routines, 0 when the assistant is off>,
"updatedAt": <ms> }`, written via temp file + rename after each commit and on boot reconciliation. It
is a hint for the desktop main process (read with `parseRoutineBeacon`, bounded to 4 KiB), never
authority. A write failure is a diagnostic only.

## Privacy

`ops/routines.db`, `-wal`, `-shm` and the beacon sit in `ops/`, which backup (`site-backup/sources.ts`),
portable copy (`site-dir/layout.ts`) and publish (`publish-content/backstop-policy.ts`) already exclude.
`__tests__/routines-private-paths.unit.test.ts` pins that for root and relocated content.
