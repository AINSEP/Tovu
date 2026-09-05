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

STATUS: audit stopped here by owner-agreed scope — 7 of the ~13 planned chunks completed, covering the
highest-risk areas of this slice (security-adjacent code, CI/gate integrity, and the largest new feature).
Not a claim that the remaining areas are clean — see "Areas not covered" below.

- Chunks audited: 7 (backfill/recovery scripts; CI gate scripts x2; CI workflow + root config; admin/src/lib;
  new Sites feature; Security+Settings screens; App.tsx/AssistantDock incl. the MCP-UI security fix)
- Gemini findings raised across all 7 chunks: ~53
- Confirmed real (37 numbered findings kept in this report, several with severity downgraded or reframed
  after verification — see each chunk's notes)
- Discarded as factually wrong on verification: ~10 (see each chunk's "Discarded" list for the specific
  disproof — the most consequential: a claimed "every CI run will fail" finding that turned out to reference
  npm scripts which do in fact exist)
- Reframed as real-but-predating-this-audit's-window (2026-09-03/04): ~4 (a site-chat dependency-lockfile
  drift, a stale fly.toml comment, a pre-existing `omitIfBlank` trim gap, a pre-existing `onTrustChange`
  no-op stub)
- Left genuinely unresolved (could not confirm or discard without a real browser): 2 (both about whether the
  MCP-UI same-origin security fix can be bypassed — see the App.tsx/AssistantDock chunk for the full
  reasoning chain and an explicit recommendation to smoke-test manually)

**Top findings by severity** (full detail and file:line in each chunk section below):
1. **CRITICAL, live and reachable today** — `apps/admin/src/lib/api.ts:1801-1806` `buildFetchInit`'s
   object-spread order silently drops `Content-Type: application/json` whenever a caller passes custom
   headers; confirmed this breaks the admin UI's "save Dockerfile" action today (finding 16). Predates this
   audit's window (relocated, not introduced, by the 2026-09-04 refactor) but is real and current.
2. **HIGH** — `check-governance-adr-scope-drift.ts`'s target file is untracked by git, so the gate is
   vacuous everywhere except the machine that happens to have it locally (finding 8).
3. **HIGH** — `dead-path-sweep.ts`'s disclosed single-segment blind spot has a live, currently-undetected
   victim: `development/scripts/rewrite-deep-imports.ts:50` references a `src/` directory that no longer
   exists (finding 13).
4. **HIGH** — the Sites screen's `siteRowState` contradicts its own sibling `activationOutlook` under a
   `TOVU_SITE_DIR` override, telling the operator a choice is "queued" when a banner on the same screen
   correctly says it will be ignored (finding 19).
5. **HIGH** — `use-access-tokens.hooks.ts`'s `reloadAllStores` cluster: a stale query error permanently masks
   a later successful reload (finding 26), a `Promise.all` short-circuit discards successful stores' fresh
   data when a sibling store's fetch fails (finding 27), an unguarded race lets an older reload's response
   overwrite a newer one (finding 28), and an unmemoized `t` defeats the surrounding `useCallback`, causing
   the exact SSE-resubscribe churn the code's own comment warns against (finding 29).
6. **HIGH** — `SlowRunNoticeCard` ignores the `runStreaming`/`runSucceeded` props it's given, so a "still
   working" notice persists forever after a run completes (finding 34).

## Coverage map (chunks planned)

- [x] Security/gate-integrity: backfill scripts (password reset, AAD family, custom-credential-usernames)
- [x] CI/gate scripts: check-governance-adr-scope-drift.ts, check-menu-href-allowlist-sync.ts, check-coverage-integrity.ts,
      check-admin-complexity-drift.ts, dead-path-sweep.ts, route-coverage-lib.ts, check-route-coverage-diff.ts
- [x] .github/workflows/ci.yml, fly-deploy.yml, root config (eslint.config.mjs, package.json, fly.toml)
- [x] apps/admin/src/lib: api.ts, assistant-transport.ts, resolve-active-tab-id.ts
- [x] apps/admin new Sites feature (Sites.tsx, use-sites.hooks.ts, rules.ts, sites-dependencies/sites-port hooks)
- [x] apps/admin App.tsx / App.hooks.tsx, AssistantDock, SlowRunNoticeCard (incl. the MCP-UI security fix)
- [x] apps/admin Settings/ExternalMcpSettingsPanel, Security/AccessTokensTab + hooks
- [x] packages/sdk/package.json, apps/site-chat changes (both license-only in-window; a real but
      out-of-window site-chat lockfile drift noted separately)
