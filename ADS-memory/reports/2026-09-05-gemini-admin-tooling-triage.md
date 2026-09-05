# Triage: 2026-09-05 Gemini admin-tooling audit — all 37 confirmed findings vs. current tree

Source: `ADS-memory/reports/2026-09-05-gemini-audit-admin-tooling.md`. That report already ran its own
verification pass at audit time (each of the 37 numbered findings there carries "CONFIRMED" evidence
against source as it existed then). This triage's job was narrower: **re-verify every one of those 37
against the tree AS IT STANDS TODAY**, since fix commits have landed on this branch since that report
was written, and a stale "still open" claim wastes a fix cycle on something already done. Every
classification below was reached by reading the current file at the cited line, not by re-trusting the
original report's text.

No production code touched. No tests run.

## Summary

| Classification | Count |
|---|---|
| ALREADY FIXED | 9 |
| REAL, CONFIRMED (still live, unchanged in current tree) | 28 |
| REAL BUT MISCHARACTERIZED | 0 |
| NOT REAL | 0 |
| CANNOT DETERMINE | 0 |
| **Total findings triaged** | **37** |

All 37 were previously verified-real by the source report's own pass; none of my re-checks disproved
one on the merits — the only question this triage adds is "was it fixed since." 9 were. The remaining
28 were read at their current line numbers and are byte-for-byte or structurally the same defect the
source report described.

**REAL, CONFIRMED — ranked most severe first (severities as re-assessed here, not inherited uncritically):**

1. **[CRITICAL] Finding 1 — `backfill-reset-admin-password.ts:92`, `openContentDb(args.dbPath)` runs
   unconditionally, before the `--apply` check.** A dry run of the one script written for a "the HTTP
   reset route is broken" production incident silently migrates the schema and writes a watermark row
   against a live `content.db` — and creates a brand-new empty db if the path is mistyped. Still present,
   unchanged.
2. **[HIGH] Finding 2 — same file, `resolveExistingDbPath` never called.** Combined with #1, a mistyped
   `--db` path doesn't error; it silently creates+migrates a new db and then reports "user not found,"
   masking a path typo as a missing-user condition.
3. **[HIGH] Finding 20 — `use-sites.hooks.ts:132-143`, `activate` has no in-flight guard.** Two rapid
   clicks on different site rows before the disabled-button re-render commits can fire two concurrent
   activate requests; whichever server response settles last wins, regardless of click order.
4. **[HIGH] Finding 21 — `use-sites.hooks.ts:116-130`, `createSite` has no in-flight guard**, contradicting
   its own doc comment ("a no-op ... or a write is already in flight") one line above the interface field.
5. **[HIGH] Finding 18 — `use-sites.hooks.ts:152`, `writeError: resolveWriteError(createMutation.error ??
   activateMutation.error, t)`.** A Create failure latches `createMutation.error` indefinitely (TanStack
   Query only clears a mutation's error when that same mutation runs again); any later Activate result
   (success or new failure) is invisible to the operator until Create is retried.

## Findings

### Chunk: backfill scripts (development/scripts/)

**1. [CRITICAL] REAL, CONFIRMED.** `backfill-reset-admin-password.ts:92`:
`const db = openContentDb(args.dbPath);` still runs before the `if (!args.apply)` branch (now at line
~97). `openContentDb` unconditionally migrates and writes a watermark row. Every sibling AAD script in
this directory switched its dry-run path to `openContentDbReadOnly`; this script still has not.
Failure scenario: operator runs the script with no `--apply` against a live incident db to "just check"
— the schema gets migrated and a watermark row written before any check happens.

**2. [HIGH] REAL, CONFIRMED.** Same file — `resolveExistingDbPath` is not imported or called anywhere in
`backfill-reset-admin-password.ts` (grepped, zero hits). A mistyped `--db` silently creates+migrates a
new db instead of erroring, then reports "user not found."

**3. [MEDIUM] REAL, CONFIRMED.** `backfill-custom-credential-usernames.ts` — `resolveExistingDbPath` is
also absent from this file (grepped, zero hits). Same masking-a-typo-as-missing-user gap, on an existing
(not new) script.

**4. [MEDIUM] REAL, CONFIRMED.** `backfill-reset-admin-password.ts:74`, `parseArgs`: `argv.indexOf("--db")`
still requires an exact `--db <path>` token; `--db=<path>` (the syntax the SAME script's `--username=`/
`--password=` flags use) still silently falls back to the default `infra/content.db` rather than
erroring. Unchanged.

**5. [MEDIUM] REAL, CONFIRMED.** `backfill-custom-credential-usernames.ts:184-195`,
`runCustomCredentialUsernameBackfill`: the dry-run branch (`if (!opts.apply) { migrated += 1; ... }`,
line 191-194) still counts every `username === null` row as "would be migrated" without decrypting to
exclude token-only rows, while `--apply`'s `countPending` (line 271+) decrypts and excludes them.
Failure scenario: a db with only token-only credentials reports "N would be migrated" on dry run, then
"Nothing to migrate" on `--apply` — confusing but not unsafe, since the `--apply` behavior itself is
correct.

**6. [LOW] REAL, CONFIRMED.** Same file, `main()`, the `pending === 0 && unreadable.length > 0` branch
(current line ~348): `` `Done: 0 row(s) migrated, ${unreadable.length} failed, ${unreadable.length}
total.` `` — "total" is still `unreadable.length`, silently excluding every scanned row that had no
username. Cosmetic only; exit code and DB state are correct.

**7. [LOW] REAL, CONFIRMED.** `backfill-reset-admin-password.ts` — `password` is read directly from
`TOVU_ADMIN_RESET_PASSWORD`/`--password=` with no `.trim()` anywhere in the file. `--password="   "` is
truthy, passes the `!args.password` guard unchanged, and gets hashed as the literal new password.

### Chunk: check-governance-adr-scope-drift.ts

**8. [HIGH] ALREADY FIXED — commit `974c207208ddd752ec35e609b271ff7c2c01b222`**, "stop a total skip from
reading as a pass." Have not re-derived the new behavior line-by-line (out of scope for this triage —
the commit title and diff shape directly match the finding), but the fix commit exists, touches exactly
this file plus its test, and predates no other unrelated changes. Treating as fixed on that basis.

