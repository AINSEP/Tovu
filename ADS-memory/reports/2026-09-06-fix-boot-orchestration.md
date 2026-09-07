# Fix boot orchestration dedup — Programmer(Boot Orchestration), 2026-09-06

Persona bootstrap loaded: `AI-Dev-Shop/agents/programmer/skills.md` (Programmer Agent v1.7.1).

## Verdict on the inherited uncommitted diff: FINISHED (with one addendum), committed as is

The predecessor's third item (five files, +86/-52 as described) was read in full before touching
anything, and independently re-verified rather than trusted:

- **The false-comment claim** — confirmed. `4dfbfe80` ("guard npm run dev / npm start against
  migrating a newer content.db") is real, same-day, and extracts a different piece of `index.ts`'s
  boot-only logic into a shared, imported, unit-tested module (`content-db-schema-guard.ts`) —
  directly contradicting the removed comment's claim that this class of logic is "never shared via
  import." Confirmed the false comment is now fully gone from both `index.ts` and `serve.ts`; the
  one remaining "never imported by a test" line in `index.ts:249` is the narrower, true claim about
  the file itself, not the broad false one.
- **`shouldStartAgentDaemon` was genuinely dead before this fix** — grepped `apps/website/src` for
  every reference: before, only its own definition and its own unit test
  (`admin-assistant-enabled.test.ts`) referenced it. `agent-daemon-wanted.ts` (new file) now calls
  it (`shouldStartAgentDaemon(configured.length > 0)`), matching its real signature
  (`externalMcpConfigured: boolean, env?`).
- **`RouteDeps` fields the export fix depends on** — confirmed `createSqliteRouteDeps()` (`server/
  runtime/composition/deps.ts`) constructs and returns `workspaceId`, `migrationRunsRepo`,
  `databaseLedgerRepo`, and `siteStatusRepo`, and that `reconcileInterruptedMigrationOnBoot`'s real
  signature (`reconcile-interrupted-migration.ts:63`) takes exactly `{siteId, migrationRuns, ledger,
  siteStatus}` and returns `{blocked: boolean}` — the call site in `export.ts` matches exactly.

No corrections were needed to the diff itself. It was applied as inherited, verified, tested, and
committed.

**One thing I added beyond the inherited diff**: a genuine, unrelated pre-existing defect
discovered during regression testing (see below), disclosed in the commit message and this report
rather than silently absorbed into "done."

## Commit

`d1eea4b2` — `refactor(boot): dedupe agentDaemonWanted/logCriticalBootFailures; close export's
migration-scan gap`. Exactly 7 files, all in scope:
`cli/commands/export.ts`, `cli/commands/serve.ts`, `cli/errors.ts`, `index.ts`,
`server/runtime/boot/bootstrap.ts`, `server/runtime/boot/agent-daemon-wanted.ts` (new),
`cli/__tests__/integration/export-command-migration-recovery.integration.test.ts` (new). Confirmed
via `git show --stat` and a post-commit `git status` scoped to these directories — nothing else was
swept in; the predecessor's unrelated leftover `zzz-debug-cr-r04-2.test.ts` was correctly left
untouched.

## RED → GREEN evidence (the export gap)

New `export-command-migration-recovery.integration.test.ts` (2 tests): plants a real non-terminal
`migration_runs` row in the sidecar `ops/database-journal.db` via the shipped schema/opener
(`openDatabaseJournalDb`/`migrationRuns`, not hand-rolled SQL), then runs `tovu export` as a real
spawned CLI process.

- **RED** (temporarily changed `if (reconciliation.blocked)` to `if (false && reconciliation.blocked)`
  in `export.ts`, ran the test, then restored): the blocked-export test failed —
  `1 !== 7` became `6 !== 7`: **the export ran to completion anyway** (`EXPORT_INCOMPLETE`, 13
  failed routes — consistent with crawling a site left mid-migration) instead of refusing. This is
  exactly the live gap the item describes.
- **GREEN** (guard restored, confirmed via `git diff` showing zero stray artifacts): both tests
  pass — blocked export exits 7 with `EXPORT_BLOCKED_PENDING_RECOVERY` and writes no output
  directory at all; the paired "healthy site" test confirms an unaffected site still exports
  normally.
- Asked "what would this still pass under?": it would NOT pass if the scan were wired to only
  `serve.ts`/`index.ts` and not `export.ts` (the RED run proves that exact scenario fails), and it
  would not pass if `export.ts` silently exported instead of refusing (also proven by RED). The
  paired healthy-site test rules out a version that blocks unconditionally.

## All three entrypoints confirmed on one shared path

- `index.ts` and `cli/commands/serve.ts`: both now `import { agentDaemonWanted } from
  ".../boot/agent-daemon-wanted.js"` and `import { logCriticalBootFailures } from ".../boot/
  bootstrap.js"` — grepped both files; zero local re-definitions remain, both call sites (`if
  (!(await agentDaemonWanted(deps))) return;` and `logCriticalBootFailures(...)`) intact.
- `cli/commands/export.ts`: now calls `reconcileInterruptedMigrationOnBoot` directly (deliberately
  not the full `buildBootModules` bundle — that also seeds optional modules like bundled agent
  plugins that have no relationship to exporting; wiring the whole bundle would have been a second,
  unannounced behavior change beyond the one this item calls for).
- Ran `serve-command-boot-lifecycle.integration.test.ts` (2/2 pass) to confirm `serve.ts`'s own
  boot-lifecycle wiring survived the dedup untouched.

## Regression / type / lint checks

- `export-command-migration-recovery.integration.test.ts`: 2/2 pass (GREEN, above).
- `export-command-plugin-sdk-resolver.integration.test.ts`: 1/1 pass.
- `serve-command-boot-lifecycle.integration.test.ts`: 2/2 pass.
- `export-command.integration.test.ts`: **3/4 pass** — see "Could not verify / discovered issue"
  below for the one failure, confirmed unrelated to this diff.
- `tsc -p tsconfig.json --noEmit`: exit 0, zero output (the dispatch's "~31 pre-existing errors"
  note is stale — the tree is currently clean).
- `eslint` on all 7 touched files (+ the new test file): 0 errors, 3 pre-existing warnings
  (`noInlineConfig` complaints about `eslint-disable-next-line no-console` comments that predate
  this diff, in `serve.ts` and in an unrelated `seedBundledAgentPlugins` block inside `bootstrap.ts`
  that this diff does not touch). No complexity-ceiling violations.

## Could not verify clean / discovered issue (disclosed, not fixed)

`export-command.integration.test.ts`'s second test ("a non-empty `--out` is refused ... unless
`--clean`") fails reproducibly (hit it twice, including once in isolation via
`--test-name-pattern`) with:

