# Fix composition-root defects — Programmer(Composition Root), 2026-09-06

Working the three items from `2026-09-06-tovu-8f-handoff.md` section C (#5, #6, #9), in the order
the dispatch prompt specified. Reporting incrementally; each item is committed separately.

---

## Item 1 (section C #6) — authz grants registered by import side effect

**Claim confirmed.** `builtin-role-grants.ts:13-16`'s module-scope `Map` is populated only when
`features/pages/permissions.ts` is evaluated (import side effect). Audited every real call site of
`createSqliteIdentityRouteDeps`/`createInMemoryIdentityRouteDeps`
(`server/runtime/composition/app.ts`, `server/runtime/composition/deps.ts`,
`development/scripts/backfill-reset-admin-password.ts`, plus their test files) —
`development/scripts/backfill-reset-admin-password.ts` was the only broken one. The two real
composition roots are safe today only *incidentally*: both import the Pages barrel already, for an
unrelated reason (`InMemoryPagesHtmlDocumentStore`/`PagesHtmlDocumentStore`), which happens to also
trigger the registration side effect.

**A second, more serious defect found while fixing the first, not assumed — verified with a
throwaway script before touching production code:** naively adding the missing import would have
made this script's **dry run start throwing**, not just start working. `identityReady`'s boot-time
reconciliation (`migrateDeprecatedPermissionGrants` + `applyBuiltinRoleGrants`) is additive-only in
which *rows* it touches, but it still *attempts* a `.save()` whenever something is outstanding — and
this script's dry-run path opens `content.db` via `openContentDbReadOnly` (`better-sqlite3`
`readonly: true`). A `.save()` against that connection throws
`SqliteError: attempt to write a readonly database` (confirmed directly, not inferred — see the
regression test below) instead of no-op'ing. Today this is silent because the registry was empty
(bug #1), so nothing was ever outstanding to write. Fixing #1 alone would have converted a
"silent capability removal" bug into a "dry run crashes against exactly the production DB the
report names" regression — worse for an emergency recovery tool.

**Fix, two parts:**
1. `apps/website/src/features/identity/wiring.ts` — added `reconcileGrantsOnBoot?: boolean` (default
   `true`, fully backward-compatible) to `buildIdentityRouteDeps` and both public constructors. `false`
   skips the entire write-capable reconciliation chain rather than relying on there being nothing to
   reconcile.
2. `development/scripts/backfill-reset-admin-password.ts` — added the side-effect import
   (`import "../../apps/website/src/features/pages/index.js";`, mirroring the identical pattern
   `wiring.test.ts` already used) so the grant now actually registers, and passed
   `reconcileGrantsOnBoot: args.apply` so the write-capable step only ever runs against the writable
   `--apply` connection, never the read-only dry-run one.

**Behavior change (explicit, as required):**
- `--apply` now reconciles this repo's own `theme.edit -> pages.edit_html` migration and
  `admin -> pages.edit_html` built-in-role grant, same as a real server boot — previously it silently
  skipped both.
- Dry run behavior is unchanged in outcome (still never writes) but is now protected *by design*
  (`reconcileGrantsOnBoot: false`) rather than by accident (empty registry).
- `createSqliteIdentityRouteDeps`/`createInMemoryIdentityRouteDeps` gained one new optional
  parameter; every existing caller that omits it is unaffected (verified by test, see below).

**RED → GREEN evidence** (all via `node --import tsx --test --experimental-test-module-mocks
<exact-file>`, run from repo root, one file at a time):
- `apps/website/src/features/identity/__tests__/wiring.test.ts` — 2 new tests added:
  - `reconcileGrantsOnBoot: false skips the pages.edit_html backfill the default path performs`
  - `reconcileGrantsOnBoot: false avoids the readonly-write crash a dry-run connection would
    otherwise hit` (asserts the exact error text `attempt to write a readonly database` on the
    *unflagged* construction, to prove the flag is load-bearing, not incidental)
  - RED (guard temporarily reverted to `if (false) return undefined;`): 8 pass / **2 fail**, exactly
    the 2 new tests, with the second failing on the real SQLite readonly error as predicted.
  - GREEN (fix restored): **10/10 pass**.
- `development/scripts/__tests__/backfill-reset-admin-password.test.ts` — 1 new test added:
  `--apply reconciles this repo's own pages.edit_html grant onto admin, same as a real server boot;
  a dry run against the identical gap neither writes nor crashes`.
  - RED (script's import + flag temporarily reverted): 8 pass / **1 fail** (the new test, on
    `--apply must reconcile ... false !== true`).
  - GREEN (fix restored): **9/9 pass**.
- Regression check (unmodified by this fix, run to confirm no collateral damage):
  `features/identity/__tests__/reset-admin-password-self-verified.test.ts` (2/2 pass — this is the
  file most at risk from a naive "throw on empty registry" design, since it never imports the Pages
  barrel; confirms my design doesn't touch its passing path) and
  `features/identity/__tests__/builtin-role-grants.test.ts` (8/8 pass, unaffected — no changes to
  that file).
- `tsc -p tsconfig.json --noEmit`: exit 0, zero output — the new optional `reconcileGrantsOnBoot`
  parameter type-checks cleanly everywhere.

**Disproved assumption, recorded per this session's own "premises get repeated" rule:** the
dispatch's suggested framing — "an empty or unregistered registry should be an error at
construction" (i.e. throw) — does not hold generally. I verified two existing, currently-passing
test files (`reset-admin-password-self-verified.test.ts`, and this same
`backfill-reset-admin-password.test.ts` before my fix) construct identity deps with a **genuinely,
legitimately empty** built-in-role-grant registry (they never import the Pages barrel and don't need
its permission). A blanket throw-on-empty inside `applyBuiltinRoleGrants`/`buildIdentityRouteDeps`
would have broken both. The registry being empty is not itself invalid — only *silently proceeding
to skip a write that mattered* was the bug, and only for one specific caller. Went with a
caller-declared opt-out (`reconcileGrantsOnBoot`) instead of a blanket assertion, and fixed the one
proven-broken call site directly, per "audit every place identity deps are constructed."

Committed as `11aa4708`.

---

---

## Item 2 (section C #5) — site binding re-derived from ambient state

**Claim confirmed**, with a scoping refinement. `routes/system/sites.ts` calls
`listSites()`/`createSite()`/`describeSiteBinding()` with **zero arguments** — but these functions
already accept an optional `{cwd, env}` (confirmed: `ListSitesOptional = ResolveSiteRootOptional`),
so the *primitive* was never broken; only these three call sites (and `sites_duplicate_site`'s own
`cwd` default) never supplied it. `cli/commands/serve.ts` resolves the served site directly from
the CLI's `<dir>` argument via `bootSiteDir({dir: target})` — never touching `TOVU_SITE_DIR`/
`TOVU_SITE` at all — so a bare `describeSiteBinding()` call inside the route re-derives an unrelated
`<process.cwd()>/sites/tovu-com`. Verified this is not merely theoretical: `cli/commands/serve.ts`
never sets `TOVU_SITE_DIR`, so nothing masks it for the CLI path (only desktop's `tovu-server.cjs`
does, exactly as the dispatch said).

**Scoping refinement, found by tracing further, not assumed:** `target` (the install-dir argument)
is an *arbitrary* path with no `sites/`-sibling relationship to any `cwd` — there is no principled
`cwd` value that makes `listSites`/`createSite`'s `<cwd>/sites/<name>` model correct for it. Fixing
`currentSite` (the read side) is unambiguous and fully fixed. For Create/Activate/
`sites_duplicate_site` (the write side), "silently write under the nearest fabricated cwd" would be
worse than the current bug, not better — so per "prefer failing closed," these now **refuse** with a
new `SITE_BINDING_NOT_SWITCHABLE` (409) / `SiteBindingNotSwitchableError` when the boot has no
principled `sites/` root, rather than either guessing or silently writing to the wrong tree.

**Fix:** `RouteDeps.siteBinding`, resolved **once** by each composition root — the same "read once at
the root, thread the value down" discipline `exportOutputRootDir`/`themesDir` already establish in
`routes/types.ts` (this was the existing, established pattern for exactly this class of "install-dir
vs default boot" divergence: `uploadsDir`/`themesDir` already had the identical CR-R01 fix). Added
`SiteBinding.switcherCompatible` (always `true` from `describeSiteBinding()`'s own resolution; `false`
only for `cli/commands/serve.ts`'s explicit install-dir override).

Files: `platform/site-dir/site-registry.ts` (new field), `server/routes/types.ts` (`RouteDeps.siteBinding`),
`server/runtime/composition/deps.ts` + `app.ts` (both composition roots populate it), `cli/commands/serve.ts`
(explicit override), `server/inbound/admin-http/routes/system/sites.ts` (reads the value directly,
refuses Create/Activate on `!switcherCompatible`), `features/sites/deps.ts` + `tool-registrations.ts`
(`sites_duplicate_site` gets the identical refusal — a real `RouteDeps` already structurally satisfies
`SitesToolDeps.siteBinding?`, no extra wiring needed at `assistant/tool-registrations.ts`).

**Behavior change (explicit):** `currentSite` is now always correct, including under `tovu serve
<dir>` (previously wrong). Create/Activate/`sites_duplicate_site` now refuse cleanly under an
install-dir boot instead of silently writing to an unrelated `sites/` tree — there is no reading
under which the old silent-wrong-write behavior was intentional. Every other boot path (default,
desktop `TOVU_SITE_DIR`) is byte-for-byte unaffected: `switcherCompatible` defaults to `true` there.

**RED → GREEN evidence** (guards temporarily stripped via a scripted diff, then restored — same
discipline as item 1):
- `sites-route.test.ts`: 14 pass / **2 fail** with the two new `switcherCompatible` checks removed
  (Create's fake `createSite` got called and 500'd; Activate proceeded to 200 and persisted) →
  **16/16 pass** restored.
- `features/sites/__tests__/tool-registrations.unit.test.ts`: 8 pass / **1 fail** with the guard
  removed (`"Missing expected rejection"`) → **9/9 pass** restored.
- `platform/site-dir/__tests__/unit/site-registry.unit.test.ts`: **18/18 pass** (added one
  characterization test for the new field; no existing assertion touched `switcherCompatible` before
  or regressed after).
- `tsc -p tsconfig.json --noEmit`: exit 0, zero output, run twice (immediately after the production
  edits, and again after the test-file updates).
- Swept the whole `apps/website/src` tree for any other reference to the removed
  `AdminSitesDeps.describeSiteBinding` override field — none found; the only remaining
  `describeSiteBinding` references are the function's own definition, its own unit tests, the two
  composition roots, and doc comments.

**Not independently verified / explicitly out of scope:** a real spawned-process (`spawnServe`) test
proving the fix end-to-end through the actual CLI boot (the file already has a directly analogous
precedent, `CR-R04/CR-R01`, for `uploadsDir`/`themesDir`) — judged not worth the added login/workspace-
discovery plumbing cost given the wiring itself is a simple, `tsc`-verified, structurally-typed
override already covered at the unit/route tier. Flagging this as the one deliberately-skipped
verification tier, not a silent gap.

---

---

## Item 3 (section C #9) — boot orchestration hand-copied three times

**Both claims confirmed, one refined further than stated.**

**Claim 1 (the false comment):** `serve.ts`'s `logCriticalBootFailures` doc claimed boot-only logic
in `index.ts`/`serve.ts` is "never imported by, or shared via import with, a tested module." Read
`index.ts`'s own header this comment cites: it says something narrower and true (`index.ts` ITSELF —
the file, because `main()` runs at import time — is never imported by a test), not the broad claim
`serve.ts` attributed to it. And the broad claim is independently false regardless: `4dfbfe80`
(`content-db-schema-guard.ts`, same day) extracted a DIFFERENT piece of this exact class of logic
into a shared, imported, unit-tested module, and both files already share several others
(`registerPluginSdkResolver`, `runProductionReadinessGateOrExit`, `buildBootModules`,
`installUnhandledRejectionGuard`) — `agentDaemonWanted`/`logCriticalBootFailures` were the
exception, not backed by any real constraint.

**Refinement, found by tracing further:** `agentDaemonWanted`'s own decision logic
(`isAdminAssistantEnabled() || externalMcpConfigured`) was ALREADY factored into a pure, exported,
unit-tested function — `admin-assistant-enabled.ts`'s `shouldStartAgentDaemon` — with **zero real
call sites anywhere** (verified: it appears only in its own definition file and its own test).
This is the repo's own named dominant defect ("a correct primitive with an unwired call site"),
here duplicated in two places instead of one: both copies of `agentDaemonWanted` hand-rolled the
identical boolean instead of calling the primitive that already existed for it.

**Fix:** extracted both into shared modules, and wired the previously-dead primitive:
- `server/runtime/boot/agent-daemon-wanted.ts` (new file) — the async wrapper (repo fetch + decline
  logging) now delegates the actual decision to `shouldStartAgentDaemon()` instead of re-deriving it.
  Preserves the original's short-circuit (skip the async fetch entirely when the admin assistant is
  already on) so this is not a behavior change beyond "one fewer duplicate."
- `server/runtime/boot/bootstrap.ts` — `logCriticalBootFailures` added here (natural home: already
  the shared, imported boot-module composition both files use).
- `index.ts` and `cli/commands/serve.ts` — both now import these two instead of defining local
  copies; removed now-dead `isAdminAssistantEnabled`/`BootResult` imports each file no longer needs
  directly. The false comment is gone (replaced with a doc pointing at the real shared modules).

**Not touched, disclosed rather than silently skipped:** the 8-promise `Promise.all([...])` readiness
list is still duplicated between the two files. Left alone deliberately — it is embedded in each
file's own `app.listen()` closure over locally-scoped variables (`target` vs `siteDir()`), the
dispatch's own priority ordering said the export gap "matters more than the deduplication," and a
literal array of 8 field names is a much lower silent-drift risk than hand-rolled boolean logic. Not
addressed; flagged here rather than left unmentioned.

**Claim 2 (the real consequence — `export.ts`'s gap) confirmed and fixed.** `cli/commands/export.ts`
built the same `createSqliteRouteDeps()` composition root `serve.ts` does, and `exportSite()`'s own
internal listener boots the real `createApp()`-equivalent to crawl it — but never called
`runBootLifecycle`/`buildBootModules` at all, so `database-migration-reconciliation`
(`reconcile-interrupted-migration.ts`) never ran before an export. A site left mid-migration by a
crash could be exported from possibly-inconsistent data with **zero warning**.

**Scoping decision:** did NOT wire the full `buildBootModules()` bundle into `export.ts` (unlike
`serve.ts`). That bundle also seeds bundled agent plugins and other optional modules with no
relationship to exporting — adopting it wholesale would have been a real, unannounced behavior
change for a command whose only job is producing static files. Instead, called
`reconcileInterruptedMigrationOnBoot` directly — the one CRITICAL module the dispatch actually named
— and refuse outright (new `ExportBlockedPendingRecoveryError`, exit code 7) rather than letting the
crawl surface the same problem indirectly as confusing per-route failures.

**Behavior change (explicit):** `tovu export` now refuses (exit 7, `EXPORT_BLOCKED_PENDING_RECOVERY`)
against a site with a crash-interrupted migration, writing nothing at all, where it previously
exported anyway with no warning. A healthy site's export is unaffected (verified by test).

**RED → GREEN evidence:**
- New file `apps/website/src/cli/__tests__/integration/export-command-migration-recovery.integration.test.ts`
  — plants a real non-terminal `migration_runs` row in the sidecar `ops/database-journal.db` (via the
  actual shipped schema/opener, not hand-rolled SQL) for a freshly-`tovu init`'d site, then runs
  `tovu export`.
  - RED (reconciliation check temporarily stripped from `export.ts`): the blocked-export test failed
    with `0 !== 7` — **the export completed successfully and wrote a full output tree despite the
    interrupted migration**, exactly the gap being fixed. (The paired "healthy site" test passed
    throughout, confirming it isn't sensitive to the revert.)
  - GREEN (fix restored): both tests pass — blocked export exits 7 with the exact
    `EXPORT_BLOCKED_PENDING_RECOVERY` stderr line and creates no output directory at all; healthy
    export is unaffected.
- `tsc -p tsconfig.json --noEmit`: exit 0, zero output, after all of item 3's changes.
- Regression check in progress at time of writing: the existing
  `export-command.integration.test.ts` (4 tests covering the normal export paths) — result to follow.

Committed as: TBD.
