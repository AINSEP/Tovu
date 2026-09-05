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
- [ ] Chunk 13 — test-quality pass: `AccessTokensTab.credential-flows.unit.test.tsx`,
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

## Summary

(filled in once all chunks complete)
