# Gemini 3.8 Flash Adversarial Audit — apps/admin, apps/site-chat, packages, development, .github, root config

Scope: commits committed 2026-09-03 and 2026-09-04 touching `apps/admin/**`, `apps/site-chat/**`, `packages/**`,
`development/**`, `.github/**`, and root config (`eslint.config.mjs`, `package.json`, `fly.toml`, `tsconfig*`).

Range audited: `ec4fb6e8` (parent of earliest in-scope commit) .. `HEAD` on `restructure/apps-website-phased`,
filtered to the paths above. 65 commits, 162 files, ~10,995 insertions / ~1,698 deletions in this slice.

Method: diffs/full files fed to `agy --model gemini-3.8-flash-high --effort high` in print mode (no tool access
given to Gemini — all context supplied in-prompt). Every finding Gemini raised was then checked against the actual
source at the actual line before being recorded here. No tests, coverage, or typecheck were run for this audit
(machine was in use by five other agents); findings that would require a test run to confirm are marked UNVERIFIED.

STATUS: IN PROGRESS — this skeleton is committed first; sections below are appended as each chunk completes.

## Summary

- Chunks audited: 0 / (planned ~10-14)
- Findings raised by Gemini: TBD
- Confirmed: TBD
- Discarded (disproved on verification): TBD
- Unverified (plausible, needs a test run not permitted in this session): TBD

## Coverage map (chunks planned)

- [ ] Security/gate-integrity: backfill scripts (password reset, AAD family, custom-credential-usernames)
- [ ] CI/gate scripts: check-governance-adr-scope-drift.ts, check-menu-href-allowlist-sync.ts, check-coverage-integrity.ts,
      check-admin-complexity-drift.ts, dead-path-sweep.ts, route-coverage-lib.ts, check-route-coverage-diff.ts
- [ ] .github/workflows/ci.yml, fly-deploy.yml, root config (eslint.config.mjs, package.json, fly.toml)
- [ ] Complexity/architecture baselines (src-complexity-debt.json, admin-complexity-debt.json, check-architecture.baseline.json)
- [ ] apps/admin/src/lib: api.ts, assistant-transport.ts, resolve-active-tab-id.ts
- [ ] apps/admin new Sites feature (Sites.tsx, use-sites.hooks.ts, rules.ts, sites-dependencies/sites-port hooks)
- [ ] apps/admin App.tsx / App.hooks.tsx, AssistantDock, SlowRunNoticeCard
- [ ] apps/admin Media.tsx, Collections.tsx, MenuEditor.tsx
- [ ] apps/admin Settings/ExternalMcpSettingsPanel, Security/AccessTokensTab + hooks
- [ ] apps/admin hooks-extraction refactor commits (no-logic-in-tsx rule compliance) — Pages, Posts, ThemeExplore, AiAssistant, etc.
- [ ] apps/admin vite.config.ts, dev.mjs
- [ ] Test-quality spot checks on the largest new test files
- [ ] packages/sdk/package.json, apps/site-chat changes

## Findings

### Chunk: backfill-*.ts recovery/migration scripts (development/scripts/)

Files: `backfill-reset-admin-password.ts` (new), `backfill-custom-credential-usernames.ts`, and the six
AAD-family scripts (`backfill-{composio-config,connector-credential,execution-credential,external-mcp,
media-provider-credential,site-assistant-credential}-aad.ts`).

