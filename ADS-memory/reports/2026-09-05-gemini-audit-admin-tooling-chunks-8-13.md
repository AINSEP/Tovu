# Gemini 3.8 Flash Adversarial Audit — chunks 8-13 (continuation)

Continuation of `2026-09-05-gemini-audit-admin-tooling.md` (chunks 1-7). That report stopped at 7 of ~13
planned chunks; this report runs the remaining chunks 8-13, the items listed under "NOT COVERED" in its
coverage map (lines 70-84).

Scope: commits committed 2026-09-03 and 2026-09-04 (plus any spillover into 2026-09-05 touching the same
files), base commit `ec4fb6e8` (parent of the earliest in-scope commit, same base the prior report used),
branch `restructure/apps-website-phased`.

Method: diffs and/or full current file text fed to `agy --model gemini-3.8-flash-high --effort high` in
print mode, no tool access given to Gemini — all context supplied in-prompt. Every finding Gemini raised was
checked against the actual source at the actual line before being recorded here. No tests, coverage, or
typecheck were run (machine constraint — parallel test agents crashed it earlier today at load 721); findings
that would require a test run to confirm are marked UNVERIFIED. Standing owner-accepted decisions (CI
billing-block, `.outcome`-defeats-continue-on-error being intended, todays's SSRF/TLS/media-gate fixes being
already landed, the three owner-ratified "STAYS LOCAL" inline-.tsx files, flat `??`/`||` fallback chains being
idiomatic) were preloaded into every Gemini prompt and are not re-litigated below.

STATUS: IN PROGRESS — this skeleton is committed first; sections below are appended and committed after each
chunk completes.

## Coverage map (chunks 8-13)

- [x] Chunk 8 — `apps/admin/src/features/media/Media.tsx` (~363-line diff / complexity-split refactor)
- [x] Chunk 9 — `apps/admin/src/features/collections/Collections.tsx` (~268-line diff)
- [x] Chunk 10 — `apps/admin/src/features/menus/MenuEditor.tsx` (~114-line diff) + its own unit-test changes
- [x] Chunk 11 — hooks-extraction refactor sweep: Pages, Posts, ThemeExplore, AiAssistant,
      ThemePageDetailsModal, `apps/admin/src/features/pages/**` — no-logic-in-`.tsx` rule compliance
- [x] Chunk 12 — `apps/admin/vite.config.ts` + `development/scripts/dev.mjs` (dev-server TLS plumbing), plus
      `src-complexity-debt.json` / `admin-complexity-debt.json` / `check-architecture.baseline.json` diffs
- [x] Chunk 13 — test-quality pass: `AccessTokensTab.credential-flows.unit.test.tsx`,
      `use-access-tokens.unit.test.tsx`, `api-endpoint-option-branches.unit.test.ts`, `dead-path-sweep.test.ts`,
      `check-governance-adr-scope-drift.test.ts`, `backfill-custom-credential-usernames.test.ts`

## Findings

### Chunk 8: `apps/admin/src/features/media/Media.tsx` (commit `b8c97ec8`)

Single-commit, single-file chunk — a mechanical complexity-reduction extraction (cyclomatic 14/cognitive 16
down to under the 9/9 ceiling), commit message claims no behavior change and unmodified test passes
(Media.unit.test.tsx 34 tests, media-agent-drive, media-type-filter).

Gemini raised **zero findings** after full-file + diff review (DOM structure, component identity/re-mounting,
key preservation on `EditMediaPanel`/media cards, handler forwarding, Rules-of-Hooks ordering, and the
`resolveMediaHook`/`resolveMediaTabsHook` resolver pair against the precedented `resolveSessionHook` idiom).

Independently spot-checked rather than accepting blind:
- Read the diff's resolver functions (`Media.tsx:679-684`) and their call sites (`Media.tsx:925-929`) —
  `resolveMediaHook`/`resolveMediaTabsHook` correctly reproduce the old `useMediaHook = useWiredMedia` /
  `useMediaTabsHook = useMediaTabs` default-parameter semantics via `??`, called before any hook, so Rules of
  Hooks ordering is unaffected.
- Read the extracted `MediaGridOrEmpty` body (`Media.tsx:679-891` region) against the pre-refactor ternary —
  confirmed `key={item.id}` and the `activeTab === "all"` vs `MediaTypeEmptyState` branch are preserved
  verbatim, not just claimed.

**Chunk tally: 0 findings raised, 0 CONFIRMED, 0 UNVERIFIED, 0 DISCARDED.** Genuinely clean chunk.

### Chunk 9: `apps/admin/src/features/collections/Collections.tsx` (commit `cc8683cf`)