- [ ] **NOT COVERED** — apps/admin Media.tsx, Collections.tsx, MenuEditor.tsx (large diffs: 363/268/114 lines)
- [ ] **NOT COVERED** — Complexity/architecture baselines (src-complexity-debt.json, admin-complexity-debt.json,
      check-architecture.baseline.json) — lower expected yield (data files), but not verified
- [ ] **NOT COVERED** — apps/admin hooks-extraction refactor commits as a batch (no-logic-in-tsx rule
      compliance) — Pages, Posts, ThemeExplore, AiAssistant, ThemePageDetailsModal, and others; spot-checked
      individually only where they intersected an already-audited file (e.g. Themes.tsx, App.tsx)
- [ ] **NOT COVERED** — apps/admin vite.config.ts, development/scripts/dev.mjs (dev-server TLS plumbing)
- [ ] **NOT COVERED** — dedicated test-quality spot check on the largest new/changed test files (e.g.
      `AccessTokensTab.credential-flows.unit.test.tsx` (619 new lines), `use-access-tokens.unit.test.tsx`
      (803 changed lines), `api-endpoint-option-branches.unit.test.ts` (695 new lines),
      `dead-path-sweep.test.ts` (315 changed), `check-governance-adr-scope-drift.test.ts` (212 new),
      `backfill-custom-credential-usernames.test.ts` (234 changed)) — none of these were read for
      "asserts nothing meaningful" / mock-hides-the-real-code patterns