**1. [CRITICAL] `development/scripts/backfill-reset-admin-password.ts:89`** — `const db = openContentDb(args.dbPath);`
is called unconditionally, BEFORE the `!args.apply` branch. `openContentDb` (`apps/website/src/platform/db/sqlite/content-db.ts:73-89`)
unconditionally runs `migrate()` (schema write) and `ensureWatermarkRow()` (an `INSERT`), and `new Database(filePath)`
creates the file if it doesn't exist. So every **dry run** of this script — the thing an operator runs first against
a live production `content.db` during an incident, per this script's own stated purpose — applies pending schema
migrations and writes a watermark row, and silently creates a brand-new empty db file if the path is wrong. This
directly contradicts the file's own header: *"A dry run resolves the target user and reports whether it exists — it
never touches the hasher, never captures a restore point, never writes."* Every one of the six sibling AAD backfill
scripts touched in this same window correctly switched their dry-run path to the new `openContentDbReadOnly`
(`content-db.ts:110-114`, `readonly: true, fileMustExist: true`) — this new script did not adopt that fix.
CONFIRMED (read `content-db.ts` to confirm `openContentDb`'s unconditional migrate/write behavior, and the new
file's `main()` to confirm the unconditional call precedes the apply check).

**2. [HIGH] Same file** — `resolveExistingDbPath` (used by every AAD sibling script to fail loudly on a missing
db path) is never called here. Combined with #1: a mistyped `--db` path doesn't error, it creates a new empty
content.db, migrates it, and then reports "User 'admin' was not found" — masking a path typo as a missing-user
condition. CONFIRMED (grep shows no `resolveExistingDbPath` import/call in this file, unlike every AAD sibling).

**3. [MEDIUM] `backfill-custom-credential-usernames.ts`** also never calls `resolveExistingDbPath` — same gap as
#2, on an existing (not new) script. CONFIRMED.

**4. [MEDIUM] `backfill-reset-admin-password.ts:74` `parseArgs`** — `argv.indexOf("--db")` requires an exact-string
match, inconsistent with the `--username=`/`--password=` syntax the SAME script supports. `--db=<path>` (a natural
mistake given the sibling flags) silently falls back to the default `infra/content.db` instead of erroring — for a
password-reset recovery script this means silently targeting the wrong database. CONFIRMED by reading `parseArgs`.
Two related, lower-impact sub-cases in the same function, both CONFIRMED but downgraded from Gemini's original
framing: a trailing bare `--db` (no value) makes `path.resolve(undefined)` throw — but this is caught by the
top-level `main().catch()`, so it exits 1 with an ugly raw `TypeError` rather than crashing uncontrolled; and
`--db --apply` (path omitted) resolves `dbPath` to a literal file named `--apply` in cwd while `argv.includes("--apply")`
*also* independently sees `apply: true` — a real footgun, but it surfaces as a junk file + "user not found," not a
silent wrong-target write.

**5. [MEDIUM] `backfill-custom-credential-usernames.ts` dry-run vs `--apply` disagree on counts** — dry run
(`runCustomCredentialUsernameBackfill` with `opts.apply === false`, line ~193) counts every `username IS NULL` row
as `migrated` ("would be migrated") without decrypting, while `--apply`'s gate (`countPending`) decrypts and excludes
token-only rows (which have no `username` to backfill by design). A database containing only token-only credentials
reports "N would be migrated" on dry run, then "Nothing to migrate" on `--apply` — a misleading preview, though the
actual `--apply` behavior is correct/safe. CONFIRMED by reading both code paths.

**6. [LOW] Same file, `main()`, `pending === 0 && unreadable.length > 0` branch** — the logged "total" is
`unreadable.length`, silently excluding every row that was scanned but had no username (only unreadable rows are
counted). E.g. 19 token-only rows + 1 unreadable row logs "0 migrated, 1 failed, 1 total," implying only 1 row
existed. Cosmetic only — exit code and actual state are unaffected. CONFIRMED by reading `main()`.

**7. [LOW] `backfill-reset-admin-password.ts`** — `--password="   "` (whitespace) is truthy, bypasses the
`!args.password` guard, and is hashed/written as the literal new password with no trim/validation. CONFIRMED.

**Discarded (disproved on verification):**
- Gemini claimed self-verification failure in `backfill-reset-admin-password.ts` leaves the DB "unreverted"
  because `main()` never rolls back. **False** — `resetAdminPasswordSelfVerified`
  (`apps/website/src/features/identity/reset-admin-password-self-verified.ts:108,131`, read to verify since it's
  load-bearing for a script in-scope even though the file itself is owned by another auditor's slice) captures the
  restore point BEFORE the password write and itself calls `dbOps.restoreFromArtifact` on verification failure,
  before throwing. `main()` doesn't need its own rollback.
- Gemini's "WAL corruption risk on restore" — the live-connection-vs-restored-file caveat is already documented in
  that same module's header (`restartRequired: true`) as a known, accepted tradeoff, not a defect this diff introduced.
- Gemini's finding that `extractUsername` could return `null` and defeat the `!== undefined` pending check — **false**;
  the function's actual implementation only ever returns `string | undefined` (a `typeof parsed.username === "string"`
  guard falls to the `undefined` branch for a JSON `null`), so this cannot happen. Disproved by reading the function body.
- Gemini's note about `TOVU_ADMIN_RESET_PASSWORD=""` (explicit empty string) taking precedence over `--password=` via
  `??` — real precedence quirk, but the net effect is a confusing "no password provided, refusing" message, not an
  unsafe write, because the later `!args.password` check already catches the empty string. Recorded above, not
  flagged as a standalone unsafe-write bug.
- The six AAD-family scripts themselves (`backfill-{composio-config,connector-credential,execution-credential,
  external-mcp,media-provider-credential,site-assistant-credential}-aad.ts`): spot-checked, all consistently use
  `resolveExistingDbPath` + `openContentDbReadOnly` on the dry-run path. No additional findings.

Chunk tally: Gemini raised 8 numbered findings; 5 CONFIRMED as stated, 3 CONFIRMED-but-reframed/downgraded (parts of
findings 2 and 3 above), 3 fully discarded on verification (self-verification rollback claim, WAL-corruption
speculation, `extractUsername` null claim).

## Areas not covered / caveats

TBD at completion.
