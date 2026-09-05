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

### Chunk: CI gate scripts (development/scripts/check-*.ts, lib/dead-path-sweep.ts, route-coverage-lib.ts)

**8. [HIGH] `development/scripts/check-governance-adr-scope-drift.ts` (new file) can never actually run its
check outside this one local machine.** `main()` (line 252) does `if (!fs.existsSync(ADR_INDEX_PATH)) { ...
log "ok"...; return; }` before reading `ADS-memory/governance/adrs/ADR-INDEX.md`. Confirmed by reading
`.gitignore:117-124`: `ADS-memory/*` is ignored except `reports/`, `specs/`, `specs_as_built/` — `governance/`
is NOT tracked (`git ls-files ADS-memory/governance/` returns 0 files), so this file only exists on whichever
machine happens to have created it locally. On any other checkout — a fresh clone, CI, another agent's
sandbox — this gate always takes the "nothing to check" branch and exits 0, regardless of what the real
governance ADRs (GOV-ADR-001/002/003, the exact three MANDATORY ADRs this script's own header says drifted)
say. The script's own code comment (lines 245-251) frames this as an intentional mirror of the
`adr-governance` skill's own "if the file is missing, no ADRs apply" rule — so it is not a silent/undisclosed
bypass, but it does mean the entire gate is currently vacuous everywhere except this one machine. Not
presently wired into `.github/workflows/ci.yml` (grepped, no match) or `package.json`'s CI-invoked scripts, so
it isn't causing an active false-green in CI today, but would need `ADS-memory/governance/adrs/ADR-INDEX.md`
to become tracked (or the script fed a path some other way) before it protects anyone but this developer.

**9. [MEDIUM] Same file, `parseAdrIndexTable`** — every cell is passed through `unbacktick()` EXCEPT
`status` (line 116-126: `id`/`scopeGlobsCell`/`file` are unbacktick'd, `status` and `enforcement` are not).
`findEmptyGlobs` (line 234) checks `row.status !== "ACCEPTED"` verbatim. A future ADR-INDEX row that
backtick-wraps its Status cell (plausible — the `file` and `id` columns in the real, current index ARE
backtick-wrapped, e.g. `` `GOV-ADR-001-gated-mutation-gateway-and-watermark-chokepoint.md` ``, so a contributor
following that convention could easily do the same for Status) would silently skip that row's enforcement
entirely. Not currently triggered — verified the real `ADS-memory/governance/adrs/ADR-INDEX.md` today has
plain, unbackticked Status cells — but a real, easy-to-introduce gap.

**10. [MEDIUM] Same file, `globToRegExp`/`nextGlobToken`** — a glob ending in `**/` (the file's own docstring
claims `**` is supported "with or without a trailing `/`") compiles to a regex ending in `(?:.*/)?$`, which
requires the matched STRING to end in `/`. `collectRepoFiles` only ever returns file paths (`entry.isFile()`),
which never end in `/`. So a glob written with the documented trailing-`/` form can never match any file —
contradicting the script's own claimed feature support. Not currently triggered (every glob in the real index
today ends in `**` with no trailing slash), but a real doc/behavior mismatch a future contributor following
the docstring's own advice would hit as a false CI failure.

**11. [LOW] Same file, `unbacktick` applied to the WHOLE `Scope Globs` cell, not per-glob** — if a cell
individually backtick-wraps each `;`-separated glob (e.g. `` `glob1`; `glob2` ``) rather than wrapping the
whole cell once, only the outermost backticks are stripped, leaving a stray backtick on each split token;
`globToRegExp` then requires a literal backtick in the path, which never matches, causing a false CI failure
on a validly-intended glob. Not currently triggered — the real index wraps the whole cell once, matching the
convention this code expects.

**12. [LOW] `check-governance-adr-scope-drift.ts:283` and `check-admin-complexity-drift.ts:149`** both do
`pathToFileURL(process.argv[1]).href` with no guard for `argv[1]` being undefined, unlike the third new script
in this window (`check-menu-href-allowlist-sync.ts:302`, which guards with `process.argv[1] ?? ""`). A call
context where `argv[1]` is unset would throw a raw `TypeError` at import time instead of a friendly message.
Low practical risk — both files are only ever run as real Node entry points or imported by their own unit
test, where `argv[1]` is always set in practice.

**13. [HIGH, confirmed with a live current victim — goes beyond what Gemini claimed] `development/scripts/lib/dead-path-sweep.ts:748`
(`if (meaningful.length < 2) continue;`) has a disclosed, deliberate blind spot for a SINGLE trailing literal
segment in a `path.join`/`path.resolve` call** (e.g. `path.join(REPO_ROOT, "src")`) — confirmed by the script's
own test file, `development/scripts/__tests__/dead-path-sweep.test.ts:436-444`, which states outright: *"This
IS a real gap this task's fix did not close... a sweep re-run today would NOT have caught the pre-fix
single-segment shape."* That specific historical instance (`check-outbox-bridge.ts`'s old `SRC_DIR`) is
already fixed and was verified by other means, so the disclosed gap itself is not a new finding. However,
independently grepping the current tree for the same call shape turned up a LIVE, PRESENT-DAY, currently
unfixed victim of exactly this blind spot: **`development/scripts/rewrite-deep-imports.ts:50`** —
`const SRC_ROOT = path.join(REPO_ROOT, "src");` — `src/` at repo root no longer exists (moved to
`apps/website/src/` in the 2026-09 restructure), so this is a genuinely dead reference in a real, checked-in
script, sitting undetected next to the very sweep that exists to catch this exact class of bug. Confirmed this
script isn't wired into `package.json`/CI (grepped, no reference), so the practical blast radius is "a stale,
currently-broken manual codemod tool," not a live production or CI risk — rated High rather than Critical for
that reason, and because the blind spot itself is disclosed rather than silent.

**14. [MEDIUM, plausible, not confirmed as currently live] Same file, `extractPathJoinSegments` (lines
363-369)** — only ever captures a TRAILING run of literal arguments, scanning backward from the last
argument; if the LAST argument to `path.join`/`path.resolve` is a variable (e.g.
`path.join(REPO_ROOT, "src", "server", fileName)` — a plausible, common shape for building a full file path
from a literal directory prefix plus a dynamic filename), zero trailing literals are captured and the entire
call — literal "src"/"server" segments included — is skipped. This is architecturally consistent with the
file's own documented "only the trailing run" design choice, so it isn't a bug relative to that design, but it
does mean a `path.join(BASE, ...literalDirs, dynamicFilename)` call is invisible to class 3 even though its
literal directory segments are exactly the restructure-sensitive content this sweep exists to catch. Did not
find a live current instance of this exact shape in the time available — flagging as a real, plausible gap in
the mechanism, not a confirmed live miss.

**15. [MEDIUM, plausible, not confirmed as currently live] Same file, `dropLeadingParentSegments` +
`sweepOneFile`'s class-3 handling** — leading `".."` segments are unconditionally dropped and the remainder is
checked against `repoRoot` directly, which is only correct when the number of dropped `".."` segments exactly
equals the importing file's real nesting depth below repo root. The sweep's own target set
(`collectSweepTargets`) includes files at different depths (`development/scripts/*.ts`,
`development/scripts/lib/*.ts`, `apps/website/src/platform/db/*.config.ts`), so a multi-`".."`
`path.resolve(import.meta.dirname, "..", ..., "literalSeg")` call from a file whose depth doesn't match the
`".."` count could resolve to the wrong real target while still being checked against `repoRoot` — a
theoretical false-positive/false-negative source. Consistent with the mechanism's own documented "only the
literal segments are restructure-sensitive, the base doesn't matter" simplification, so this is an inherited
imprecision of the design rather than a coding slip; did not find (or have budget to search for) a live
instance where this produces a wrong verdict today.

**Discarded (disproved on verification):**
- Gemini's claim that `not-a-known-repo-segment` rejects `"src/server"` because `"src"` no longer exists at
  repo root — **false**. `collectRepoSegments` (`dead-path-sweep.ts:595-614`) recursively walks the tree to
  `maxDepth=4` collecting every directory's OWN BASENAME, not just repo-root children — confirmed `apps/website/src`
  exists (`ls -d apps/website/src`) at depth 3, well within the walk, so `"src"` IS a known segment via that
  path even though it's no longer a top-level one. The script's own doc comment (lines 469-476) explicitly
  describes this exact mechanism as the deliberate fix for exactly the scenario Gemini described.
- Gemini's claim that `route-coverage-lib.ts`'s `isMeasurableRouteFile` fails to exclude `types.ts` — **false**;
  line 113 explicitly excludes `base === "types.ts"` (along with `deps.ts`/`execution-deps.ts`). Gemini appears
  to have only seen a truncated slice of the function in its diff context and missed the very next lines.
- Gemini's "no defects identified" verdicts on `check-architecture.ts`, `check-capability-inventory.ts`,
  `check-embed-marker-drift.ts`, `check-outbox-bridge.ts`, `lib/tovu-test-server.ts` — spot-checked as
  comment-only/path-repoint-only diffs, consistent with Gemini's assessment; not independently re-derived line
  by line given time budget.
- `check-coverage-integrity.ts`, `check-menu-href-allowlist-sync.ts` — Gemini reported no defects. Not
  independently re-audited beyond a structural read, given the size of this chunk and time budget; flagged
  below as an area of lighter coverage.

Chunk tally: 2a raised 8 numbered findings (4 CONFIRMED as reframed above at findings 8-12, one factually
disproven); 2b raised 5 numbered findings (1 confirmed-and-substantially-extended with a live victim [finding
13], 2 confirmed-as-plausible-but-unverified-live [14-15], 1 factually disproven [types.ts], and 1 [the
`route-coverage-lib.ts` claim reused for the same file] folded into the disproven types.ts item).

### Chunk: CI workflow + root config (.github/workflows/ci.yml, fly-deploy.yml, eslint.config.mjs, package.json, fly.toml, packages/sdk + apps/admin + apps/site-chat package.json)

Gemini raised 3 numbered findings for this chunk. **All three were disproven or substantially reframed on
verification** — this chunk has the highest discard rate of the audit so far, worth flagging as a signal about
this particular kind of claim (cross-file "is X wired to Y" claims Gemini can't fully check without seeing
every referenced file).

**Discarded (disproved on verification):**
- **Gemini claimed `check:seal-aad` and `check:default-credential` (referenced by new blocking CI gate steps
  at `ci.yml:263,273`) don't exist in `package.json`, so every CI run would fail once unblocked.** **False** —
  both scripts exist: `package.json:50` (`"check:seal-aad": "tsx apps/website/src/features/webhooks/seal-aad-invariant.ts"`)
  and `package.json:83` (`"check:default-credential": "tsx apps/website/src/features/identity/default-credential-exposure.ts"`).
  Gemini's diff view apparently didn't include these pre-existing, untouched lines of `package.json` (they
  weren't part of this window's diff hunks) and it inferred absence from that gap rather than from the real
  file. This would have been the single most severe finding in the whole audit if true (every commit failing
  CI) — glad to have caught it disproven.
- **Gemini claimed `fly.toml` still targets app `tovu-ai-cms` while `fly-deploy.yml`'s comments/instructions
  reference `-a tovu`, a mismatch that would crash production on deploy.** **False** — `fly.toml:48` reads
  `app = "tovu"`, matching `fly-deploy.yml`'s references exactly. `fly.toml:41`'s comment mentioning
  `tovu-ai-cms` is leftover text describing the OLD (already-corrected) value; the file's own top-of-file
  header block (`fly.toml:1-20`, dated "Verified 2026-09-02") explicitly documents that `tovu-ai-cms` "resolves
  to nothing" and was corrected to `tovu`. That correction predates this audit's window (2026-09-03/04) — it
  isn't something this window's commits touched at all, so even the stale-comment nit isn't attributable to
  this audit's scope.
- **Gemini claimed `apps/site-chat/package.json`'s `@jini-ai/*` versions were left behind while root/admin
  were bumped in this window, causing npm-workspace dual-instantiation.** Partially real, but misframed and
  out of this audit's date window. Reframed finding: `apps/site-chat` is NOT an npm workspace member at all
  (root `package.json:8-10` declares `"workspaces": ["packages/*"]` only — `apps/*` isn't included), so it has
  its own independent `package-lock.json`, and there IS a real, confirmed drift there: `apps/site-chat/package.json`
  declares `@jini-ai/chat`/`@jini-ai/ui` at `^0.3.3`, but `apps/site-chat/package-lock.json` still resolves
  both to `0.3.2` (its root entry's own recorded requirement is `^0.3.2`) — a lockfile that would fail `npm ci`
  against its own package.json. However, `git log` shows the `^0.3.3` bump landed 2026-09-02 (`70a8b4e8`) and
  the lockfile was last committed 2026-09-02 (`9bde885d`) — BOTH before this audit's 2026-09-03/04 window. The
  only commit touching `apps/site-chat/package.json` in-window (`beae0086`, 2026-09-04) added only the
  `"license": "Apache-2.0"` field, confirmed by reading its diff. **Not counted as an in-window finding** since
  it predates the audited range, but flagged here as a real, pre-existing, still-live integrity issue the
  owner may want to know about regardless.

**No defects identified, spot-checked and consistent:**
- `eslint.config.mjs` — confirmed it reads `admin-complexity-debt.json`'s new per-violation schema correctly
  (`.violations.map((entry) => entry.file)` at line 24), matching `check-admin-complexity-drift.ts`'s header
  claim about the schema change.
- `packages/sdk/package.json` — license-only addition, no logic.

Chunk tally: 3 findings raised, 0 confirmed as originally stated, 2 fully disproven, 1 reframed into a real
but out-of-window observation.

## Areas not covered / caveats

TBD at completion.