- [ ] **NOT COVERED** — apps/admin/src/features/menus/MenuEditor.tsx's own unit test changes (69 lines),
      apps/admin/src/features/pages/** hooks-extraction diffs beyond what Themes.tsx pulled in

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

### Chunk: apps/admin/src/lib (api.ts, assistant-transport.ts, resolve-active-tab-id.ts, site-url.ts)

**16. [CRITICAL, live and currently reachable, but PRE-EXISTING — not introduced 2026-09-03/04] `apps/admin/src/lib/api.ts:1801-1806`,
`buildFetchInit`** — `{ credentials: "same-origin", headers: { "Content-Type": "application/json",
...(init.headers ?? {}) }, ...init }`: because `...init` is spread AFTER `headers`, whenever a caller's
`init` itself has a `headers` key, `init.headers` completely REPLACES the merged headers object — the default
`Content-Type: application/json` is silently dropped whenever a caller passes custom headers without also
re-specifying Content-Type themselves. Confirmed this is LIVE and reachable today: `api.ts:3221-3229`'s
`setDockerfileSource` (the admin UI's "save Dockerfile" action) calls `request()` with BOTH
`headers: { "If-Match": ifMatch }` AND a JSON `body`. Confirmed the server side
(`apps/website/src/server/**` uses `express.json()`, grepped across route test setup files) parses request
bodies only when `Content-Type` matches `application/json` by default — so this PUT currently goes out
missing that header, and the server-side `express.json()` middleware would not parse the body at all,
silently receiving an empty `req.body` for a Dockerfile save. **Provenance check, since this could look like
an in-window regression:** the diff shows this exact object literal (identical spread order, identical bug)
was moved VERBATIM out of the old inline `request()` body into this new standalone `buildFetchInit()`
function by the 2026-09-04 complexity-refactor commit — it was not introduced or worsened by that refactor,
only relocated. Flagging prominently anyway since it's a real, currently-live defect in a file inside this
audit's slice, even though the bug itself predates the audited window.

**17. [MEDIUM, confirmed as a real design gap in the shared helper; not proven actively triggered today]
`apps/admin/src/lib/resolve-active-tab-id.ts:41`** — `resolveActiveTabId` returns `defaultId` unconditionally
for an absent/invalid `tabId`, with no validation that `defaultId` itself is a member of `validIds`. The
function's own doc explicitly delegates "picks its own default" to each of the five call sites, so this isn't
an oversight so much as an unenforced contract. The one call site with a genuinely DYNAMIC default
(`Themes.tsx:166`, `resolveActiveTabId(tabId, validTabIds, defaultThemeTabGroup(settings, themeTiers))`)
widens `validTabIds` to `readonly string[]` (not a literal-id union), so TypeScript provides no compile-time
guarantee there either — BUT `defaultThemeTabGroup` (`apps/admin/src/features/themes/rules.ts:122-127`)
returns the narrower literal type `ThemeTabGroup`, which today is always a member of `THEME_TAB_GROUPS`
(confirmed by reading `themeTabGroup`'s callers), so this specific call site is not currently exploitable.
Real gap for a FUTURE caller or a future change to `themeTabGroup()`'s exhaustiveness, downgraded from
Gemini's original "High" given no live trigger found.

**Discarded (disproved on verification):**
- Gemini claimed `api.ts`'s `createSite` (`request<{ site: AdminCreatedSite }>`, line 3187) mismatches the
  `AdminCreatedSite` interface's own doc comment ("The `201` body of `POST .../system/sites`"), so
  `result.site` would be `undefined` and any caller reading `.site.name` would throw. **False** — read the
  actual server route (`apps/website/src/server/inbound/admin-http/routes/system/sites.ts:153`):
  `res.status(201).json({ site: { name: result.name, dir: result.dir, siteId: result.siteId } })` — the
  server DOES wrap the response in `{ site: {...} }`, matching both `api.ts`'s type annotation and
  `use-sites.hooks.ts:126`'s `result.site.name` usage. The three are mutually consistent; only
  `AdminCreatedSite`'s own doc comment is a little imprecise (describes the shape of the `.site` field, not
  literally "the 201 body" as its wording claims) — a documentation nit, not a functional bug.

**No defects identified (accepted without independent line-by-line re-derivation given time budget):**
- `apps/admin/src/lib/assistant-transport.ts` — Gemini reports the extracted helpers
  (`frontendBindTokenField`, `modelField`, `reasoningField`, `attachmentIdsField`, `pluginRefIdsField`,
  `conversationIdField`, `resolveLocalCliPrompt`, `finishLocalCliRun`) faithfully preserve original runtime
  checks and async subscription semantics.
- `apps/admin/src/lib/site-url.ts` — trivial `http://` -> `https://` localhost fallback change, matching the
  dev-server TLS-termination work elsewhere in this window.

Chunk tally: 3 findings raised; 1 confirmed as a real, live, currently-reachable bug (though pre-existing, not
introduced in-window), 1 confirmed as a real-but-currently-dormant design gap (downgraded severity), 1 fully
disproven.

### Chunk: new Sites feature (apps/admin/src/features/sites/**)

**18. [HIGH, confirmed] `apps/admin/src/features/sites/hooks/use-sites.hooks.ts:152`
(`writeError: resolveWriteError(createMutation.error ?? activateMutation.error, t)`)** — this is a plain
TanStack-Query-backed mutation pair (`createMutation`, `activateMutation`); confirmed each mutation's own
`error` is only reset when THAT SAME mutation's `.mutate()` is called again (standard TanStack Query
behavior, `apps/admin/src/lib/fetch-query/adapter.tanstack.tsx`), never when the OTHER mutation runs. So: a
Create failure (e.g. `409 SITE_ALREADY_EXISTS`) leaves `createMutation.error` set indefinitely; any
LATER Activate action — success or a brand-new failure — is invisible to the operator, because the `??`
precedence always shows the stale Create error first, until the operator tries Create again (regardless of
how many Activate attempts happen in between). Confirmed reachable: the two actions are on the same screen
and routinely both used in one visit (create a site, then activate it).

**19. [HIGH, confirmed — a real contradiction of this file's own stated design purpose]
`apps/admin/src/features/sites/rules.ts:47-51`, `siteRowState`** — checks only `site.dir ===
snapshot.currentSite.dir` (serving) and `snapshot.persistedSiteName === site.name` (pending-restart); never
checks `snapshot.currentSite.dirOverridden`. Meanwhile `activationOutlook` (same file, lines 94-98) DOES check
`dirOverridden` and reports a distinct `"pending-ignored"` state specifically so the `NowServingCard` banner
can warn "this is saved, but TOVU_SITE_DIR overrides it, so a restart will not pick it up." Net effect:
under a `TOVU_SITE_DIR` override, the per-row table badge (`siteRowStateLabelKey` -> "Queued for next
restart") directly contradicts the banner sitting right above it, which correctly says the same restart will
NOT apply that choice. This file's own header states its entire purpose is that "this screen is capable of
telling a lie... every 'what is true right now' decision is therefore made HERE" — this is exactly that lie,
in the one code path that was supposed to prevent it.

**20. [HIGH, confirmed] `apps/admin/src/features/sites/hooks/use-sites.hooks.ts:132-143`, `activate`** — no
in-flight guard (no check against `activatingName`/`activateMutation.status`) before calling
`activateMutation.mutate(name)`. `Sites.tsx:280` does disable every row's Activate button once
`activatingName !== null`, but that's a STATE-DERIVED disabled prop, one render behind the click — two rapid
clicks on different rows (or a fast double-click) before that re-render commits can both reach `activate()`,
firing two concurrent requests for two different site names. Whichever server response settles LAST wins the
final `setActivation`/`setActivatingName(null)` calls regardless of click order, so the UI can end up showing
restart instructions and pending state for the WRONG (not most-recently-clicked) site.

**21. [HIGH, confirmed via an objective doc/code mismatch] `apps/admin/src/features/sites/hooks/use-sites.hooks.ts:68`
vs. its own implementation (lines 116-130)** — the `createSite` field's doc comment on the
`SitesController` interface explicitly promises: *"Submits the create form. A no-op while the name is invalid
or a write is already in flight."* The actual `createSite` callback (lines 116-130) checks ONLY
`siteNameErrorKey(name) !== null` — there is no check against `creating`/`createMutation.status`, so the
"already in flight" half of the documented contract is not implemented. Same underlying mechanism as finding
20 (a rapid double-submit before the disabled-button re-render commits can call `createSite()` twice), plus a
verbatim doc/code mismatch independent of timing.

**22. [MEDIUM, largely confirmed with one precedented exception] Architectural-rule violations in
`apps/admin/src/features/sites/Sites.tsx`** — the owner's standing rule is no functions/derived logic in
`.tsx`; the many small presentational subcomponents in this file (`ServingFact`, `UnlistedSiteNotice`,
`NowServingCard`, `CreateSiteForm`, `ActivateButton`, etc.) are plain components and do NOT violate this rule
by existing. But several inline, non-component derivations do:
  - `Sites.tsx:225`: `disabled={creating || !switchingEnabled || createNameError !== null || createName.trim().length === 0}`
    — a multi-condition boolean including a `.trim().length === 0` computation, inline in JSX.
  - `Sites.tsx:280,287`: the Activate button's `disabled={...}` boolean chain and its `activatingName ===
    site.name ? ... : ...` label branch, both inline.
  - `Sites.tsx:319-322`: `const rowHandles = buildAgentListHandles("sites-row", sites.map((site) =>
    site.name));` — an array derivation in the component body, not the hook.
  - `Sites.tsx:364-366`: the table's `state` column computes `siteRowState(site, snapshot)` inline inside its
    `cell` render function.
  All four are real, confirmed instances of derived logic living in the component rather than
  `use-sites.hooks.ts`/`rules.ts`. **One exception, not counted as a fresh violation**: `resolveSitesHook`
  (`Sites.tsx:303-305`, a plain non-component function picking between an injected hook override and the
  real one) is NOT unique to this file — its own comment cites `OverviewTab.tsx`'s identical
  `resolveDeploymentOverviewHook` as precedent, so this is a pre-existing, repeated codebase idiom this new
  file followed consistently, not a novel violation this PR introduced.

**23. [LOW, reframed from Gemini's "Medium" — real but not a client-side bypass] `apps/admin/src/features/sites/rules.ts:30,109-115`,
`SITE_NAME_PATTERN = /^[a-z0-9-]+$/`** — allows names that are entirely/leading/trailing hyphens (`"-"`,
`"--"`, `"-site"`, `"site-"`), which could confuse shell tooling that later takes a site name as a bare
argument. Confirmed this pattern is DELIBERATELY mirrored from the server's own new pattern (`apps/website/src/platform/site-dir/site-registry.ts:45`,
introduced in the SAME in-window commit, `115687af`, "feat(admin,site-dir): Sites screen backend") — the
client's own comment states this explicitly ("a drift here degrades to a worse error message, never to an
accepted bad name"). So this is not a client-side validation bypass; it's a real, shared, in-window gap
present identically on both sides, not something the client uniquely introduced or could unilaterally fix.
**Discarded the other half of Gemini's finding 6**: that `siteNameErrorKey` "completely skips duplicate
validation client-side, forcing an unnecessary network round-trip" is not a bug — the function's own doc
comment explicitly discloses this as intentional ("Not a substitute for the server's own validation... this
only decides whether it is worth asking").

**24. [LOW, confirmed] `apps/admin/src/features/sites/hooks/use-sites.hooks.ts:127` + `Sites.tsx:211`** — the
name `<input>` is not disabled while `creating` is true (only `disabled={!switchingEnabled}`); if an operator
starts typing a new name while a previous create is still in flight, `setCreateName("")` on that request's
completion wipes what they'd typed.

**25. [LOW, confirmed] `apps/admin/src/features/sites/hooks/use-sites.hooks.ts:119` + `Sites.tsx:230-232`** —
`createdName` (drives the green "Created. Activate it below..." message) is only cleared at the START of the
next `createSite()` call, not when `createName` changes via typing — so the success message can sit next to
an unrelated, newly-typed name until the operator submits again.

**No defects identified (accepted without independent re-derivation given time budget):** `sites-dependencies.hooks.ts`,
`sites-port.hooks.ts`, `index.ts`, `sites-i18n.ts`.

Chunk tally: 8 findings raised; 6 confirmed close to as-stated (18-21, 24-25), 1 confirmed-but-reframed (22,
one of five citations excluded as precedented), 1 confirmed-but-substantially-reframed (23, real gap but not
a "client bypass," and half the original claim disproven as intentional).

### Chunk: Security (AccessTokensTab/rules/hooks) + Settings (ExternalMcpSettingsPanel/ComposioKeyField/rules/hooks)

**26. [HIGH, confirmed] `apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts:391`
(`accessTokensLoadError(...) ?? reloadError`)** — `reloadAllStores` (lines 372-382) intentionally bypasses
`useFetchQuery`'s cache (per its own doc comment) to re-read all three stores directly, so a successful
background reload never clears the ORIGINAL `publishQuery.error`/`sourceControlQuery.error`/`customQuery.error`
that `accessTokensLoadError(...)` reads. Once any of the three initial queries fails once, `loadError` is
permanently pinned to that stale error — a later successful `reloadAllStores()` call resets `reloadError` to
`null`, but the `??` never reaches it, because `accessTokensLoadError(...)` is still non-null. The whole
screen stays stuck on the initial-load error view even after fresh data has actually loaded, with no recovery
short of a full browser refresh.

**27. [HIGH, confirmed] Same file, `reloadAllStores` (lines 372-382), `Promise.all` short-circuit** — if
ANY of the three `port.*.list()` calls rejects, NONE of the three `setXCredentials` calls run (the whole
`Promise.all` rejects together), even for the stores that succeeded. Concretely: revoke a custom token ->
server succeeds -> `reloadAllStores()` fires -> if `port.publish.list()` alone has a transient failure, the
freshly-fetched `custom.list()` result (which would have reflected the revocation) is discarded, and the
revoked token keeps showing as active in the table.

**28. [HIGH, confirmed as a real, unguarded design gap] Same file, `reloadAllStores`** — no
request-ordering guard (no `AbortController`, generation counter, or timestamp check) around the three
`setXCredentials` calls. Two overlapping `reloadAllStores()` invocations (e.g. two SSE-triggered reloads
close together, or an SSE reload racing a user-triggered one) can resolve out of order; whichever settles
LAST wins the state update regardless of which was triggered last, so a stale snapshot can overwrite a
newer one (e.g. a just-revoked token reappearing).

**29. [HIGH, confirmed via a precise causal chain] Same file — dependency array on `reloadAllStores`
changed from `[port]` to `[port, locale, t]` (confirmed in the diff), and `t` has NO stable identity**:
`useWiredAccessTokens` (line 692) builds `t` as `const boundT = (key: string): string => defaultT(locale,
key);` — a plain arrow function recreated fresh on every render, not wrapped in `useCallback`/`useMemo`.
Because `reloadAllStores`'s own `useCallback` now depends on this unstable `t`, `reloadAllStores` itself gets
a new identity every render, which cascades to `triggerReload = useCallback(..., [reloadAllStores])` also
changing identity every render, which feeds `useContentRefreshSubscription(ACCESS_TOKENS_RESOURCE,
triggerReload)` a new callback every render. This is the EXACT failure mode the same file's own comment (a few
lines above, describing the `invalidateList`/`triggerReload` pattern) explicitly warns against: "an inline
arrow here would resubscribe `useContentRefreshSubscription` on every render for no benefit." If that
subscription hook tears down/reconnects on every identity change (consistent with its documented purpose
elsewhere in this codebase), this reintroduces exactly the churn the pattern was built to avoid, and could
drop background push notifications during the reconnect windows.

**30. [MEDIUM, confirmed but narrow] `apps/admin/src/features/settings/hooks/use-composio-key-field.hooks.ts:56-61`,
`ComposioKeyField.tsx`** — `onSave()` has no internal in-flight guard; the Save button/input are disabled via
`disabled={busy}`, a state-derived prop that lags one render behind a click. A rapid double-click (or
Enter-then-click) before that re-render commits can dispatch two concurrent `composio.save()` calls. Same
class of race as Sites' create/activate findings (18/20/21 above).

**31. [MEDIUM, confirmed as a real gap, PRE-EXISTING — not introduced by this window's refactor]
`apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts`, `omitIfBlank` (new helper, lines
118-125) and its callers in `toOAuthWriteBody`/`toWriteBody`** — checks `value.trim() === ""` to decide
whether to omit a key, but assigns the ORIGINAL, untrimmed `value` when not blank — so a copy-pasted OAuth
endpoint or `clientSecret` with stray leading/trailing whitespace passes the blank check but is saved with
the whitespace intact. **Provenance check**: read the diff's removed lines for every affected field
(`clientSecret`, `tokenEndpoint`, `authorizationEndpoint`, `providerId`, `deviceAuthorizationEndpoint`,
`env`) — every single one had the IDENTICAL "trim-to-check, assign-untrimmed" pattern in the OLD inline
ternary code (e.g. `...(env.trim() === "" ? {} : { env })` where `env` itself was never trimmed). This is a
byte-for-byte preserved, pre-existing behavior — `omitIfBlank`'s own doc comment explicitly and correctly
discloses this ("the omit-when-blank convention must stay byte-for-byte the same"). Flagging it anyway since
it's a real, live gap in a file this window touched heavily, but it is not a new regression from the
extraction itself.

**32. [MEDIUM, confirmed] `apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx:228`
(`const cardHandles = buildExternalMcpCardHandles(list.sources.map((source) => source.id));`)** — an array
transformation computed directly in the component body rather than in a hook — same class of violation as
the Sites chunk's `rowHandles` finding (22 above), and not covered by the same "precedented DI-resolver"
exception that applies to `resolveXHook`-style functions.

**Discarded (disproved on verification):**
- Gemini claimed `use-composio-key-field.hooks.ts:55-60`'s `onSave` retains a plaintext secret indefinitely if
  `composio.save` rejects, since there's no `try/finally` around `setDraft("")`. **False** — the hook's own
  doc comment states `composio.save` (`useComposioConfig`'s `write`) "catches internally and never rejects,"
  and reading the actual implementation (`use-composio-config.hooks.ts:78-92`) confirms this: `write` wraps
  `port.saveComposioConfig` in its own `try/catch` and never rethrows, so `await composio.save(apiKey)` in
  `onSave` always completes and `setDraft("")` always runs, error or not. The doc comment also (correctly and
  honestly) discloses this guarantee is fragile — contingent on the real dependency never rejecting — and that
  this exact characteristic is "pre-existing behavior, carried over unchanged from the pre-extraction
  component," so even the disclosed fragility isn't new to this window.
- Gemini's claim that `ExternalMcpSettingsPanel.tsx`'s hardcoded `onTrustChange={() => {}}` "silently
  discards server trust updates" as a defect of THIS window's work — the diff shows this exact no-op
  (`onTrustChange={() => {}}`) was present on BOTH sides of the diff (removed and re-added verbatim during a
  JSX restructuring), so it is a pre-existing stub, not something this window introduced or changed. Real
  functional gap (if the "trust" toggle is reachable in the UI, it does nothing), but out of this audit's
  in-window scope; not tallied as a chunk finding.
- Gemini's architecture-rule finding on `Security.tsx:66-68`'s `resolveSecurityTabId` — this is the exact
  same pattern as `Themes.tsx`'s `resolveThemesActiveTabId` (verified in an earlier chunk) and is explicitly
  documented as shared with `Deployment.tsx`/`SourceControl.tsx`/`Database.tsx`/`Themes.tsx` — a
  repo-wide, precedented convention, not a violation unique to or introduced by this window's work on this
  file.

**No defects identified (accepted without independent re-derivation given time budget):** `AccessTokensTab.tsx`,
`security/rules.ts`, `ComposioKeyField.tsx` (beyond the `onSave` race already covered above),
`settings/rules.ts`, `SettingsUi.tsx`.

Chunk tally: 10 findings raised; 6 confirmed close to as-stated (26-30, 32 — note 31 confirmed-real-but-pre-existing),
1 confirmed-but-reframed-as-pre-existing (31), 3 discarded/reframed as pre-existing or precedented (the
composio plaintext-retention claim disproven outright; the onTrustChange and Security.tsx tab-resolver claims
reframed as pre-existing/precedented, not in-window findings).

### Chunk: App.tsx/App.hooks.tsx + AssistantDock (including the MCP-UI same-origin security fix)

This chunk includes a genuine security fix (`d3834ec2`, "stop granting MCP-UI surfaces this admin origin's
authority") — switching the MCP-UI sandbox-proxy iframe from a same-origin HTTP route to an opaque `data:`
URL, since `@mcp-ui/client`'s `AppFrame` hardcodes `allow-same-origin` with no way to turn it off. I read the
actual `@jini-ai/ui` source this diff depends on (`node_modules/@jini-ai/ui/src/features/mcp-ui/sandbox-proxy.ts`,
resolved via the local sibling-Jini symlink) to verify Gemini's security claims against the real
implementation, not just the diff.

**Gemini raised two "Critical"/"High" claims that the fix can be bypassed — both do not hold up under technical
analysis, with one caveat (see below):**

- **Gemini's Finding 1 (self-navigation bypass)**: claimed the guest, running inside the opaque `data:` frame
  (which has `allow-scripts allow-same-origin`), can call `window.location.replace(hostOrigin +
  "/mcp-ui/sandbox-proxy.html")` to load the OLD same-origin route into the same sandboxed iframe, which
  (per `allow-same-origin`) would then get the ADMIN's real origin, "completely defeating the opaque data: URL
  isolation." **Reasoned through this and believe it does not work as described**: navigating a browsing
  context to a new document destroys the PREVIOUS document's running script entirely — the attacker's own
  malicious code (running inside the `data:` document) cannot survive its own navigation call to keep
  executing with the new document's authority. After the self-navigation, the iframe would be running the
  ADMIN SERVER'S OWN fixed, non-attacker-controlled `SANDBOX_PROXY_HTML` script (confirmed by reading it,
  `sandbox-proxy.ts:132-167`), which does nothing but wait for a `postMessage` from `window.parent` validated
  against `event.source === host && event.origin === hostOrigin` before it will `document.write` anything —
  and the real admin app's own `AppFrame` would still be targeting the ORIGINAL data:-URL's opaque origin for
  its own `postMessage` calls, so delivery to the hijacked frame would fail on the target-origin mismatch
  regardless. Net: the attacker can make their own guest content disappear (replaced by the admin's own inert
  page) but gains no new capability by doing so. **Not counted as confirmed, but marked UNVERIFIED-LEANING-DISPROVEN**
  rather than a clean discard, since I cannot run an actual browser to empirically confirm browser-engine
  behavior for this specific case, and the stakes (auth-bypass) warrant that caveat rather than false
  confidence either way.
- **Gemini's Finding 2 (postMessage handshake origin mismatch)**: claimed that because a `data:` document's
  origin serializes to the string `"null"`, `@mcp-ui/client`'s own PARENT-SIDE listener (validating messages
  FROM the guest) would either reject every message (if it strictly compares against a real origin) or accept
  messages from any `data:`/sandboxed frame on the page (if relaxed) — either breaking the fix or reopening a
  different hole. **Could not fully verify**: `@mcp-ui/client`'s actual bundle is not present in this
  checkout's `node_modules` in an inspectable form (the nested `@jini-ai/ui/node_modules/@mcp-ui/client`
  directory resolves to empty), so I could not read its real origin-check logic to confirm or refute this.
  The `@jini-ai/ui` code THIS diff owns is internally consistent (the child-side `hostOrigin` check correctly
  uses the injected literal, never `window.location.origin`, and posts to the parent using that same real,
  non-opaque `hostOrigin` as the `postMessage` target — which is what makes DELIVERY TO the parent succeed).
  Whether the PARENT's own incoming-message validation (third-party code) correctly special-cases an opaque
  `"null"` sender origin for this specific channel is a real open question the diff's own doc comments claim
  was "verified live against a real Chromium build, 2026-08-18" and via tracing the built bundle — I have no
  way to independently confirm or refute that claim without running a browser. Recommend the owner treat this
  as needing an ACTUAL manual smoke test (open an MCP-UI surface in the real admin app) rather than trusting
  either Gemini's claim or the code's own comment blindly.

**33. [MEDIUM, confirmed as a real code-smell; downstream consequence unverified]
`apps/admin/src/components/AssistantDock/AssistantDock.tsx:128-138`** — `buildAssistantMcpUiSandboxProxyUrl(...)`
is called INSIDE the registered ext-event renderer function body (not memoized), so a new `URL` object (and a
freshly re-encoded, freshly re-`encodeURIComponent`'d HTML string) is constructed every time this renderer is
invoked — plausibly on every transcript re-render while a run streams. If `@mcp-ui/client`'s `AppFrame`
internally keys a `useEffect` (that sets `iframe.src`) off this prop's REFERENCE rather than its string value
(`sandboxProxyUrl.href`), this would reload the guest iframe repeatedly during streaming, destroying its
state. Confirmed the object IS recreated every invocation (an objectively verifiable fact from reading the
code); could NOT confirm whether `AppFrame` actually keys off reference identity in a way that manifests this
as visible churn, since its source isn't inspectable in this checkout.

**34. [HIGH, confirmed] `apps/admin/src/components/AssistantDock/SlowRunNoticeCard.tsx:41`** —
`SlowRunNoticeCard({ events })` destructures ONLY `events`, completely ignoring `runStreaming`/`runSucceeded`
— both of which ARE real fields on `ExtEventRenderProps` (confirmed by reading the type definition,
`@jini-ai/chat/src/react/ext-event-renderer-registry.ts:23-32`). So the "Still working — this is taking
longer than usual" notice is rendered unconditionally whenever this card is invoked, with no check for
whether the run has actually finished — a completed turn that ever triggered the 45s slow-run watchdog keeps
showing an active "still working" status permanently in the transcript.

**35. [MEDIUM, confirmed — an objective doc/code contradiction] `apps/admin/src/App.tsx:250`,
`AssistantChrome`** — calls `resolveChatFabClearance({...})` directly in the component body. This directly
contradicts the SAME function's own doc comment two lines above (`App.tsx:210-211`): *"The FAB clearance math
(`resolveChatFabClearance`, `App.hooks.tsx`) is pure derived state, not JSX — kept out of this component's own
body..."* — the comment describes intended behavior the code does not follow. Also a standing-rule violation
(derived logic in a `.tsx` file).

**36. [LOW, confirmed, same pattern already proven problematic elsewhere in this exact audit]
`apps/admin/src/App.tsx:463`** — `const dockT = (key: string): string => translateAssistantDockLabel(navLocale,
key);`, a plain unmemoized arrow function recreated every render of `App`, passed down as a prop. This is the
IDENTICAL pattern to `useWiredAccessTokens`'s `boundT` (finding 29 above), which I confirmed causes a real
cascading re-subscription bug via an unstable `useCallback` dependency. Did not trace far enough to confirm
`dockT` specifically feeds a `useCallback`/`useEffect` dependency downstream (time budget), so flagging as a
confirmed code smell with an unconfirmed downstream consequence, not a fully-proven duplicate of finding 29.

**37. [LOW, confirmed] `apps/admin/src/components/AssistantDock/SlowRunNoticeCard.tsx:36-38`** —
`resolveSlowRunDetail` is a plain, non-component, non-precedented data-extraction helper function living
directly in the `.tsx` file; unlike the `resolveXHook`-style DI resolvers seen elsewhere in this audit (which
have an established, repeated, precedented shape across many screens), this is a genuine one-off violation of
the standing rule.

**No defects identified:** `apps/admin/src/panels.tsx` (new "sites" panel entry, schema-conformant).

Chunk tally: 8 findings raised; 2 confirmed (34, 35), 2 confirmed-as-code-smell-with-unverified-downstream-effect
(33, 36), 1 confirmed-low (37), 2 security claims neither cleanly confirmed nor discarded — recommend a real
browser smoke test rather than trusting either the audit or the code's own claims blindly.

## Areas not covered / caveats

- See the coverage map's unchecked items above for the specific files/areas not audited: Media.tsx,
  Collections.tsx, MenuEditor.tsx, the complexity/architecture baseline JSON diffs, the hooks-extraction
  refactor commits as a general sweep (Pages/Posts/ThemeExplore/AiAssistant/ThemePageDetailsModal and others,
  beyond the one file each already-audited chunk happened to touch), vite.config.ts/dev.mjs, and a dedicated
  test-quality pass on the largest new/changed test files.
- Two security-relevant claims about the MCP-UI same-origin fix (App.tsx/AssistantDock chunk, findings
  labeled "neither confirmed nor discarded") could not be resolved without a real browser — recommend an
  actual manual smoke test of an MCP-UI surface in the admin app before treating either verdict as settled.
- No tests, coverage, or typecheck were run anywhere in this audit (per the dispatch's machine constraint);
  every "confirmed" finding above was verified by reading source, tracing callers, and in a few cases reading
  third-party package source resolved via the local sibling-Jini symlink — never by executing code.
- Every "pre-existing, not introduced in this window" finding was confirmed via `git log`/`git diff` against
  the specific commit that changed the file, not assumed — see each such finding's own provenance note.
