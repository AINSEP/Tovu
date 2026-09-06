# Re-triage: 2026-09-05 Gemini admin-tooling audit — the 28 "REAL, CONFIRMED" findings, re-verified against the tree as it stands right now

Source: `ADS-memory/reports/2026-09-05-gemini-admin-tooling-triage.md` ("the stale triage"), which
itself triaged `ADS-memory/reports/2026-09-05-gemini-audit-admin-tooling.md` (the original 37-finding
Gemini audit) and classified 28 of the 37 as "REAL, CONFIRMED (still live, unchanged in current tree)".
Fix commits have landed since that triage was written. This document re-verifies each of the 28
against the current tree by reading the current file at the current line — not by re-trusting the
stale triage's text, and not by re-trusting the dispatching agent's framing either (both were checked
independently). No production code touched. No tests run (machine's test budget is committed to other
agents right now; nothing here required a test run to settle).

## Summary (of the 28 "REAL, CONFIRMED" findings)

| Classification | Count | Findings |
|---|---|---|
| ALREADY FIXED | 5 | 1, 2, 18, 20, 21 |
| STILL LIVE | 23 | 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 17, 22, 23, 24, 25, 30, 31, 32, 33, 35, 36, 37 |
| CANNOT DETERMINE | 0 | — |

Every classification below was reached by reading the current file at the cited symbol/line, not by
re-trusting either the stale triage's or the dispatching agent's text. The dispatching agent's own
reading of findings 1, 2, 18, 20, 21 as fixed by `1e2dc23f` / `bac64077` **held up** on independent
verification — see each finding below for the exact current code proving it.

**One correction to the stale triage that is NOT a "fixed vs. live" issue**: findings 13, 14, and 15
were all cited against `development/scripts/dead-path-sweep.ts`. That path has never existed on this
branch — `git log --all` shows the file was created directly at `development/scripts/lib/dead-path-sweep.ts`
in commit `0354db2b` and never moved. The stale triage's path for these three findings was wrong from
the start (not "moved since," as its own line-number citations might suggest — the content and line
numbers it cited are in fact accurate at the real path, `development/scripts/lib/dead-path-sweep.ts`).
This is exactly the kind of citation error the dispatch warned to watch for, so it is called out
explicitly even though it does not change any finding's live/fixed status.

## Findings

### Chunk: backfill scripts (`development/scripts/`)

**1. [CRITICAL] ALREADY FIXED — commit `1e2dc23f33bc9b5e514c5dd2c294913435eebbaf`**,
"fix(scripts): backfill-reset-admin-password dry run no longer migrates or writes" (2026-09-05).
Verified directly: `backfill-reset-admin-password.ts:100-105` now reads:
```ts
const dbPath = resolveExistingDbPath(args.dbPath);
const db = args.apply ? openContentDb(dbPath) : openContentDbReadOnly(dbPath);
```
`resolveExistingDbPath` is called before anything is opened, and a dry run (`!args.apply`) now opens
strictly read-only via `openContentDbReadOnly`, which does not migrate or write the watermark row. The
commit also added two regression tests (`backfill-reset-admin-password.test.ts`) pinning a dry run to
zero schema changes and a missing `--db` path to a loud failure. Fixed.

**2. [HIGH] ALREADY FIXED — same commit `1e2dc23f`.** Verified: `resolveExistingDbPath` (imported at
`backfill-reset-admin-password.ts:65`) is now called at line 100, before either `openContentDb` variant
runs. A mistyped `--db` path now fails loudly via `resolveExistingDbPath` instead of silently
creating+migrating a new db. Fixed.

**3. [MEDIUM] STILL LIVE.** `backfill-custom-credential-usernames.ts` — `resolveExistingDbPath` is
still not imported or called anywhere in this file (confirmed via `command grep -n
"resolveExistingDbPath"`, zero hits). `parseArgs` (line 109-113) resolves `dbPath` from a raw
`argv.indexOf("--db")` with no existence check, and `main()` opens it directly at line 312
(`openContentDbReadOnly(args.dbPath)`, dry run) and line 322 (`openContentDb(args.dbPath)`, `--apply`)
with no `resolveExistingDbPath` gate on either path. Same masking-a-typo-as-missing-data gap as before
the sibling script was fixed. Unchanged from the stale triage's description; only line numbers differ
slightly (109-113, 312, 322 vs. its unspecified citation).