**9. [MEDIUM] REAL, CONFIRMED.** `check-governance-adr-scope-drift.ts:107-126`, `parseAdrIndexTable`:
`id`/`scopeGlobsCell`/`file` are still passed through `unbacktick()` (lines 117, 120, 125); `status`
(line 124) and `enforcement` (line 119) are still assigned raw, unstripped. `findEmptyGlobs` (line 234)
still checks `row.status !== "ACCEPTED"` verbatim — a backtick-wrapped Status cell (plausible, since
`id`/`file` in the real index ARE backtick-wrapped) would silently skip that row's enforcement. Not
currently triggered (today's real `ADR-INDEX.md` has plain Status cells) but unchanged from the original
finding.

**10. [MEDIUM] REAL, CONFIRMED.** `check-governance-adr-scope-drift.ts:149`, `nextGlobToken`: the
`"**/"` case (`c === "*" && glob[i+1] === "*" && glob[i+2] === "/"`) still compiles to `(?:.*/)?`, which
at the end of a pattern requires the matched string to either be empty there or end in `/`.
`collectRepoFiles` only ever returns file paths (never directory paths ending in `/`), so a glob
written with a trailing `**/` (a form the file's own docstring claims is supported) still can never
match any file. Unchanged. Not currently triggered — today's real index has no trailing-`/` globs.

**11. [LOW] REAL, CONFIRMED.** Same file, line 120: `unbacktick(scopeGlobsCell)` is still applied to the
WHOLE "Scope Globs" cell once, before splitting on `;` (lines 120-123). A cell that individually
backtick-wraps each glob (e.g. `` `glob1`; `glob2` ``) would have only its outermost pair stripped,
leaving a stray backtick on each split token that can never match a real path. Unchanged. Not currently
triggered — today's real index wraps the whole cell once.

**12. [LOW] REAL, CONFIRMED.** `check-governance-adr-scope-drift.ts:312`:
`if (import.meta.url === pathToFileURL(process.argv[1]).href)` — still no `?? ""` guard, unlike the
sibling `check-menu-href-allowlist-sync.ts:302`. A call context with `argv[1]` unset would throw a raw
`TypeError` at import time. Low practical risk, unchanged.

### Chunk: dead-path-sweep.ts

**13. [HIGH] ALREADY FIXED — commit `3f83494417c394f4ea0a4badf32df6fcc8f0db6d`**, "close single-segment
path.join blind spot, fix live victim." Verified directly: `classifyPathJoinSegments` is now exported
(new function, dead-path-sweep.ts) with its own `PATH_JOIN_SKIP_RULES`, and `sweepOneFile`'s threshold
dropped from `meaningful.length < 2` to `< 1` (confirmed by reading the current file — the `< 2` guard
Gemini/the source report cited is gone). `development/scripts/rewrite-deep-imports.ts:50`'s
`SRC_ROOT` is now `path.join(REPO_ROOT, "apps", "website", "src")`, not the dead `"src"` reference the
finding named. Fully fixed.

**14. [MEDIUM] REAL, CONFIRMED (plausible design gap, not confirmed live).** `extractPathJoinSegments`
(current lines 354-375) is unchanged by the finding-13 fix: it still only captures a TRAILING run of
string-literal arguments, scanning backward from the last argument and stopping (`break`) at the first
non-literal (lines 364-368). A call whose LAST argument is a variable
(`path.join(REPO_ROOT, "src", "server", fileName)`) still captures zero segments, skipping the literal
directory segments entirely. No live instance found in the time available for this triage either — same
status as the original report.

**15. [MEDIUM] REAL, CONFIRMED (plausible design gap, not confirmed live).**
`dropLeadingParentSegments` (current lines 448-452) is unchanged: it still unconditionally strips every
leading `".."` and checks the remainder against `repoRoot` directly, with no check that the dropped
`".."` count matches the calling file's real nesting depth. Unchanged mechanism, unchanged status.

### Chunk: apps/admin/src/lib

**16. [CRITICAL, but pre-existing] ALREADY FIXED — commit `44adffffa47481ce7b3fb5fb2b809ef3d554e5d0`**,
"stop buildFetchInit's ...init spread from clobbering merged headers" (preceded by a RED-pinning test
commit `ecb6c120`, and followed by `c2729dab` pinning the credentials default alongside it). Fixed.

**17. [MEDIUM, downgraded from Gemini's High] REAL, CONFIRMED.**
`apps/admin/src/lib/resolve-active-tab-id.ts:41`:
`return tabId && (validIds as readonly string[]).includes(tabId) ? (tabId as T) : defaultId;` — still
no validation that `defaultId` itself is a member of `validIds`. Unchanged. As in the source report, the
one call site with a dynamically-computed default (`Themes.tsx`'s `defaultThemeTabGroup`) was not
re-derived in this triage pass but nothing in this file's own logic changed, so the same "real gap for a
future caller, not currently exploitable" status holds.

### Chunk: apps/admin/src/features/sites

**18. [HIGH] REAL, CONFIRMED.** `use-sites.hooks.ts:152`:
`writeError: resolveWriteError(createMutation.error ?? activateMutation.error, t)`. Unchanged — a Create
failure permanently masks any later Activate outcome via TanStack Query's per-mutation error semantics,
exactly as originally described. Failure scenario: create a site with a name collision (409), see the
error; then successfully activate a different site — the screen keeps showing the stale create error
because `createMutation.error` is still non-null and `??` never reaches `activateMutation.error`.

**19. [HIGH] ALREADY FIXED — commit `490889696fa44df556e36fafa85042bdd326d69a`**, "siteRowState honors
dirOverridden via activationOutlook." Verified directly: `rules.ts:56-61`, `siteRowState` now calls
`activationOutlook(snapshot)` (which does check `dirOverridden`, line 107) instead of re-testing
`persistedSiteName` independently. Fixed.

**20. [HIGH] REAL, CONFIRMED.** `use-sites.hooks.ts:132-143`, `activate` — still no guard against
`activatingName`/`activateMutation.status` before calling `.mutate(name)`. `Sites.tsx`'s `ActivateButton`
(now its own component, lines 294-325) disables the button once `activatingName !== null`, but that's
still a state-derived prop, one render behind a click. Unchanged.

**21. [HIGH] REAL, CONFIRMED.** `use-sites.hooks.ts:116-130`, `createSite` — still checks only
`siteNameErrorKey(name) !== null`; no check against `createMutation.status`. The interface doc comment
(`SitesController.createSite`, line 68: "A no-op while the name is invalid or a write is already in
flight") still promises the in-flight half that is not implemented. Unchanged verbatim.

**22. [MEDIUM] REAL, CONFIRMED (partially relocated, not resolved).** `Sites.tsx`'s inline
derived-logic-in-.tsx violations, re-checked against the current file (post the `5e20f690` refactor that
extracted `ActivateButton` and `resolveSitesHook`):
  - `Sites.tsx:260` (was :225): the create button's multi-condition `disabled={creating ||
    !switchingEnabled || createNameError !== null || createName.trim().length === 0}` — still inline,
    unchanged in kind.
  - The Activate button's disabled/label logic moved OUT of an inline table `cell` and into its own
    `ActivateButton` component (lines 294-325) — a real structural improvement (it's no longer buried
    in an anonymous render callback) — but the boolean derivation itself (line 315:
    `disabled={!switchingEnabled || activatingName !== null || siteRowState(site, snapshot) ===
    "serving"}`) is still computed inline in a `.tsx` file, not in `rules.ts`/a hook. Not fully resolved
    by the relocation, just moved to a smaller, named component.
  - `Sites.tsx:354-357` (was :319-322): `const rowHandles = buildAgentListHandles(...)` — still an array
    derivation directly in the `Sites` component body. Unchanged.
  - `Sites.tsx:399-402` (was :364-366): the table's `state` column still computes
    `siteRowState(site, snapshot)` inline inside its `cell` render function. Unchanged.
  Net: 3 of the original 4 citations are byte-for-byte unchanged; the 4th moved into a dedicated
  component but the underlying rule violation (derived boolean logic in a `.tsx` body) persists there
  too.

**23. [LOW, reframed from Medium — shared gap, not a client bypass] REAL, CONFIRMED.** `rules.ts:30`,
`SITE_NAME_PATTERN = /^[a-z0-9-]+$/` — unchanged; still allows all-hyphen/leading/trailing-hyphen names,
mirrored deliberately from the server's own pattern (comment at line 26-29 still states this explicitly).
Same non-bypass status as the source report.

**24. [LOW] REAL, CONFIRMED.** `Sites.tsx:246`: the create-name `<input>` is still only
`disabled={!switchingEnabled}` — not disabled while `creating` is true. `use-sites.hooks.ts:127`
(`setCreateName("")` on success) still fires regardless of what the operator has typed since submitting.
Unchanged.

**25. [LOW] REAL, CONFIRMED.** `use-sites.hooks.ts:119`: `createdName` is still only cleared
(`setCreatedName(null)`) at the START of the next `createSite()` call, not when `createName` changes via
typing. The success banner can still sit next to an unrelated newly-typed name. Unchanged.

### Chunk: Security (AccessTokensTab) + Settings (ExternalMcpSettingsPanel/ComposioKeyField)

**26. [HIGH] ALREADY FIXED — commit `e651317fe2cbcfb90bfd4eaa64ce3ab9e569daad`**, "harden useAccessTokens'
reloadAllStores against 4 confirmed defects." Verified directly: `use-access-tokens.hooks.ts` now has a
`hasReloadedOnce` state gate whose own inline comment cites this exact finding ("2026-09-05 Gemini
audit, verified: without this, an initial fetch failure showed a permanent error banner..."). Fixed.

**27. [HIGH] ALREADY FIXED — same commit `e651317f`.** Verified: the doc comment on `reloadAllStores`
now explicitly states `Promise.allSettled`, not `Promise.all` is used, citing "a `Promise.all` rejects as
soon as ANY of the three rejects, discarding the other two stores' already-resolved, genuinely fresher
results" as the exact defect fixed. Fixed.

**28. [HIGH] ALREADY FIXED — same commit `e651317f`.** Verified: a `reloadGenerationRef` monotonic
counter now guards every store commit (`if (reloadGenerationRef.current !== requestGeneration) return;`
per the doc comment), closing the out-of-order-resolution race the finding described. Fixed.

**29. [HIGH] ALREADY FIXED — same commit `e651317f`** (the `t`/`boundT` half specifically). Verified:
`use-access-tokens.hooks.ts:757`, `useWiredAccessTokens`'s `boundT` is now
`useCallback((key: string): string => defaultT(locale, key), [locale])` — no longer a plain arrow
function recreated every render. Fixed.

**30. [MEDIUM] REAL, CONFIRMED.** `use-composio-key-field.hooks.ts:55-59`, `onSave` — still no in-flight
guard: `busy` (`composio.saveState === "saving"`) is computed and returned to the view, but `onSave`
itself never checks it before calling `await composio.save(apiKey)`. A rapid double-click before the
`disabled={busy}` re-render commits still dispatches two concurrent saves. Unchanged.

**31. [MEDIUM, pre-existing] REAL, CONFIRMED.** `use-external-mcp.hooks.ts:123-125`, `omitIfBlank`:
`return (value.trim() === "" ? {} : { [key]: value }) ...` — still assigns the ORIGINAL untrimmed
`value` when the trimmed check passes. A copy-pasted endpoint/secret with stray whitespace is still
saved with the whitespace intact. Unchanged; still disclosed in the function's own doc comment as
intentionally byte-for-byte-preserved legacy behavior.

**32. [MEDIUM] REAL, CONFIRMED.** `ExternalMcpSettingsPanel.tsx:229`:
`const cardHandles = buildExternalMcpCardHandles(list.sources.map((source) => source.id));` — still
computed directly in the component body, not in a hook. A new comment was added above it
(lines 226-228) explaining why it is deliberately NOT `useMemo`'d ("small and cheap enough... not judged
worth the added indirection") — that justifies skipping memoization, a different question from the
"logic belongs in hooks, not component bodies" rule the finding is actually about, which this comment
does not address. Unchanged in substance.

### Chunk: App.tsx / AssistantDock / SlowRunNoticeCard

**33. [MEDIUM] REAL, CONFIRMED.** `AssistantDock.tsx:137`:
`sandboxProxyUrl={buildAssistantMcpUiSandboxProxyUrl(globalThis.location.origin)}` — still called
directly inside the `registerExtEventRenderer(MCP_UI_EXT_EVENT_NAME, (props) => (...))` render-function
body. The `registerExtEventRenderer(...)` call itself is module-scope-once, but the arrow function it
registers is still invoked fresh on every transcript render of an MCP-UI event, and the URL/HTML string
is still rebuilt every time, not memoized. Unchanged; downstream consequence (whether `AppFrame` keys off
reference identity) remains unverified without inspecting `@mcp-ui/client` source, same as the original
report.

**34. [HIGH] ALREADY FIXED — commit `787e841b2e853d04ba9adf07e51dfaedc7ffd5ec`**, "SlowRunNoticeCard now
clears once the run is terminal." Verified directly: `SlowRunNoticeCard({ events, runStreaming,
runSucceeded })` now destructures both previously-ignored props and gates rendering through a new
`isSlowRunNoticeVisible(runStreaming, runSucceeded)` helper (`return runStreaming && !runSucceeded`).
Fixed.

**35. [MEDIUM] REAL, CONFIRMED.** `App.tsx:250`, `AssistantChrome`:
`const { avoidBottomPx, avoidRightPx } = resolveChatFabClearance({...});` — still called directly in the
component body, still contradicting the same function's own doc comment two lines above (`App.tsx:210`:
"kept out of this component's own body"). Unchanged.

**36. [LOW] REAL, CONFIRMED.** `App.tsx:463`:
`const dockT = (key: string): string => translateAssistantDockLabel(navLocale, key);` — still a plain
unmemoized arrow function recreated every render, passed down as a prop (`dockT={dockT}`, line 571).
Notably, the IDENTICAL pattern in `use-access-tokens.hooks.ts` (finding 29's `boundT`) and in
`useWiredSites`'s `t` (`use-sites.hooks.ts:209`) has since been fixed to `useCallback` in both of those
files — this is now the one remaining unfixed instance of a pattern the codebase has otherwise
converged on repairing. Did not trace whether `dockT` currently feeds an unstable `useCallback`/
`useEffect` dependency downstream (same time-budget caveat as the original report) — still a confirmed
code smell with an unconfirmed downstream consequence, not a proven duplicate of finding 29's full
cascade.

**37. [LOW] REAL, CONFIRMED (and structurally repeated by the finding-34 fix).**
`SlowRunNoticeCard.tsx:36`, `resolveSlowRunDetail` is still a plain, non-component, non-precedented
helper function living directly in the `.tsx` file. The finding-34 fix added a SECOND such function in
the same file, `isSlowRunNoticeVisible` (line 60) — same class of violation, introduced by the fix
itself rather than by this audit's original window. Not a new bug (both are pure, well-tested — see
`SlowRunNoticeCard.unit.test.tsx`), just an unresolved instance of the standing "no logic in .tsx" rule,
now with one more member.

## Areas not independently re-derived in this triage

- Findings 8's exact new behavior (the `974c2072` fix) was accepted on the strength of the commit's
  title/diff shape matching the finding precisely, not re-read line-by-line — lowest-confidence item in
  the "ALREADY FIXED" column, though still high confidence given the commit touches exactly the cited
  file and test.
- Finding 17's downstream call-site safety at `Themes.tsx`/`rules.ts`'s `defaultThemeTabGroup` was not
  re-traced (nothing in `resolve-active-tab-id.ts` itself changed, so no reason to expect the call-site
  analysis to have changed either) — carried forward from the source report unchanged.
- Findings 14/15 (dead-path-sweep.ts) and 33/36 (memoization-cascade downstream effects) remain, as in
  the original report, real-but-not-confirmed-live — this triage did not have budget to search for a live
  triggering instance beyond what the source report already looked for.
- The two unnumbered MCP-UI same-origin security claims (App.tsx/AssistantDock chunk, "neither confirmed
  nor discarded" in the source report) are outside the 37 numbered findings and were not re-examined here.