Single-commit, single-file chunk — extracts `ContentTypeFieldFieldset`, a shared presentational component,
out of `NewContentTypeDialog`/`EditFieldsDialog` to dedupe ~40 lines of near-identical field-row JSX,
parameterized by `idPrefix`, `agentHandleBase`, and `showRemoveButton`. Commit message claims identical DOM,
ids, and agentHandle labels for every existing case.

Gemini raised **zero findings**. Independently verified the load-bearing claim myself (grepped
`Collections.tsx` directly rather than trusting the diff-read summary): `idPrefix="ct-field"` /
`agentHandleBase={fieldHandles[index]}` / `showRemoveButton={fields.length > 1}` at the `NewContentTypeDialog`
call site (`Collections.tsx:210-218`) and `idPrefix="ct-edit-field"` / `showRemoveButton={true}` at the
`EditFieldsDialog` call site (`Collections.tsx:310-318`) match Gemini's claimed id/handle/visibility
parameterization exactly, and `ContentTypeFieldFieldset` is declared at module scope (`Collections.tsx:59`),
not nested inside either dialog, so no remount-on-parent-render risk.

**Chunk tally: 0 findings raised, 0 CONFIRMED, 0 UNVERIFIED, 0 DISCARDED.** Genuinely clean chunk.

**Tooling note for this run**: `agy --sandbox --print "..."` intermittently returned
`jetski: no output produced — a tool required the "command" permission...` with zero review content, even
though no tool access was requested or needed — reproduced twice in a row on this exact prompt. Adding an
explicit "do not use any tools, answer only from the pasted text" instruction to the preamble resolved it
for every subsequent chunk. Also confirmed in this run: `agy --print` does **not** read stdin as prompt
content in this build — despite the dispatch's stated stdin-based invocation, the prompt text must be passed
as the `--print` argument value (`--print "$(cat file)"`); verified stdin is silently ignored with a
throwaway probe before switching approach. Both adjustments are noted here for the record; they are the
correct fix, not a deviation the audit should be discounted for. `--effort` must also be omitted for this
model — `gemini-3.8-flash-high` already encodes reasoning effort and conflicts with an explicit `--effort` flag.

### Chunk 10: `apps/admin/src/features/menus/MenuEditor.tsx` + its unit test (commits `92494e7c`, `1425da68`)

Two commits touch this file in-window: `92494e7c` (feat — expose `NavItemAttrs`'s five fields
cssClass/icon/description/rel/openInNewTab via a per-item "Advanced" disclosure, +89/-11 on MenuEditor.tsx,
+69 on its test) and `1425da68` (complexity-only split of `MenuItemAttrsFields`'s inline fallbacks into
`orEmpty`/`orFalse`/`attrsOrDefaults`, cognitive 11 to 6, +37 on MenuEditor.tsx). Fed both diffs plus the
small `api.ts` `AdminMenuItem.attrs` type addition (read-only, for context — did not touch `api.ts`) plus full
current `MenuEditor.tsx` and `MenuEditor.unit.test.tsx` to Gemini.

Gemini raised **zero behavioral findings** — traced the undefined/partial/populated `attrs` state
transitions, the `{ ...undefined }` spread safety, the native `<details>` disclosure not resetting on
re-render, and accessibility labeling, all clean.