**4. [MEDIUM] STILL LIVE.** `backfill-reset-admin-password.ts:83,87` (current lines — shifted from the
stale triage's ~74 due to the finding-1/2 fix inserting lines above):
```ts
const dbFlag = argv.indexOf("--db");
...
dbPath: dbFlag === -1 ? path.join(REPO_ROOT, "infra", "content.db") : path.resolve(argv[dbFlag + 1]),
```
Still requires the exact `--db <path>` token; `--db=<path>` (the syntax this same script's
`--username=`/`--password=` flags use) still silently falls back to the default
`infra/content.db` rather than erroring. Unchanged in mechanism. Note: the finding-1/2 fix did NOT
touch this — it only gated what happens once `dbPath` is resolved, not how it's parsed.

**5. [MEDIUM] STILL LIVE.** `backfill-custom-credential-usernames.ts`, `runCustomCredentialUsernameBackfill`
dry-run branch (current lines ~189-192):
```ts
if (!opts.apply) {
  migrated += 1;
  log(`DRY RUN: would inspect workspace=${row.workspaceId} id=${row.id} (username currently NULL)`);
  continue;
}
```
Still counts every `username === null` row as "would be migrated" without decrypting to exclude
token-only rows, while `--apply`'s `countPending` (current lines ~284-296) decrypts each row and only
increments `pending` when `extractUsername(plaintext) !== undefined`. A db with only token-only
credentials still reports "N would be migrated" on dry run, then "Nothing to migrate" on `--apply` —
confusing but not unsafe, since `--apply`'s own behavior is correct. Unchanged.

**6. [LOW] STILL LIVE.** Same file, `main()`, the `pending === 0 && unreadable.length > 0` branch
(current line ~348):
```ts
console.log(
  `Done: 0 row(s) migrated, ${unreadable.length} failed, ${unreadable.length} total. ...`
);
```
"total" is still `unreadable.length`, silently excluding every scanned row that had no username.
Cosmetic only; exit code and DB state are correct. Unchanged.

**7. [LOW] STILL LIVE.** `backfill-reset-admin-password.ts` — confirmed via `command grep -n "trim"` on
the whole file: zero hits. `password` is read directly from `TOVU_ADMIN_RESET_PASSWORD`/`--password=`
(line 90) and passed straight through to `resetAdminPasswordSelfVerified` (line 157) with no
`.trim()` anywhere in the file. `--password="   "` is still truthy, passes the `!args.password` guard
(line 128) unchanged, and gets hashed as the literal new password. Unchanged.

### Chunk: `check-governance-adr-scope-drift.ts`

**9. [MEDIUM] STILL LIVE.** `check-governance-adr-scope-drift.ts:107-129`, `parseAdrIndexTable`:
`id`/`scopeGlobsCell`/`file` are passed through `unbacktick()` (lines 117, 120, 125); `status` (line
124) and `enforcement` (line 119) are still assigned raw, unstripped. `findEmptyGlobs` (line 234) still
checks `row.status !== "ACCEPTED"` verbatim:
```ts
if (row.status !== "ACCEPTED") continue;
```
A backtick-wrapped Status cell would silently skip that row's enforcement. Not currently triggered
(today's real `ADR-INDEX.md` has plain Status cells) but unchanged. Exact line numbers match the stale
triage's citation.

**10. [MEDIUM] STILL LIVE.** `check-governance-adr-scope-drift.ts:147-154`, `nextGlobToken`:
```ts
if (c === "*" && glob[i + 1] === "*" && glob[i + 2] === "/") return { regexFragment: "(?:.*/)?", consumed: 3 };
```
The `"**/"` case still compiles to `(?:.*/)?`, which at the end of a pattern requires the matched
string to either be empty there or end in `/`. `collectRepoFiles` only ever returns file paths (never
trailing-`/` directory paths), so a glob written with a trailing `**/` can still never match any file.
Unchanged. Not currently triggered — today's real index has no trailing-`/` globs. Exact line match.

**11. [LOW] STILL LIVE.** Same file, line 120: `unbacktick(scopeGlobsCell)` is still applied to the
WHOLE "Scope Globs" cell once, before splitting on `;` (lines 120-123). A cell that individually
backtick-wraps each glob would have only its outermost pair stripped, leaving a stray backtick on each
split token. Unchanged. Not currently triggered — today's real index wraps the whole cell once.

**12. [LOW] STILL LIVE.** `check-governance-adr-scope-drift.ts:312`:
```ts
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
```
Still no `?? ""` guard, unlike the sibling `check-menu-href-allowlist-sync.ts`. A call context with
`argv[1]` unset would throw a raw `TypeError` at import time. Unchanged. Exact line match.

### Chunk: `development/scripts/lib/dead-path-sweep.ts` (NOT `development/scripts/dead-path-sweep.ts` — see the path correction above)

**14. [MEDIUM] STILL LIVE — mechanism confirmed, live trigger searched and NONE FOUND.**
`extractPathJoinSegments` (current lines 354-375) only captures a TRAILING run of string-literal
arguments, scanning backward from the last argument and breaking at the first non-literal (lines
363-369):
```ts
const trailingLiterals: string[] = [];
for (let i = args.length - 1; i >= 0; i--) {
  const literal = asStringLiteral(args[i]!);
  if (literal === null) break;
  trailingLiterals.unshift(literal);
}
if (trailingLiterals.length === 0) continue;
```
A call whose LAST argument is a variable (e.g. `path.join(REPO_ROOT, "src", "server", fileName)`)
still captures zero segments — the whole call is skipped, including any literal directory segments
before the variable. **Search performed**: enumerated every `path.join`/`path.resolve` call actually
inside `collectSweepTargets`'s real scan scope — every `.ts` file under `development/scripts/` and
`development/evals/`, plus `apps/website/src/platform/db/*.config.ts` (`.mjs` files such as
`dev.mjs`/`link-jini.mjs`/`build-brand-icons.mjs` are NOT swept — `collectSweepTargets` only pushes
`entry.name.endsWith(".ts")`). Read every hit. None has the trigger shape (a literal directory segment
followed by a trailing non-literal argument in the same call); every call in scope is either fully
literal or has its variable argument immediately after the base (`REPO_ROOT`/`import.meta.dirname`)
with no literal in between. **Verdict: real design gap, confirmed unchanged, but no live triggering
instance exists in the tree today** — same conclusion as both prior reports, now backed by an
exhaustive enumeration rather than a time-boxed search.

**15. [MEDIUM] STILL LIVE — mechanism confirmed, live trigger searched and NONE FOUND.**
`dropLeadingParentSegments` (current lines 448-452):
```ts
export function dropLeadingParentSegments(segments: readonly string[]): readonly string[] {
  let i = 0;
  while (i < segments.length && segments[i] === "..") i++;
  return segments.slice(i);
}
```
Unconditionally strips every leading `".."` with no check that the dropped count matches the calling
file's real nesting depth from repo root. **Search performed**: every `path.join`/`path.resolve` call
in the actual sweep scope that contains a literal `".."` segment is a `REPO_ROOT = path.resolve(import.meta.dirname,
"..", "..")`-shaped assignment at a file directly under `development/scripts/` (a real, correct,
2-level depth) — e.g. `check-capability-inventory.ts:19`:
`path.resolve(import.meta.dirname, "..", "..", "apps", "website", "src", "server", "runtime", "composition")`,
which also has the correct depth. No call in a nested subdirectory (`development/scripts/lib/`,
`development/scripts/__tests__/`) uses a mismatched `".."` count. **Verdict: same as 14** — real design
gap, confirmed unchanged, no live triggering instance found by exhaustive enumeration of the sweep's
actual inputs.

### Chunk: `apps/admin/src/lib` — **directory is HELD (coverage agent live); read-only verification only**

**17. [MEDIUM, downgraded from Gemini's High] STILL LIVE.** `apps/admin/src/lib/resolve-active-tab-id.ts:41`:
```ts
return tabId && (validIds as readonly string[]).includes(tabId) ? (tabId as T) : defaultId;
```
Still no validation that `defaultId` itself is a member of `validIds`. Unchanged (last touched by
`fb707ba4`, an unrelated extraction refactor). As in the source report, the one call site with a
dynamically-computed default (`Themes.tsx`'s `defaultThemeTabGroup`) was not re-derived here either —
same "real gap for a future caller, not currently exploitable" status. **This file is under the HELD
`apps/admin/src/lib/**` — do not dispatch a fix here until that directory is released.**

### Chunk: `apps/admin/src/features/sites` — FREE

**18. [HIGH] ALREADY FIXED — commit `bac64077c99a7c2ec2fdfcfc9227476bd97b9c3b`**, "fix(admin): close
Activate/Create race and stale-error latch in use-sites". Verified directly:
`use-sites.hooks.ts:130-139` (`createSite`) and `155-179` (`activate`) both now call
`activateMutation.reset()` / `createMutation.reset()` respectively at the top of the OTHER mutation's
write, before starting their own:
```ts
// createSite:
activateMutation.reset();
setCreatedName(null);
createMutation.mutate(name)...
// activate:
createMutation.reset();
setActivatingName(name);
activateMutation.mutate(name)...
```
The `writeError: resolveWriteError(createMutation.error ?? activateMutation.error, t)` expression
itself (line 188) is textually unchanged — the fix works by clearing the SIBLING mutation's error
proactively at the start of each write, so the `??` never has a stale value to read. Verified this
actually closes the gap: a Create failure followed by a successful Activate now clears
`createMutation.error` via `activateMutation`'s own call site — wait, corrected: `activate` clears
`createMutation.reset()` (line 160), so a prior Create error is wiped the moment Activate starts, not
left to linger until Activate resolves. Fixed.

**20. [HIGH] ALREADY FIXED — same commit `bac64077`.** Verified: `use-sites.hooks.ts:126`,
`activateGenerationRef = useRef(0)`, and `activate` (lines 155-179) mints `const generation =
++activateGenerationRef.current` synchronously at call start, then gates both the success handler
(`if (activateGenerationRef.current !== generation) return;`, line 169) and the `finally` clearing of
`activatingName` (line 174) on that generation still matching. Two rapid activates on different rows no
longer let a stale, late-arriving response overwrite a newer one. Fixed.

**21. [HIGH] ALREADY FIXED — same commit `bac64077`.** Verified: `use-sites.hooks.ts:120`,
`creatingRef = useRef(false)`, and `createSite` (lines 130-153) now does a synchronous check-then-set
(`if (creatingRef.current) return; creatingRef.current = true;`) before calling `createMutation.mutate`,
cleared in a `.finally()`. The interface doc comment's "a no-op ... or a write is already in flight" is
now true. Fixed.

**22. [MEDIUM] STILL LIVE (rule violation, not a defect) — re-checked against the current file.**
`Sites.tsx`'s inline derived-logic-in-`.tsx` citations, all still present at (shifted) current lines:
  - `Sites.tsx:260`: `disabled={creating || !switchingEnabled || createNameError !== null ||
    createName.trim().length === 0}` — still inline in the create button.
  - `Sites.tsx:315`, inside the extracted `ActivateButton` component (lines 294-325):
    `disabled={!switchingEnabled || activatingName !== null || siteRowState(site, snapshot) ===
    "serving"}` — the disabled/label logic did move out of an anonymous table-cell callback into its
    own named component (a real structural improvement, not present in the stale triage's own framing
    as fully credited), but the boolean derivation itself is still computed inline in a `.tsx` body,
    not in `rules.ts`/a hook.
  - `Sites.tsx:354-357`: `const rowHandles = buildAgentListHandles(...)` — still an array derivation
    directly in the `Sites` component body.
  - `Sites.tsx:400-401`: the table's `state` column still computes `siteRowState(site, snapshot)`
    inline inside its `cell` render function.
  All 4 citations still live. This is a standing-rule violation (no functions/derived logic in `.tsx`
  bodies — see the owner's rule), not a behavioral defect: every one of these computes a value once per
  render from already-available props/state with no observable incorrect behavior.

**23. [LOW, reframed from Medium — shared gap, not a client bypass] STILL LIVE.** `rules.ts:26-30`:
```ts
// Mirrors SITE_NAME_PATTERN in apps/website/src/platform/site-dir/site-registry.ts. Duplicated
// deliberately...
const SITE_NAME_PATTERN = /^[a-z0-9-]+$/;
```
Unchanged; still allows all-hyphen/leading/trailing-hyphen names, but this is a DELIBERATE mirror of
the server's own pattern (the file's own comment says so), so the client cannot bypass anything the
server doesn't already accept. Not a real defect — informational only; fixing the admin copy alone
without also fixing the server pattern would just create client/server drift.

**24. [LOW] STILL LIVE (real UX defect).** `Sites.tsx:246`: the create-name `<input>` is still only
`disabled={!switchingEnabled}` (line 246) — not disabled while `creating` is true. `use-sites.hooks.ts:147`
(`setCreateName("")` in the `createMutation.mutate(name).then()` success handler) still fires
unconditionally on success regardless of what the operator has typed into the field since submitting.
Unchanged. Real (if narrow) defect: typing a second site name while the first create is still in flight
can be silently erased when the first one resolves.

**25. [LOW] STILL LIVE (real UX defect).** `use-sites.hooks.ts:139`: `createdName` is still only
cleared (`setCreatedName(null)`) at the START of the next `createSite()` call — no `onChange` handler on
`createName` clears it as the operator types. The "Created." success banner (`Sites.tsx:265-267`) can
still sit next to an unrelated newly-typed name. Unchanged.

### Chunk: Settings (`use-composio-key-field.hooks.ts` / `use-external-mcp.hooks.ts` / `ExternalMcpSettingsPanel.tsx`) — FREE

**30. [MEDIUM] STILL LIVE (real defect).** `use-composio-key-field.hooks.ts:50-63`, `useComposioKeyField`:
```ts
const busy = composio.saveState === "saving";
...
async function onSave(): Promise<void> {
  const apiKey = draft.trim();
  if (!apiKey) return;
  await composio.save(apiKey);
  setDraft("");
}
```
`busy` is computed and returned to the view, but `onSave` itself never checks it before calling
`composio.save(apiKey)`. A rapid double-click before the `disabled={busy}` re-render commits still
dispatches two concurrent saves. Unchanged; same shape as the now-fixed `use-sites.hooks.ts` races
(findings 20/21), just not yet given the same `useRef` guard.

**31. [MEDIUM, pre-existing, disclosed] STILL LIVE (intentional, documented — not a live bug per its own contract).**
`use-external-mcp.hooks.ts:123-125`, `omitIfBlank`:
```ts
function omitIfBlank<K extends string>(key: K, value: string): { [P in K]?: string } {
  return (value.trim() === "" ? {} : { [key]: value }) as { [P in K]?: string };
}
```
Still assigns the ORIGINAL untrimmed `value` when the trimmed check passes. The function's own doc
comment (lines 118-122) explicitly states this "must stay byte-for-byte the same" as legacy behavior —
this is disclosed, deliberate, not an oversight. Still worth fixing if the owner wants trimmed values
persisted, but it is not masquerading as correct; it says what it does.

**32. [MEDIUM] STILL LIVE (rule violation, not a defect).** `ExternalMcpSettingsPanel.tsx:229`:
```ts
const cardHandles = buildExternalMcpCardHandles(list.sources.map((source) => source.id));
```
Still computed directly in the component body. A comment was added above it (lines 226-228) explaining
why it is deliberately NOT `useMemo`'d ("small and cheap enough... not judged worth the added
indirection") — that addresses memoization, a different question from "logic belongs in hooks, not
component bodies." Unchanged in substance: standing-rule violation, no behavioral consequence (the
handle list is deterministic from already-available props).

### Chunk: `apps/admin/src/components/AssistantDock/**` — **directory is HELD (coverage agent live); read-only verification only**

**33. [MEDIUM — upgraded from "unconfirmed downstream" to CONFIRMED, with a traced mechanism] STILL LIVE.**
`AssistantDock.tsx:137`, inside the module-scope-once `registerExtEventRenderer(MCP_UI_EXT_EVENT_NAME,
(props) => (...))` call (registered once, but the arrow function it registers runs fresh on every
transcript render of an MCP-UI event):
```tsx
sandboxProxyUrl={buildAssistantMcpUiSandboxProxyUrl(globalThis.location.origin)}
```
`buildAssistantMcpUiSandboxProxyUrl` (`AssistantDock.hooks.tsx:1256-1258`) returns `new URL(...)` — a
fresh object every call, not a primitive string. **Traced the downstream consequence this time**,
in Jini source (`/Users/la/Programming/Jini/packages/ui/src/react/mcp-ui/useMcpUiHost.ts:290-305`):
```ts
const rendererProps = useMemo<AppRendererProps>(
  () => ({ ..., sandbox: { url: sandboxProxyUrl }, html, ... }),
  [html, sandboxProxyUrl, handleCallTool, handleOpenLink, handleSizeChanged, handleError],
);
```
`sandboxProxyUrl` is a `useMemo` dependency compared by reference. Because a NEW `URL` instance is
minted on every `AssistantDock.tsx` render (not just when the MCP-UI resource actually changes), this
`useMemo` is defeated on every re-render of the parent transcript — it recomputes `rendererProps`
(and the nested `sandbox` object) every time, regardless of whether `html`/the actual resource changed.
`McpUiHost.tsx` mounts `<AppRenderer key={sessionKey} {...host.rendererProps} />` — the `key` (a stable
string) protects against a full remount, so this is not an iframe-reload bug, but it is a real,
verified memoization bypass: `AppRenderer` (from `@mcp-ui/client`) receives a fresh `sandbox`/prop
object on every parent re-render (e.g. every streamed token during an active run), which is exactly the
kind of prop churn the `useMemo` exists to prevent. Whether `@mcp-ui/client`'s own internals treat that
churn as anything beyond wasted reconciliation was not traced further (its `AppRenderer` internals are
third-party and out of scope for a read-only verification pass) — but the memoization defeat itself is
now a directly verified fact, not speculation.

**34. Not part of the 28 — cited only for context.** `SlowRunNoticeCard.tsx`'s finding-34 fix
(`787e841b`) was spot-checked in the stale triage and re-confirmed present here (`isSlowRunNoticeVisible`
exists and gates rendering); not independently re-verified line-by-line in this pass since it is outside
the 28.

**37. [LOW] STILL LIVE (rule violation, not a defect).** `SlowRunNoticeCard.tsx:36`,
`resolveSlowRunDetail`, and line 60, `isSlowRunNoticeVisible` (the SECOND such function, added by the
finding-34 fix itself) are both plain, non-component helper functions living directly in the `.tsx`
file. Same class of violation as finding 22/32, now with one more member — introduced by a fix, not by
the original audit window. Both are pure and covered by `SlowRunNoticeCard.unit.test.tsx`; no behavioral
consequence.

### Chunk: `apps/admin/src/App.tsx` — **not on the HELD list itself, but shares a file with the HELD `App.hooks.tsx`; flag before dispatch**

**35. [MEDIUM] STILL LIVE (rule violation, contradicts its own comment — not a functional defect).**
`App.tsx:250`, inside `AssistantChrome`:
```ts
const { avoidBottomPx, avoidRightPx } = resolveChatFabClearance({ isSheetMode, chatOpen, sheetHeightPx, dockWidthPx });
```
Still called directly in the component body, contradicting the same function's own doc comment ten
lines above (`App.tsx:210-211`: "kept out of this component's own body"). Unchanged. This is a
comment/code mismatch and a standing-rule violation, not a behavioral bug — the value is recomputed
correctly on every render either way.

**36. [LOW] STILL LIVE — downstream trace completed, no functional consequence found.**
`App.tsx:463`:
```ts
const dockT = (key: string): string => translateAssistantDockLabel(navLocale, key);
```
Still a plain unmemoized arrow function recreated every render, passed as `dockT={dockT}` (line 571) to
`AssistantChrome`. **Traced this time**: `AssistantChrome` (lines 200-328) is a plain function, not
`React.memo`-wrapped, and every one of its `dockT(...)` calls (lines 297, 304, 314, 328) happens
directly inside JSX during render — `dockT` is never placed in a `useEffect`/`useMemo`/`useCallback`
dependency array anywhere downstream (`AssistantChrome` itself and every file under
`components/AssistantDock/` were grepped for the identifier — no match outside `App.tsx`). Unlike
finding 29's `boundT` (which DID feed a `useCallback`), this is confirmed to be pure per-render
allocation waste with no missed re-render, no stale closure, and no proven functional bug. Downgraded in
confidence terms from "unconfirmed downstream consequence" to "confirmed: no downstream consequence" —
it remains a real, live standing-rule violation (recreate-every-render), just not a defect.

## Batch plan

Ordered so FREE batches can start today; HELD/adjacent batches are flagged and should not be dispatched
until the owning agent releases the directory.

### Batch 1 — `development/scripts/` backfill hardening (FREE, needs test runs)
Findings: 3, 4, 5, 6, 7.
All are logic changes to production recovery scripts with existing test-file precedent
(`backfill-reset-admin-password.test.ts` from `1e2dc23f` is the template: RED-pin the current bug, fix,
GREEN). Needs test runs — these are exactly the kind of "silently does the wrong thing with real
databases" bugs that must not ship unverified. Not directory-blocked; can start today.

### Batch 2 — `check-governance-adr-scope-drift.ts` edge-case hardening (FREE, needs test runs)
Findings: 9, 10, 11, 12.
All four are "not currently triggered" edge cases (backtick-per-cell, trailing-`**/`, per-glob
backticks, unset `argv[1]`) in a governance CI script. Needs test runs — same file already has a unit
test suite (`parseAdrIndexTable`/`nextGlobToken` are exported specifically to be unit-tested). Low
urgency (nothing exploits these today) but cheap to batch together since they're all in one file.

### Batch 3 — `development/scripts/lib/dead-path-sweep.ts` design gaps (FREE, needs test runs, LOW priority)
Findings: 14, 15.
Confirmed design gaps with NO live triggering instance in the tree (see the exhaustive search above).
Lowest priority in this plan — fixing them closes a theoretical gap in a sweep tool, not a live bug.
Needs test runs if touched, matching the existing `dead-path-sweep.test.ts` pattern used for the
finding-13 fix.

### Batch 4 — `apps/admin/src/features/sites/**` cleanup (FREE, mixed test-run needs)
Findings: 22, 23, 24, 25.
- 24, 25 are real UX defects — needs test runs (RED-pin then fix), same `useRef`/`onChange` patterns
  already used elsewhere in this file for the just-fixed races.
- 22 is a pure `.tsx`→hook/`rules.ts` relocation — behavior-preserving by definition, so a fix here
  should be paired with a "still renders identically" test rather than a new behavioral test; low risk
  either way given the small size of each derivation.
- 23 is informational only — recommend NOT dispatching a code change without also touching the server
  pattern in `apps/website/src/platform/site-dir/site-registry.ts`, to avoid client/server drift. Flag
  for the owner rather than auto-dispatching.

### Batch 5 — `apps/admin/src/features/settings/**` (FREE, mixed test-run needs)
Findings: 30, 31, 32.
- 30 is a real defect (double-save race) — needs test runs, same in-flight-guard shape as the
  now-fixed `use-sites.hooks.ts`/`use-access-tokens.hooks.ts` races.
- 31 is disclosed/intentional legacy behavior per its own doc comment — recommend confirming with the
  owner before changing (its doc explicitly asks for byte-for-byte preservation); if approved, needs a
  test run since it changes persisted data.
- 32 is a pure `.tsx`→hook relocation — behavior-preserving, low risk.

### Batch 6 (BLOCKED) — `apps/admin/src/lib/**`
Finding: 17.
Blocked on the coverage agent releasing `apps/admin/src/lib/**`. Fix itself is small (validate
`defaultId ∈ validIds`, or assert it at the type level) and would need a test run once released.

### Batch 7 (BLOCKED) — `apps/admin/src/components/**`
Findings: 33, 37.
Blocked on the coverage agent releasing `apps/admin/src/components/**`. 33 needs care: the fix is
likely a `useMemo`/`useRef` around `buildAssistantMcpUiSandboxProxyUrl(...)` inside `AssistantDock.tsx`
(the URL's value is stable — only its identity churns — so a `useMemo(() =>
buildAssistantMcpUiSandboxProxyUrl(globalThis.location.origin), [])` with an empty dep array is very
likely correct and should not need any Jini-side change). Needs a test run. 37 is a pure code-motion
(move both helpers out of the `.tsx` file) with existing test coverage to re-point.

### Batch 8 (CAUTION, not formally blocked) — `apps/admin/src/App.tsx`
Findings: 35, 36.
`App.tsx` itself is not on the HELD list (only `App.hooks.tsx` is, for the hook-race agent), but the
two files are tightly coupled (`AssistantChrome`, `resolveChatFabClearance` and the FAB-clearance
math all live partly in `App.hooks.tsx` per this file's own comments). Recommend confirming with the
hook-race agent or the owner before dispatching, even though the letter of the HELD list does not cover
`App.tsx`. If cleared: 35 is a pure relocation (move `resolveChatFabClearance(...)` call into
`App.hooks.tsx`, matching its own comment's claim); 36 is a pure `useCallback` wrap (same shape as the
now-fixed `boundT`/`t` instances). Both are low-risk code motions; a test run is recommended but the
risk of regression is low given both are pure derivations already covered by render-output tests.

## Defect vs. rule-violation split

**Real defects (user-visible or operationally-visible failure mode):**
- 3, 4, 5, 6, 7 — backfill script safety/correctness gaps (silent wrong-db, silent whitespace password,
  dry-run/apply count mismatch). All genuinely wrong output/behavior, not just style.
- 9, 10, 11, 12 — genuine correctness bugs in a governance script, currently dormant only because no
  real ADR-INDEX row triggers them yet. Real defects, not style.
- 24, 25 — real (if narrow) UX defects: typed input can be silently erased mid-flight; a stale success
  banner can sit next to an unrelated name.
- 30 — real defect: a double-click can dispatch two concurrent Composio key saves.
- 33 — real, now-traced defect: a `useMemo` boundary in Jini's `useMcpUiHost` is defeated on every
  parent re-render because `sandboxProxyUrl` is a fresh object identity each time.
- 14, 15 — real design gaps in a dev-tooling sweep script, but with NO live triggering instance found
  after exhaustive search. Treat as tech debt, not an active bug.

**Standing-rule violations with no behavioral consequence (logic-in-`.tsx` / recreate-every-render):**
- 22 (Sites.tsx x4), 32 (ExternalMcpSettingsPanel.tsx), 35 (App.tsx), 36 (App.tsx), 37
  (SlowRunNoticeCard.tsx x2) — all compute a deterministic value inline in a `.tsx` body or recreate a
  function every render, with no observable incorrect behavior traced (36 was specifically traced
  downstream and confirmed to have no dependency-array consequence). These should still be fixed per
  the owner's standing rule, but they are a different class of dispatch (pure relocation/memoization,
  low regression risk, arguably no test-behavior-change needed beyond "still renders the same") from
  the races and correctness bugs above.

**Disclosed/intentional, not really "findings" to silently fix:**
- 23 (Sites.tsx `SITE_NAME_PATTERN`) — deliberate mirror of the server's own pattern; fixing the client
  alone would create drift.
- 31 (`omitIfBlank`) — the function's own doc comment asks for byte-for-byte legacy preservation.
  Confirm intent with the owner before changing.

## Verdict on findings 14, 15, 33, 36

- **14 (dead-path-sweep.ts, extractPathJoinSegments trailing-literal-only capture): SEARCHED, NONE
  FOUND.** Enumerated every `path.join`/`path.resolve` call in the tool's actual scan scope
  (`development/scripts/**.ts`, `development/evals/**.ts`, `apps/website/src/platform/db/*.config.ts`)
  and confirmed none has the trigger shape (literal directory segment(s) followed by a trailing
  non-literal argument). Real design gap, not a live bug today.
- **15 (dead-path-sweep.ts, dropLeadingParentSegments depth-blind stripping): SEARCHED, NONE FOUND.**
  Every call with a literal `".."` segment in the actual scan scope is at the correct nesting depth
  (2 levels under `development/scripts/`, matching the number of `".."` used). Real design gap, not a
  live bug today.
- **33 (AssistantDock.tsx, unmemoized `sandboxProxyUrl`): FOUND — upgraded to confirmed live defect.**
  Traced into Jini's `useMcpUiHost.ts` and found the exact consequence: the reference-unstable `URL`
  object defeats a `useMemo` boundary on every re-render. This is a genuine, verified finding, not
  merely a code-smell.
- **36 (App.tsx, unmemoized `dockT`): FOUND no downstream consequence — confirmed benign.** Traced
  every consumer of `dockT` and confirmed it is only ever called directly during render, never placed
  in a dependency array. This is real (per the owner's standing rule) but is confirmed NOT to cause any
  missed re-render or stale-closure bug, unlike its sibling pattern in finding 29 (`boundT`), which did
  feed a `useCallback` before being fixed.

## Could not verify

- Nothing in the 28 hit a genuine "cannot determine" wall — every finding was resolved to either
  ALREADY FIXED or STILL LIVE with direct evidence.
- **Finding 33's full downstream chain stops at Jini's `useMemo` boundary.** Whether `@mcp-ui/client`'s
  own `AppRenderer` internals treat the resulting prop churn as anything beyond wasted reconciliation
  (vs. a genuinely visible symptom) was not traced further — that package's internals are third-party
  and reading them in depth was judged out of scope for a read-only verification pass in a shared,
  test-budget-constrained session. The memoization-bypass fact itself, however, is directly verified,
  not inferred.
- **Findings 8's exact new behavior** (the stale triage's `974c2072` fix, not part of the 28) was not
  re-derived here either — out of scope since it is not one of the 28 REAL-CONFIRMED items.
- Directory-held items (17, 33, 37) were verified read-only as instructed but their fixes cannot be
  dispatched until the owning agents release `apps/admin/src/lib/**` and `apps/admin/src/components/**`.