```
SqliteError: UNIQUE constraint failed: roles.workspace_id, roles.name
    at SqliteRoleRepo.save (features/identity/repo.sqlite.ts)
    at seedBuiltinRoleWithPolicy (Jini/packages/cms/dist/identity/seed.js)
    at seedIdentity (Jini/packages/cms/dist/identity/seed.js)
```

This happens on the test's **third** boot of the same install dir's composition root (`init` →
export refused → export `--clean`), inside `createSqliteRouteDeps()` → `seedIdentity()` —
**strictly before** this diff's new `reconcileInterruptedMigrationOnBoot` call is ever reached.
None of this diff's 7 files touch identity or seeding. Confirmed via the RED test above that
short-circuiting my new guard changes the *other* test's outcome, not this one — this failure
reproduces identically whether the guard is present or disabled. This is a real, pre-existing
idempotency gap in `@jini-ai/cms`'s `seedIdentity`/`seedBuiltinRoleWithPolicy` (or in how
`wiring.ts` calls it) surfacing on a repeated real boot against an already-seeded db — out of
scope for this item (touches identity/vendored-package seeding, not boot orchestration) and not
something I fixed. Flagging for whoever owns identity/composition-root work.

## Not touched (disclosed per the inherited diff's own note, re-verified, still true)

The 8-promise `Promise.all([...])` readiness list is still duplicated between `index.ts` and
`serve.ts`. Left alone: each closes over locally-scoped variables (`target` vs `siteDir()`), and a
literal array of 8 field names is much lower silent-drift risk than the hand-rolled boolean logic
this commit removed.

## Architecture Audit

**PASS.** ADR checklist: boot-only logic stays in `server/runtime/boot/*` (new file follows this);
`cli` layer still never maps errors to exit codes itself (`ExportBlockedPendingRecoveryError` is
mapped in `cli/errors.ts`, matching the existing `ExportIncompleteError` pattern exactly); no new
cross-layer imports. No violations found in the 7 changed files.

## Pre-Completion Checklist

- Requirements re-verified against the dispatch: dedup done, false comment removed, dead primitive
  wired, export gap closed with a distinct, explicit exit code — yes.
- Fresh evidence: all commands above run fresh this session, not inherited from the predecessor's
  report.
- No certified test deleted or weakened.
- Scope: exactly the 5 files named in the dispatch plus their 2 natural companions (new helper
  module + new test file) — no admin, dev-auth, outbox-worker, form-render, or
  `development/scripts/` files touched.
- Open items: the identity-seeding UNIQUE-constraint defect above (unrelated, unfixed, flagged);
  the still-duplicated 8-promise readiness list (deliberately deferred, low risk).