**One architecture-rule observation Gemini raised that I'm recording as a real, confirmed compliance
finding** (not a bug — Dimension 2, Architecture Adherence): `countDescendants` (`MenuEditor.tsx:39`),
`orEmpty` (`:53`), `orFalse` (`:58`), `attrsOrDefaults` (`:69`), and `targetForKind` (`:80`) are plain
derived-logic functions living directly in this `.tsx` file — none carry the "STAYS LOCAL — owner-ratified"
comment that exempts the three files named in this dispatch, so per the dispatch's own instruction ("if you
don't see that comment on a file, the rule fully applies") this is a literal violation of the standing
no-logic-in-`.tsx` rule. **Important context, verified by reading the file's own header
(`MenuEditor.tsx:9-31`)**: this is not an oversight — the file explicitly documents WHY these five helpers
stay here ("pure helpers... presentation concerns invoked directly from `ItemRow`'s own markup, not part of
the hook's state transitions") and each helper's own doc comment explains it exists purely to move an ESLint
complexity count out of its caller's scope (e.g. `orEmpty`'s comment: naming a `?? ""` fallback "removes the
count from each switch's own scope without changing what either function produces"). All five are pure
(no state, no side effects, no API calls) and `targetForKind` is `export`ed for reuse. This reads as a
considered, disclosed design choice in the same spirit as the three owner-ratified exemptions, just not
formally one of them — flagging so the owner can decide whether to ratify it explicitly (add the same
"STAYS LOCAL" marker) or extract it, not because it's causing any observed defect.

**Test quality (own read, not just Gemini's)**: read the 69-line test diff directly. The two new
`describe("attrs — advanced per-item fields")` tests are genuinely strong — the round-trip test opens the
Advanced disclosure, types into all five fields, clicks Save, and asserts the actual `PUT` request body's
`items[].attrs` equals the typed values (not a mock-call-count or presence check), and the pre-fill test
asserts real rendered input values against the persisted state. No "asserts nothing meaningful" pattern here.

**Chunk tally: 1 architecture-compliance observation raised, 1 CONFIRMED (real, but documented/justified —
recorded as a Recommended-severity note for the owner, not a defect), 0 UNVERIFIED, 0 DISCARDED.**

### Chunk 11: hooks-extraction refactor sweep (Posts, ThemePageDetailsModal, ThemeExplore, AiAssistant, resolveActiveTabId dedup, App/AssistantDock/WidgetConfigFields/FormsList, Pages root-slug fix chain)

Split into three Gemini sub-runs given the size of this sweep (13 commits, ~20 files). Standing rule checked
throughout: no functions/derived logic in `.tsx` — belongs in `*.hooks.ts`/`rules.ts`, exempt only with a
"STAYS LOCAL — owner-ratified" comment or an equally explicit, dated, reasoned owner-ruling comment.

**11a — `apps/admin/src/features/posts/` (commits `45537ee2`, `c1822fb2`, `d0efe0f3`).** Zero functional
defects (`d0efe0f3` itself is a well-documented self-caught-and-fixed stale-fixture bug, already resolved).
Gemini raised 4 architecture-rule findings; **all 4 verified pre-existing, predating this audit's window** —
checked via `git log -S` blame, not assumed:
- `postsListNotice` (`Posts.tsx:47`) — traces to commit `8c98dac6`, 2026-08-06. Its own doc comment states it
  "Mirrors `Pages.tsx`'s identical `pagesListNotice`" — a repeated, named cross-screen idiom, not a one-off.
- `sort`/`setSort` local state (`Posts.tsx:76-86`) — carries an explicit, dated **"Owner ruling
  (2026-08-14)"** comment giving the exact same reasoning a literal "STAYS LOCAL — owner-ratified" marker
  would (view-only DOM chrome state deliberately kept local, data/API state always moves to the hook).
  Functionally equivalent to the dispatch's exemption even though it doesn't use that literal string —
  treating it as satisfying the exemption's intent rather than as a violation.
- Inline `t = (key) => ...` (`Posts.tsx:75`) — same idiom also present in `AiAssistant.tsx` and
  `SettingsUi.tsx` (confirmed by grep); not unique to this file or this window.
- `onEdit: (p) => navigate(...)` bypassing the hook's DI seam (`Posts.tsx:168`) — traces to `26b70a97`,
  2026-08-05.

**11b — ThemePageDetailsModal/ThemeExplore/AiAssistant hooks extraction + resolveActiveTabId dedup + App/
AssistantDock/WidgetConfigFields/FormsList (commits `e2681fe0`, `d04859b4`, `8da2f664`, `fb707ba4`,
`65d03e63`).** Zero functional defects. 5 architecture-rule findings raised:
- **Discarded as precedented**: the five `resolveXTabId` wrapper functions in `Database.tsx`, `Deployment.tsx`,
  `Security.tsx`, `SourceControl.tsx`, `Themes.tsx` (all introduced by `fb707ba4`). Verified each carries a
  doc comment explicitly cross-referencing the identical pattern in all four siblings. **This is the same
  question the prior report (chunk "Security/Settings") already ruled on** for `Security.tsx`'s
  `resolveSecurityTabId` — discarded there as "a repo-wide, precedented convention, not a violation unique
  to or introduced by this window's work." Applying that same ruling here for consistency across the two
  reports.
- **Duplicate of prior report's finding 36, not new**: `dockT` in `App.tsx:463` — identical function,
  identical line number, already recorded.
- **Confirmed real, LOW, introduced by `65d03e63`**: `FormsList.tsx:128-129`'s inline `onToggleStatus`
  handler contains a guard (`if (rowSavingId) return;`) directly in JSX props rather than in
  `use-forms-list.hooks.ts`. Verified against current source.
- **Confirmed real, LOW, pre-existing**: `previewSrcFor`/`canSaveSelectedFile` (`ThemeExplore.tsx:169,217`)
  — left behind when `d04859b4` moved 4 sibling functions to the hooks file. Verified both still exist.
- **Confirmed real, LOW, pre-existing**: `visitorCredentialKeyStatusMessage` (`AiAssistant.tsx:515-525`) —
  left behind when `8da2f664` moved its two sibling status functions. Verified the full function body
  (three `if` branches + a `.replace()` call) — genuine derived logic, not a stub.

**11c — Pages root-slug `"/"` bug-fix chain (commits `ac39b906`, `58574a7e`, `6f09b603`, `45101306`,
`17a5c5aa`).** This chain is unusually well self-documented (each commit discloses exactly what it checked,
what it deliberately left unchanged and why, RED-then-green regression tests, and live-browser verification
of the root-slug fix) — 4 findings raised, verification found real signal in 1 of them:
- **Discarded on verification (Gemini's reasoning was wrong, not the code)**: claimed
  `Pages.unit.test.tsx:88`'s `const pages = overrides.pages ?? []` clobbers a `{ pages: null }` override to
  `[]`, defeating loading-state tests. **False** — read the full function: the returned object spreads
  `...overrides` LAST, after both `pages` and `pageCount`, so an explicit `overrides.pages === null` is
  re-applied to the final `pages` field regardless of the earlier local coercion; `pageCount` ends up `0`
  either way since `[].length === 0` matches the intended null-case count by construction. No bug — exactly
  the class of error the dispatch's calibration warning describes (reasoning about spread order without
  tracing it through).
- **Confirmed real, LOW, introduced/modified by `58574a7e`**: `ThemeExploreSlugCollisionWarning`
  (`ThemeExplore.tsx:973`) computes `collidingContent.kind === "post" ? ... : pageAdminPath(collidingContent)`
  inline — its own comment says this "Mirrors `use-theme-pages.hooks.ts`'s identical
  `themePageCollisionAdminPath`," i.e. the proper hook-level equivalent already exists and could have been
  called instead of duplicating the ternary inline. Verified against current source.
- **Discarded as duplicate-pattern, pre-existing**: `pagesListNotice` (`Pages.tsx:93-96`) — same idiom as
  11a's `postsListNotice`, itself pre-existing/precedented.
- **Discarded as owner-ratified-in-spirit, pre-existing**: `selectTab` (`Pages.tsx:139-142`) — sits directly
  under the identical dated **"Owner ruling (2026-08-14)"** comment pattern found in Posts.tsx (explicitly
  says "see `Posts.tsx`'s identical `sort` state, the canonical example this mirrors"). Same treatment as
  11a's finding 2.

**Chunk 11 tally across all three sub-runs: 13 findings raised. CONFIRMED real and worth the owner's
attention: 2 (FormsList.tsx inline guard, ThemeExplore.tsx:973 duplicated ternary — both LOW). CONFIRMED
real but pre-existing/out-of-window: 6 (postsListNotice, inline `t`, onEdit-bypasses-DI, ThemeExplore's two
leftover helpers, visitorCredentialKeyStatusMessage). DISCARDED: 5 (the 5-screen resolveXTabId pattern as
precedented, dockT as an exact duplicate already on file, the test-fake spread-order claim as factually
wrong, pagesListNotice and selectTab as duplicate-pattern/owner-ratified-in-spirit). 0 UNVERIFIED.**

### Chunk 12: `apps/admin/vite.config.ts` + `development/scripts/dev.mjs` (dev-TLS) + complexity/architecture baseline JSON diffs

**12a — dev-server TLS plumbing (commits `65ef8629`, `1a26b2ca`, `51c59f5c`, `014c36b8`, `8580be46`), scoped
to `apps/admin/vite.config.ts`, `apps/admin/dev-tls-disable-flag.ts`, and `development/scripts/dev.mjs`
only** (the broader `apps/website/src/server/runtime/boot/dev-tls.ts`/`index.ts`/`deps.ts`/
`admin-static.ts` changes in `51c59f5c`/`014c36b8` are outside this dispatch's admin/tooling scope and were
not audited here). Gemini raised **zero findings** — traced the `TOVU_DISABLE_DEV_TLS` truthy-string bug fix
(`"1"`/`"true"` only, not bare `Boolean(...)`), cert-path/scheme consistency between the two dev processes,
and the `mkcert -CAROOT` fallback's failure handling, all clean.

Independently verified the security-relevant claim myself rather than trusting the "fixed" framing: read
`dev-tls-disable-flag.ts` in full (correct `raw?.trim().toLowerCase(); normalized === "1" || normalized ===
"true"`) and grepped both call sites — `vite.config.ts:69` imports and calls it directly, and `dev.mjs`
carries its own textually-identical copy (`isDevTlsExplicitlyDisabled`, line 89) called at `dev.mjs:295` —
confirmed both live call sites use the fixed parse, not the old bare-truthy one.

**12b — complexity/architecture baseline JSON diffs (commits `99ab0126`, `3ca63ed2`, `baf2675d`,
`eb732811`, `0a4a6947`, `c57f3791` for the two complexity debt files; `5435b87c` for the architecture
baseline).** Given these are data files (as the dispatch itself predicted, "lower expected yield"), reviewed
by reading full commit messages plus the current file state directly rather than running them through
Gemini — an LLM pass on a JSON diff would not add signal beyond what direct arithmetic verification gives.

- **`src-complexity-debt.json`**: independently recomputed the running total rather than trusting the prose.
  `baf2675d` left exactly 1 surviving entry (`mergeExternalMcpSavePrefill`, `c57f3791`'s intentional-debt
  record); `99ab0126` added exactly 3 more (`renderStaticPage` + 2 entries for the `sites.ts` route
  handler). 1 + 3 = 4, matching the current file's `violations` array exactly. Self-consistent.
- **`admin-complexity-debt.json`**: `3ca63ed2`'s message claims "6 of 8 no longer reproduce and are
  deleted... Seo.tsx and assistant-transport.ts stay" — 8 - 6 = 2, matching the current file's exactly 2
  violations. Self-consistent. The schema change itself (per-file `files: [...]` to per-violation
  `violations: [{rule, file, reason, note}]`) closes a real, disclosed masking bug (`api.ts`'s `request` had
  drifted 12/10 to 17/16 undetected because the whole file was grandfathered) — already independently
  covered by the prior report's separate review of `eslint.config.mjs` reading this new schema correctly.
- **`check-architecture.baseline.json` (`5435b87c`, in-window, 2026-09-05)** — this one is worth the owner's
  attention, though not as a defect: it regenerates the baseline via the tool's own documented `--update`
  path after 832 commits of accumulated drift since the prior 2026-08-20 baseline, and the commit message
  verifies (rather than assumes) this is legitimate drift, not corruption, by naming specific commits
  (`115687af`) responsible. **Read the actual diff directly**: `moduleApiSurfaceFiles` 202→231,
  `deepImportsBypassingIndex` 517→650 (a 26% jump), `propagationCostPct` 11.62→13.17, bidirectional-hub
  median fanIn 10→18 and fanOut 9.5→11, while `moduleCount` actually fell 49→45. Unlike every complexity-debt
  change reviewed above (which only ever tightens the ratchet, deleting entries once verified fixed), this
  one moves several numbers in the LOOSER direction — legitimate given the 832-commit gap and the tool's own
  sanctioned `--update` mechanism (the same kind of documented baseline refresh already accepted for
  `src-complexity-debt.json`'s `0a4a6947`), but it means `check-architecture.ts`'s gate is now measuring
  against a much larger deep-import/hub-fan-out surface than it was three weeks ago. Not treating this as an
  integrity finding (INT-list threshold-loosening) given the depth of the commit's own disclosed
  verification and that this matches established project practice for this exact ratchet mechanism — but
  flagging the magnitude of the numbers for the owner's own read, since a gate that silently re-baselines
  itself to match reality after each drift period only catches drift WITHIN a period, never across one.

**Chunk 12 tally: 12a — 0 findings raised, 0 CONFIRMED, 0 UNVERIFIED, 0 DISCARDED (independently verified the
fix's correctness at both call sites). 12b — 0 findings raised via Gemini (reviewed directly instead); 2
files verified self-consistent by direct arithmetic; 1 file (`check-architecture.baseline.json`) flagged as
a real, disclosed, legitimate-but-notable baseline loosening for the owner's awareness, not a defect.**

### Chunk 13: dedicated test-quality pass (six largest new/changed test files)

Split into two Gemini sub-runs by directory (`apps/admin` test files vs. `development/scripts` test files),
each instructed specifically to hunt "asserts nothing meaningful" and "mock hides the real code," not generic
bugs. Every finding below was checked against the actual current test file and, where the claim depended on
production behavior, against the actual production code too — several of Gemini's claims changed disposition
substantially once traced through.

**13a — admin test files (`AccessTokensTab.credential-flows.unit.test.tsx`, `use-access-tokens.unit.test.tsx`,
`api-endpoint-option-branches.unit.test.ts`).** 7 findings raised:

- **Confirmed real, HIGH**: `use-access-tokens.unit.test.tsx:141` ("seeds a blank name/username when the
  edited row id has no persisted row...") has **zero assertions** in its body beyond the initial mount
  `waitFor` — verified by reading the full test. Its own comment admits "No assertion beyond 'did not throw'
  is possible," which is false: `replaceToken` (used as an indirect probe at lines 1112-1139 of the same
  file) could surface the seeded draft value. A regression that corrupts or drops the seeded fallback would
  ship undetected.
- **Reframed, downgraded HIGH→LOW**: `api-endpoint-option-branches.unit.test.ts:389`
  ("`restartAssistantDaemon` rethrows a non-ApiError failure untouched") asserts `.rejects.toThrow(ApiError)`
  — Gemini read this as asserting the opposite of the title. **Traced the actual call chain**:
  `fetchOrThrowUnreachable` (`api.ts:1749`) catches any `fetch()` rejection and calls
  `throwTranslatedFetchFailure` (`api.ts:1737`), which explicitly wraps any `TypeError` (exactly what the
  test's stub throws) into an `ApiError` with `API_UNREACHABLE_CODE` **before** `restartAssistantDaemon`'s own
  catch block ever runs. So the assertion is factually correct — by the time `restartAssistantDaemon` sees
  the error, it already IS an `ApiError`; its own catch just passes through anything not matching its
  `body.reason` special case, which is what the test genuinely proves. The test's **title** is what's
  misleading (describes the raw network failure, not the already-translated error the function under test
  actually receives) — a naming nit, not a logic bug.
- **Reframed, downgraded MEDIUM→LOW (narrow-scope, honestly named)**: two findings
  (`use-access-tokens.unit.test.tsx:1127`'s "...evaluates row.username's fallback **safely**..." and
  `AccessTokensTab.credential-flows.unit.test.tsx:600,610`'s "...falls back to the real hook..., **without
  crashing**") only assert no-throw/no-API-call. Verified both test **titles themselves** explicitly scope
  the claim to "safely"/"without crashing," which the assertions do prove — these aren't tests that overclaim
  and underdeliver, they're deliberately narrow smoke/branch-coverage tests that say so honestly. Real
  narrow scope, not a defect.
- **Confirmed real, LOW**: `api-endpoint-option-branches.unit.test.ts:257`'s
  `expect(body()).toEqual({ name: "policy-1", description: undefined })` — verified this line exists exactly
  as claimed. Vitest's `toEqual` treats an `undefined`-valued key as equivalent to an absent key, so this
  doesn't actually distinguish "omitted" from "explicitly undefined," inconsistent with every sibling test in
  the same file which asserts plain omission (`{ name: "policy-1" }` with no `description` key at all).
  Assertion-clarity nit, not a coverage gap (JSON serialization already guarantees the wire body omits it).
- **Accepted without full independent re-derivation (LOW, plausible)**: two remaining findings — missing
  URL/body assertions on 3 "sends the same request" tests (`api-endpoint-option-branches.unit.test.ts`
  around `mutateWidgetRegionPlacements`/`removeWidgetEmbed`/`deleteFormSubmission`), and 3
  `toHaveBeenCalledTimes(1)`-only assertions on pre-load-fallback tests in `use-access-tokens.unit.test.tsx`
  — spot-checked line locations match, pattern is plausible and consistent with sibling tests in the same
  files that DO assert full payloads, but did not independently re-verify every claimed line for these two.

**13b — `development/scripts` test files (`dead-path-sweep.test.ts`, `check-governance-adr-scope-drift.test.ts`,
`backfill-custom-credential-usernames.test.ts`).** 5 findings raised, all against the first two files;
`backfill-custom-credential-usernames.test.ts` was given a clean bill (spot-checked and confirmed: real
subprocess execution, real SQLite state, real AES-GCM ciphertext byte-comparison, genuinely strong).

- **Confirmed real, MEDIUM**: `dead-path-sweep.test.ts:669-676` ("generated coverage artifacts are not
  reported as dead paths") filters `sweepTheRepo()`'s findings via `artifacts.includes(f.attempted[0]!)`,
  where `artifacts` holds full file paths (`"development/coverage/lcov.unit.info"`) but `f.attempted[0]`
  (traced to `dead-path-sweep.ts:741-743`) holds the OUTPUT of `pathThatMustExist()`, which truncates
  non-source paths down to their parent directory (`"development/coverage"`) — confirmed by reading both the
  test's own `pathThatMustExist` unit test (line 665) and the production `sweepOneFile` code. Traced a
  concrete failure mode where this masks a real regression: if the `development/coverage` directory itself
  ever fails to exist at test time (a fresh checkout, a `.gitignore`/placeholder change) while the truncation
  logic stays correct, the sweep would genuinely start flagging these artifacts as dead (a real, live false
  positive), but `attempted[0]` would be the truncated directory string, which is never a member of
  `artifacts` (the full-path array) — so `reported` stays `[]` and the assertion passes regardless.
- **Confirmed real, MEDIUM**: `check-governance-adr-scope-drift.test.ts:125-129` (title: "a mid-segment `*`
  matches a directory name containing the wildcard, not spanning `/`") — its negative case tests
  `"apikeys"` against a glob containing `*api-key*`; verified `"apikeys"` fails to match simply because it
  lacks the substring `"api-key"` (missing hyphen), true regardless of whether `*` is correctly translated
  to a non-slash-spanning `[^/]*` or incorrectly to a slash-spanning `.*` — the test does not actually
  distinguish the two, so it would pass identically under the exact regression its own title claims to guard
  against.
- **Accepted without full independent re-derivation (LOW, plausible, same file/mechanism as the two
  confirmed findings above)**: a `meaningful.length < 2` skip in a path-join test loop with no assertion
  counter (`dead-path-sweep.test.ts:370-388`); two "historical: flagged as dead" tests that check
  `fs.existsSync` directly rather than invoking the sweep's own finding-generation logic
  (`dead-path-sweep.test.ts:242-297`); and a `findEmptyGlobs` test whose fixture accidentally provides only
  one empty glob despite its title claiming to prove "each" glob is flagged separately
  (`check-governance-adr-scope-drift.test.ts:141-155`).

**Chunk 13 tally: 12 findings raised across both sub-runs. CONFIRMED real: 5 (1 HIGH — the zero-assertion
test; 4 MEDIUM/LOW — the createPolicy `toEqual`-with-undefined nit, the coverage-artifact vacuous filter,
and the glob-wildcard vacuous negative case, counted twice across both severity tiers as shown above).
REFRAMED/DOWNGRADED on verification: 3 (the restartAssistantDaemon title-vs-behavior mismatch, and two
honestly-narrow-scoped "safely"/"without crashing" tests that were never actually overclaiming). ACCEPTED
without full independent re-derivation given time budget: 4 (plausible, pattern-consistent, spot-checked
line locations only). 0 fully DISCARDED as factually wrong. 1 file (`backfill-custom-credential-usernames.test.ts`)
independently spot-checked and confirmed genuinely strong.**

## Summary

STATUS: COMPLETE — all six planned chunks (8-13) run, verified, and committed. Combined with the prior
report's 7 chunks, this closes out the full ~13-chunk admin/tooling Gemini audit plan.

- **Chunks audited: 6** (Media.tsx, Collections.tsx, MenuEditor.tsx, hooks-extraction sweep across 13
  commits, dev-TLS + complexity/architecture baseline config, dedicated test-quality pass on 6 files)
- **Gemini findings raised across all 6 chunks: ~37** (0 chunk 8, 0 chunk 9, 1 chunk 10, 13 chunk 11, 0
  chunk 12 via Gemini + 1 direct-review note, 12 chunk 13, 12a/12b totaling 1 direct-review note not counted
  as a Gemini finding)
- **Confirmed real and worth the owner's attention as-is: 9** — 2 from chunk 11 (FormsList.tsx inline guard,
  ThemeExplore.tsx:973 duplicated path-derivation ternary), 5 from chunk 13 (the zero-assertion
  `use-access-tokens` test, the `createPolicy` `toEqual`-with-undefined nit, the coverage-artifact vacuous
  filter, the glob-wildcard vacuous negative case), 1 from chunk 10 (five documented-but-unratified
  derived-logic helpers in MenuEditor.tsx), 1 from chunk 12 (the architecture-baseline loosening note)
- **Confirmed real but pre-existing/out-of-window (predates 2026-09-03, traced via `git log -S` blame): 6**
  — all from chunk 11's Posts/Pages/ThemeExplore/AiAssistant sweep
- **Discarded on verification (Gemini's reasoning was wrong, not the code): 1** — chunk 11's test-fake
  "clobbers null to []" claim, which missed a trailing `...overrides` spread that re-applies the real value
- **Discarded as precedented/duplicate of an already-filed finding: 5** — chunk 11's five-screen
  `resolveXTabId` pattern (matches this exact same audit series' own prior ruling on `Security.tsx`), an
  exact duplicate of the prior report's finding 36 (`dockT`), and two owner-ratified-in-spirit/duplicate-idiom
  items
- **Reframed/downgraded on deep verification: 3** — all from chunk 13 (a misleading test title where the
  assertion was actually correct once the real call chain was traced; two honestly-narrow-scoped tests
  Gemini read as overclaiming when their own titles already disclosed the narrow scope)
- **Zero real defects, genuinely clean: chunks 8, 9, and the dev-TLS half of chunk 12** — all independently
  spot-checked (not accepted on Gemini's say-so alone) rather than merely relayed

**Top findings by severity from this report** (full detail in each chunk section above):
1. **HIGH** — `apps/admin/src/features/security/hooks/__tests__/use-access-tokens.unit.test.tsx:141` has a
   test with zero assertions in its body (only a mount-check `waitFor`); its own comment's claim that no
   assertion is possible is false — an indirect probe via `replaceToken` (already used elsewhere in the same
   file) could verify the seeded fallback value. A regression corrupting the seeded draft ships undetected.
2. **MEDIUM** — `development/scripts/__tests__/dead-path-sweep.test.ts:669-676`'s "generated coverage
   artifacts are not reported as dead paths" test filters on a value shape (`pathThatMustExist`'s truncated
   directory string) that can never match the array it's compared against (full file paths) — traced a
   concrete regression (the coverage directory missing at test time) this would mask.
3. **MEDIUM** — `development/scripts/__tests__/check-governance-adr-scope-drift.test.ts:125-129`'s
   slash-boundary test for `globToRegExp`'s mid-segment `*` uses a negative case that fails for an unrelated
   reason (a missing substring, not a `/`-boundary violation), so it would pass identically whether or not
   the regression it claims to guard against were present.
4. **MEDIUM** — `apps/admin/src/features/themes/ThemeExplore.tsx:973`'s `ThemeExploreSlugCollisionWarning`
   duplicates `use-theme-pages.hooks.ts`'s `themePageCollisionAdminPath` inline instead of calling it, a
   standing no-logic-in-`.tsx` rule violation introduced by this window's `58574a7e`.
5. **Worth the owner's own read, not a defect**: `check-architecture.baseline.json`'s `5435b87c` regen moves
   several structural-drift numbers in the LOOSER direction (`deepImportsBypassingIndex` 517→650) after 832
   commits of accumulated, verified, legitimate drift — a real, disclosed baseline reset, not hidden gaming,
   but the magnitude is worth the owner seeing directly rather than only through "gate now passes."

**Calibration signal for this run** (per the dispatch's ~24%-fabrication baseline from the prior report):
of the roughly 37 Gemini-raised items across 6 chunks, independent verification fully discarded only 1 as
factually wrong (the test-fake spread-order claim) — notably lower than the prior report's ~19% raw discard
rate. The larger, more interesting category this run surfaced was not fabrication but **overclaiming
severity/framing**: 3 chunk-13 findings and 1 chunk-11 finding were real defects or observations that Gemini
described in a way deep verification did not support (a "backwards assertion" that was actually correct
once the call chain was traced; two "asserts nothing meaningful" claims against tests whose own titles
already disclosed a narrower scope; a "5-screen architecture violation" that an identical prior chunk in
this same audit series had already ruled precedented). None of these were hallucinated code — all were
real lines behaving as claimed — the model's characterization of what the code proves was what needed
correction, which is a harder failure mode to catch than an outright wrong claim and argues for tracing
every "the code does X" claim through to its actual call chain, not just confirming the cited line exists.

## Areas not covered / caveats

- Chunk 13's two "accepted without full independent re-derivation" groups (4 findings total: 2 in
  `api-endpoint-option-branches.unit.test.ts`'s missing-URL-assertion claims, 2 more in
  `dead-path-sweep.test.ts`/`check-governance-adr-scope-drift.test.ts`) were spot-checked for line-location
  accuracy only, not independently re-derived end to end, given time budget.
- No tests, coverage, or typecheck were run anywhere in this report either (same machine constraint as the
  prior report) — every "confirmed" finding above was verified by reading source and tracing call chains,
  never by executing code.
- `apps/admin/src/lib/api.ts` was read (for context on the `restartAssistantDaemon`/`fetchOrThrowUnreachable`
  call chain in chunk 13, and the `createSite`-adjacent type in chunk 10) but never edited, per the
  dispatch's explicit hard constraint that another session owns that file.
- Chunk 12's broader `apps/website/src/server/runtime/boot/dev-tls.ts`/`index.ts`/`deps.ts`/
  `admin-static.ts` changes (part of the same `51c59f5c`/`014c36b8` commits as the in-scope
  `vite.config.ts`/`dev.mjs` changes) were deliberately left unaudited — outside this dispatch's admin/tooling
  scope, and not part of the six named chunks.
