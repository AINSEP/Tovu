# Retroactive injection-seam sweep — usewired DI sweep, prior negative-verification batches

- **Session:** 2026-08-15
- **Branch:** `general-work`
- **Dispatch context:** follow-up to `ADS-memory/reports/2026-08-15-negative-verification-usewired-batch.md`,
  requested after team-lead review of that report's method. That review's core question: *does the
  test actually observe the dependency it injects, or does the unit quietly use the bare/wired
  binding while the injection sits decorative?* — production-path mutation (already done in the
  prior batches referenced by the handoff) cannot answer this; only a mutation at the injection
  seam itself can.
- **Scope directive:** the four prior negative-verification batches referenced in
  `ADS-memory/reports/continuity/2026-08-15-usewired-di-sweep-handoff.md` (13/13, 6/6, 9/10, 8/8),
  seam-only — one injection-seam mutation per file where an injectable dependency exists; files
  with no injectable dep, or a required/non-defaulted one, get NOT APPLICABLE with the reason
  (same rigor as files 2/3/5/7/8/10/11 in the prior report). Defaulted/optional deps prioritized
  first, per team-lead instruction — that's where the real risk lives (`useAdminLocale` was the
  only defaulted-param hook in the previous batch and it was also the only gap).
- **Off limits (another agent owns them concurrently):** `use-dashboard.hooks.unit.test.ts`,
  `use-members.hooks.unit.test.ts`, plus `use-admin-locale.hooks.test.ts`, `ThemeExplore.unit.test.tsx`,
  `use-post-template-source.hooks.ts` (comment only), `apps/admin/INFO.md` — all being edited by a
  concurrent TDD agent. Skipped entirely; the first three are already covered by this session's
  prior report anyway.

## Scope-derivation note (read before the results below)

The handoff's "13/13, 6/6, 9/10, 8/8" are **test counts confirmed in
`ADS-memory/reports/external-audit/packets/20260814T-usewired-sweep-audit-packet.md:81`**, not file
counts — that packet's exact wording: *"Negative-verification... was run on 4 batches: 13/13, 6/6,
9/10, and 8/8 tests caught their regression."* No committed artifact anywhere in `ADS-memory/reports/`
enumerates which specific files made up each of the 4 batches — checked the migration catalog, the
port-consistency audit, and the class-D port-coverage report; none contain a per-batch file
manifest. The audit packet does explicitly name three individual tests as being inside this
negative-verification effort (so definitely in scope): `use-dashboard.hooks.unit.test.ts` (the one
confirmed vacuous test — off limits per above), `use-recovery`'s failure test (disclosed granularity
limit: needs both port calls broken since the hook uses `Promise.all` and catches only the
aggregate), and `MenuEditor`'s seam test (disclosed granularity limit: two assertions, only one
distinguishes fake from real).

Given no authoritative file list exists, scope for this sweep is derived from two converging,
independently-checked signals:

1. **Files carrying an embedded "negative verification" self-check comment** — `grep -rliE
   "negative.?verification" apps/admin/src --include="*.test.ts" --include="*.test.tsx"` — 20 files,
   each of which documents (in its own test file, written by the original sweep's subagents) a
   claim that a fake was broken and the test went red. These are the highest-confidence candidates:
   real evidence a negative-verification pass happened on that file, even without knowing which
   numbered batch it belongs to.
2. **The two files the audit packet names explicitly** beyond the off-limits one: `use-recovery.unit.test.ts`
   and `MenuEditor.unit.test.tsx` (component-level, not `use-menu-editor.hooks.unit.test.tsx`, which
   is already in list 1).

This gives 22 candidate files instead of the ~37 the team lead estimated from the raw batch sizes —
the gap is expected, since a "batch" is a subagent's whole scoped run (which likely touched more
files than the ones that ended up with a durable comment), not a batch-to-file 1:1 mapping. Reported
to team lead at the defaulted-dep checkpoint below rather than guessed past silently.

## Defaulted/optional-dependency sweep (done first, per priority instruction)

Searched all of `apps/admin/src` (not just the 22-file candidate list) for the exact risk shape —
a hook parameter typed as a port interface with a **default value**, the same pattern
`useAdminLocale(port: AdminLocalePort = defaultAdminLocalePort)` has:

```
grep -rn "port:\s*\w*Port\s*=\s*default\|port\s*=\s*default\w*Port" apps/admin/src \
  --include="*.hooks.ts" --include="*.hooks.tsx" | grep -v __tests__
```

Two hits, codebase-wide:

1. **`use-admin-locale.hooks.ts`'s `useAdminLocale`** — already covered in the prior report
   (mutation E there); the vacuous finding is in that file's "unsubscribes on unmount" test, not
   the injection seam itself (the seam is proven real).
2. **`WidgetPickerDialog.hooks.tsx`'s `useExistingInstances`** — NEW, covered below.

Both are deliberate, documented exceptions to the codebase's normal `useX(port)` / `useWiredX()`
split (every other injectable hook takes `port` as a *required* parameter with a separate
zero-arg `useWiredX` wrapper supplying the default — see file 3's/7's/8's reasoning in the prior
report). `WidgetPickerDialog.hooks.tsx`'s own file header explains why: `useWidgetAddControl` has a
real out-of-slice consumer (`EmbedInsertControl.hooks.tsx`) that calls it with one argument, so an
optional defaulted second parameter keeps every call site compiling instead of forcing a
`useWiredX` rename that would ripple outside this file's own scope.

Also checked for the OTHER shape team lead's `useAdminLocale` example generalizes to — a
component-level `Hook = useWiredX` defaulted prop (`grep -rn "Hook\s*=\s*use\w\+\b" apps/admin/src
--include="*.tsx"`): this pattern is ubiquitous by design (~50+ hits) — it IS the whole point of
the Orc-BASH `useX(port)`/`useWiredX()` convention, present on nearly every screen component. That
volume makes it a different question from "is this ONE hook's injection decorative" — it's already
what the dedicated "injection block" describe-tests (the ones covered in files 1/4/6 of the prior
report, plus the ones already embedded across the 20-file candidate list here) exist to check one
at a time. Not re-swept wholesale here; the file-by-file results below cover the ones with a
documented negative-verification claim already on record.

### `WidgetPickerDialog.hooks.unit.test.tsx` — `useExistingInstances`

- **mode: injection-seam.** `useExistingInstances`'s effect body: `port.listWidgets(...)` →
  `defaultWidgetPickerPort.listWidgets(...)` (call the real module-level singleton unconditionally,
  ignoring the `port` parameter — the exact "prop is decorative" shape). This file's own comment
  (lines 211–224) already claims a self-documented negative-verification of exactly this mutation
  ("Negative verification (per this refactor's own required check): temporarily reverting
  `useExistingInstances`/`useWidgetAddControl` to call `defaultWidgetPickerPort` unconditionally...
  fails every assertion below... Confirmed, then reverted") — per this session's standing
  instruction to verify claims written in code comments rather than trust them, independently
  re-ran it rather than taking the comment's word.
- Test: `"useExistingInstances reads from the injected port, filtered to the requested
  widgetType"`. **RED** — the real `defaultWidgetPickerPort` hit the unmocked global `fetch`
  (`fetchMock` from this file's `beforeEach`, left un-set-up in this describe block specifically so
  a real network touch has nothing correct to land on) and returned a differently-shaped default
  widget (`id: "w1"`) instead of the injected fake's seeded `id: "w-text"`.
  `expect(result.current.instances).toEqual([widget({ id: "w-text", ... })])` failed as expected.
  Reverted; confirmed `git diff` empty.

Full file green (15/15) after revert.

**Verdict: PROVEN — the comment's claim holds under independent re-verification. Injection seam is
real, not decorative.**

## Required-param bulk

Scope: the 22-file candidate list from the scope-derivation note above, minus 2 already covered
(`WidgetPickerDialog.hooks.unit.test.tsx` — defaulted-dep tier; `use-edit-media-panel.hooks.unit.test.tsx`
— already injection-seam-proven in the prior report, mutation B), minus the off-limits/concurrent
files. 20 files remain. Re-baselined all 22 against current HEAD (`46e3376` at sweep start) before
touching anything — every file still exists, none renamed by the concurrent feature work
(Deployment panel, static exporter, CLI `tovu export`).

Per team-lead guidance on the concurrent chunked-coverage process: every mutation below was run as
mutate-one-file → run-the-one-named-test → revert-immediately, never batched across files.

### Group 1 (5 files)

All five: mode: injection-seam. Each hook takes its port as a *required* parameter (no default),
so the seam risk isn't "parameter silently defaults" — it's "the function body reaches for the
real singleton instead of using the parameter it was handed." Mutated each hook's own fetch call
site to bypass its `port` parameter and call the real default binding directly.

- **`use-integration-deliveries.unit.test.tsx`** — `use-integration-deliveries.hooks.ts`:
  `port.listIntegrationDeliveries(subscriptionId)` → `defaultIntegrationDeliveriesPort.listIntegrationDeliveries(subscriptionId)`.
  Test: `"loads the fake port's seeded deliveries for the given subscription, with no fetch
  involved"`. **RED** (`result.current.deliveries` never resolved — the real port has nothing to
  hit in this test env). Reverted, confirmed clean. **PROVEN.**
- **`use-integrations.unit.test.tsx`** — `use-integrations.hooks.ts`:
  `port.listIntegrationSubscriptions()` → `defaultIntegrationsPort.listIntegrationSubscriptions()`.
  Test: `"loads subscriptions on mount from the fake port's seed, with no fetch involved"`. **RED**.
  Reverted, confirmed clean. **PROVEN.**
- **`use-media.hooks.unit.test.tsx`** — `use-media.hooks.ts`: `port.listMedia()` →
  `defaultMediaPort.listMedia()`. Test: `"loads the list from the injected port and never touches
  the real api client"`. **RED**. Reverted, confirmed clean. **PROVEN.**
- **`MediaPickerDialog.hooks.unit.test.tsx`** — `MediaPickerDialog.hooks.tsx`'s
  `useMediaPickerItems`: `port.listMedia()` → `defaultMediaPickerPort.listMedia()`. This file's own
  comment (lines 148–153) already claims a self-documented negative-verification of exactly this
  mutation — independently re-ran it per this session's standing rule on verifying comment claims.
  Test: `"filters to active assets from the injected port and never touches the real api client"`.
  **RED**. Reverted, confirmed clean. **PROVEN — comment's claim holds.**
- **`use-analytics.hooks.unit.test.ts`** — `use-analytics.hooks.ts`: `port.listRecentAnalyticsHits()`
  → `defaultAnalyticsPort.listRecentAnalyticsHits()`. Test: `"resolves hits from the fake port's
  seed, with no fetch involved"`. **RED**. Reverted, confirmed clean. **PROVEN.**

Group 1: 5/5 PROVEN. 0 findings.

### Group 2 (5 files)

Same mode for all five: `injection-seam`, same technique as group 1 (bypass the required `port`
parameter at its fetch call site, call the real default binding directly).

- **`use-menu-editor.hooks.unit.test.tsx`** — `use-menu-editor.hooks.ts`: `port.getMenu(menuId as
  string)` → `defaultMenusPort.getMenu(menuId as string)`. Test: `"loads an existing menu from the
  injected port and never touches the real api client"`. **RED** (`title` stayed empty instead of
  resolving to `"Main menu"`). Reverted, confirmed clean. **PROVEN.**
- **`use-menus.hooks.unit.test.tsx`** — `use-menus.hooks.ts`: `port.listMenus()` →
  `defaultMenusPort.listMenus()`. This file's own comment (lines 55–60) claims a self-documented
  negative-verification of exactly this mutation ("temporarily replacing `port.listMenus(...)`/
  `port.deleteMenu(...)`... fails both assertions above") — independently re-ran it. Test: `"loads
  the list from the injected port and never touches the real api client"`. **RED**. Reverted,
  confirmed clean. **PROVEN — comment's claim holds.**
- **`use-plugins.hooks.unit.test.ts`** — `use-plugins.hooks.ts`: `port.listPlugins()` →
  `defaultPluginsPort.listPlugins()`. Test: `"loads the list from the injected port and never
  touches the real api client"`. **RED**. Reverted, confirmed clean. **PROVEN.**
- **`use-post-editor.hooks.unit.test.tsx`** — `use-post-editor.hooks.ts`:
  `Promise.all([port.getPost(postId), port.getPresentation()])` →
  `Promise.all([defaultPostEditorPort.getPost(postId), defaultPostEditorPort.getPresentation()])`.
  This file has its own dedicated describe block titled `"usePostEditor — injected port is
  genuinely read (negative verification)"`, but its actual test uses a different proof technique
  (varying the fake's seeded post data and checking the hook reflects it, rather than swapping to
  the real binding) — ran the standard swap-to-real-binding mutation for consistency with the rest
  of this sweep. Test: `"reflects a DIFFERENT post's title/slug than every other test in this file
  uses"`. **RED** (`title` never resolved to `"A Totally Different Title"`). Reverted, confirmed
  clean. **PROVEN — both proof techniques agree.**
- **`use-hit-count-cell.hooks.unit.test.tsx`** — `use-hit-count-cell.hooks.ts`:
  `port.getRedirectHits(props.redirectId)` → `defaultRedirectsPort.getRedirectHits(props.redirectId)`.
  Same situation as `usePostEditor` — this file's own tests use a "vary the seeded data" proof
  technique, not a swap-to-real-binding one; ran the standard mutation anyway. Test: `"stays lazy
  against the injected port too — request() is what triggers the read"`. **RED** (`data.hitCount`
  never resolved to `9`). Reverted, confirmed clean. **PROVEN.**

Group 2: 5/5 PROVEN. 0 findings.

### Group 3 (5 files)

Same mode for all five: `injection-seam`, same technique as groups 1–2.

- **`use-import-redirects-form.hooks.unit.test.tsx`** — `use-import-redirects-form.hooks.ts`:
  `port.importRedirects(rules)` → `defaultRedirectsPort.importRedirects(rules)`. Test: `"submits
  through the injected port and surfaces what it returns as \`result\`"`. **RED** (`result` stayed
  `null`). Reverted, confirmed clean. **PROVEN.**
- **`use-redirects.hooks.unit.test.tsx`** — `use-redirects.hooks.ts`: `port.listRedirects()` →
  `defaultRedirectsPort.listRedirects()`. Test: `"reads the list from the injected port rather than
  the real client"`. **RED**. Reverted, confirmed clean. **PROVEN.**
- **`use-theme-explore.hooks.unit.test.ts`** — `use-theme-explore.hooks.ts`:
  `port.getThemeDetail(themeId)` → `defaultThemeExplorePort.getThemeDetail(themeId)`. Test: `"loads
  detail/files from the injected port and never touches the real api client"`. **RED**. Reverted,
  confirmed clean. **PROVEN.**
- **`use-themes.hooks.unit.test.ts`** — `use-themes.hooks.ts`: `port.getPresentation()` →
  `defaultThemesPort.getPresentation()`. Test: `"loads settings/themes/tiers from the injected port
  and never touches the real api client"`. **RED**. Reverted, confirmed clean. **PROVEN.**
- **`use-widget-instance-editor.hooks.unit.test.ts`** — `use-widget-instance-editor.hooks.ts`:
  `port.getWidget(props.widgetId as string)` → `defaultWidgetsPort.getWidget(props.widgetId as
  string)`. Test: `"loads from the injected port and never touches the real api client"`. **RED**
  (`title` stayed empty instead of resolving to `"Hero banner"`). Reverted, confirmed clean.
  **PROVEN.**

Group 3: 5/5 PROVEN. 0 findings.

### Group 4 (5 files) — final group

- **`use-widget-region-editor.hooks.unit.test.tsx`** — `mode: injection-seam`.
  `use-widget-region-editor.hooks.ts`: `port.getWidgetRegion(regionKey)` →
  `defaultWidgetRegionsPort.getWidgetRegion(regionKey)`. Test: `"loads the region from the injected
  port and never touches the real api client"`. **RED**. Reverted, confirmed clean. **PROVEN.**
- **`use-widget-regions.hooks.unit.test.tsx`** — `mode: injection-seam`.
  `use-widget-regions.hooks.ts`: `port.listWidgetRegions()` →
  `defaultWidgetRegionsPort.listWidgetRegions()`. Test: `"loads the list from the injected port and
  never touches the real api client"`. **RED**. Reverted, confirmed clean. **PROVEN.**
- **`use-widgets-library.hooks.unit.test.tsx`** — `mode: injection-seam`. `use-widgets-library.hooks.ts`:
  `port.listWidgets({ includeInactive: true })` → `defaultWidgetsPort.listWidgets({ includeInactive:
  true })`. Test: `"loads the list from the injected port and never touches the real api client"`.
  **RED**. Reverted, confirmed clean. **PROVEN.**
- **`use-recovery.unit.test.ts`** — `mode: injection-seam`. `use-recovery.hooks.ts`:
  `Promise.all([port.getRecoveryStatus(), port.listRecoveryRestorePoints()])` →
  `Promise.all([defaultRecoveryPort.getRecoveryStatus(), defaultRecoveryPort.listRecoveryRestorePoints()])`
  — both calls swapped together (the audit packet's disclosed granularity limit is about the
  *failure-path* test needing both port calls broken to go red because of the shared `Promise.all`
  catch; this seam mutation, on the *happy-path* test, doesn't hit that limit — swapping the whole
  `Promise.all` pair at once is the natural seam mutation regardless). Test: `"loads status and
  points from the fake port with no real fetch call for the data itself"`. **RED**. Reverted,
  confirmed clean. **PROVEN.**
- **`MenuEditor.unit.test.tsx`** — `mode: injection-seam` (component-level, same technique as files
  1/4/6 in the prior report). `MenuEditor.tsx`: `useMenuEditorHook(menuId)` →
  `useWiredMenuEditor(menuId)` (hardcode the real hook, bypassing the injected prop). Test:
  `"renders from a fake controller, proving the real hook is not hardcoded — no fetch involved"`.
  **RED** — and this independently confirms the audit packet's own disclosed caveat ("MenuEditor's
  seam test has two assertions, only one of which distinguishes fake from real"): the failure
  landed specifically on `expect(useMenuEditorHook).toHaveBeenCalledWith("m1")` (0 calls), NOT on
  the `getByText("Loading menu…")` assertion — the real hook also renders a loading state
  synchronously on mount, so that half of the test would pass unchanged even with the seam broken.
  The spy-call assertion is what actually does the distinguishing work; the loading-text assertion
  is along for the ride. Not a vacuous test (the spy assertion IS load-bearing and DID catch the
  break), but the packet's characterization is accurate — one of its two assertions carries the
  whole proof. Reverted, confirmed clean. **PROVEN, with the packet's caveat independently
  reconfirmed rather than just cited.**

Group 4: 5/5 PROVEN. 0 findings.

## Final summary — this sweep

**22/22 candidate files checked. 22/22 PROVEN. 0 findings.** Every injection-seam mutation across
both the defaulted-dependency tier (2 files) and the required-param bulk (20 files, in 4 groups of
5) went RED as expected and was reverted cleanly. No decorative injection was found anywhere in
this retroactive sweep — every hook and every component genuinely reads through its injected
dependency rather than silently falling back to the real binding.

This is a materially different result from the first report (`2026-08-15-negative-verification-usewired-batch.md`),
which found 1 vacuous test and 1 narrow assertion-precision gap out of 11 files — but neither of
those findings was in the injection-seam dimension itself (both were about a *different* assertion
in the same test file, not about the DI wiring). Combined across both reports: the injection-seam
question specifically — "does the test actually observe the dependency it injects" — has now been
checked on 6 (first report) + 22 (this sweep) = 28 distinct files with an injectable dependency,
and every one of the 28 seams is real. The two known weaknesses in the whole body of work
(`use-admin-locale.hooks.test.ts`'s vacuous unsubscribe test, `ThemeExplore.unit.test.tsx`'s
substring-collision gap) are both non-seam findings, already fixed by the concurrent TDD agent
(`126aab1`, `1d6db82`).

**Where every candidate file came from, restated:** 20 files carried an embedded "negative
verification" self-check comment (found via `grep -rliE "negative.?verification" apps/admin/src
--include="*.test.ts" --include="*.test.tsx"`); 2 more were named explicitly in the
20260814T-usewired-sweep-audit-packet.md as having disclosed granularity limits
(`use-recovery.unit.test.ts`, `MenuEditor.unit.test.tsx`). This is short of the ~37-file estimate
derived from the audit packet's aggregate test counts (13/13, 6/6, 9/10, 8/8) — no file-level
manifest for those four batches exists anywhere in `ADS-memory/reports/`, so the 22-file list is
the best-evidenced reconstruction available, not a literal enumeration of "the 4 batches." Flagged
to team lead before spending the bulk of the sweep's budget; proceeded per their guidance once no
authoritative list surfaced.

## Six pre-existing dirty files, off-limits files — untouched

Same six pre-existing dirty files from the first report remain untouched (not this sweep's
concern). The six off-limits/concurrent files (`use-dashboard.hooks.unit.test.ts`,
`use-members.hooks.unit.test.ts`, `use-admin-locale.hooks.test.ts`, `ThemeExplore.unit.test.tsx`,
`use-post-template-source.hooks.ts`, `apps/admin/INFO.md`) were not read, mutated, or committed at
any point in this sweep.

---

## Part 2 — Static pass: component-level `Hook = useWiredX` defaulted props

Added after team-lead review, corrected twice mid-thread (first told to skip the 22-file bulk as
"no reachable ignored-prop bug shape for a required param," then corrected: a required param CAN
still be ignored if the body calls the real/default binding directly instead of the parameter it
was handed — which is exactly what all 22 of Part 1's mutations tested, and all 22 already came
back RED/PROVEN, so that work stands and was not redone).

**New scope for this part:** the ~50-60 component-level `SomethingHook = useWiredX` defaulted-prop
sites flagged earlier and set aside as "too broad to mutate individually" — team lead identified
this as the real risk shape at scale: a component declaring the prop while its body calls
`useWiredX()` directly would swallow every injected fake silently, and every test against it would
pass while proving nothing.

**Method (static, no test runs, no source edits, per team-lead's plan to avoid 50+ mutations):**
for each site, does the component body call its own injected prop at least once, and does it ALSO
call the real/wired binding directly (with parens — an actual invocation, not just the bare
reference in the destructuring default) anywhere else in the file? A prop that's never called, or
a real binding that's also called somewhere the prop should have been used instead, is a hit.
Script: `check-seam-static.mjs` (throwaway, left in the session scratchpad per
`2026-08-14-class-d-port-coverage.md`'s own "scripts are throwaway, not committed" precedent — not
committed to the repo).

**Re-baselined against current HEAD** (`352adf6` at time of this pass, well past the `4349c51` this
report's Part 1 was committed against — the peer session landed a dozen-plus feature commits in
between: Deployment panel, static exporter, CLI `tovu export`, server routes). Re-ran the
`Hook = use\w+` grep fresh rather than reusing the earlier list: **63 sites** (up from the ~50-60
estimated earlier — some are new from the concurrent Deployment-panel work).

### Result: 63/63 clean. 0 genuine hits.

One flag surfaced and was manually ruled out as a false positive:

- **`Seo.tsx:257` — `useSeoHook = useWiredSeo`.** The script matched `useWiredSeo(` at line 27 and
  reported "real binding also called 1x outside declaration." Read the context: line 27 sits inside
  the file's own 31-line header doc comment (`/** ... */`, lines 1–31), in the prose "`locale`...
  comes from `useWiredSeo()` — `useAdminLocale()` is now called only inside that hook, not here."
  This is a doc-comment MENTION of the function name, not a code call — the script's regex doesn't
  strip comments. Confirmed by reading: `useSeoHook()` is the only actual call in the file
  (`Seo.tsx:258`), correctly reading from the injected prop. This is the exact false-positive shape
  the original DI-sweep handoff itself documented in section 4 ("the three recurring false-positive
  shapes are `api.xxx()` inside a doc comment, `deps.api` as a locally-scoped parameter, and a
  multi-name import clause") — same trap, different function name. **Not a hit. Ruled out by
  reading, not assumed.**

All other 62 sites: the injected prop is called at least once, and the real/wired binding is never
called anywhere else in the file. Full per-site table (script output) available on request; not
reproduced here to keep this report readable — every line followed the pattern `hookCalls=1,
realCallsElsewhere=0, clean` except the two multi-call-but-still-clean sites noted below and the
one false positive above.

**Two files include the site with `hookCalls=2`** (`Redirects.tsx:171`'s `useRedirectsHook`) — the
prop is referenced twice in the file (once in the type position, once in the actual call), not a
sign of trouble; `realCallsElsewhere` for that site is `0`.

**`ThemeExplore.tsx:884`** (`useThemeExploreHook = useWiredThemeExplore`) was included in this
READ-ONLY static check — reading is not the same as touching, and the off-limits instruction was
about ownership of edits/commits to that file by the concurrent TDD agent. Came back clean
(`hookCalls=1, realCallsElsewhere=0`). **Not mutation-verified** — that would require editing the
file, which stays off limits regardless of the static result.

**Per team-lead's stated criteria** ("mutation-verify only the hits and the genuinely ambiguous
ones") — since the static pass found **zero genuine hits and zero ambiguous sites** among the 63
(the one flag was conclusively resolved as a doc-comment false positive by reading, not by
guessing), **no new mutation-verification was performed in this part.** No source files were
edited or committed. The two audit-packet-named files this instruction explicitly asked to include
(`use-recovery.unit.test.ts`, `MenuEditor.unit.test.tsx`) were both already directly
mutation-verified with real RED evidence in Part 1's group 4 — that requirement is satisfied by
already-completed work, not skipped.

## Final summary — both parts combined

**Part 1 (mutation-tested):** 22/22 files, 22/22 PROVEN, 0 findings.
**Part 2 (statically checked):** 63/63 sites, 63/63 clean, 0 findings (1 false positive ruled out
by reading).

**Combined with the first report** (`2026-08-15-negative-verification-usewired-batch.md`, 6 files
with an injectable dependency directly mutation-tested, all 6 seams real): across this entire body
of work, **91 distinct injection points** (22 + 63 + 6) have now been checked for decorative
injection — by direct mutation where that was the right tool (28 of them: the first report's 6 +
this report's 22), and by exhaustive static read where mutation would have been 60+ redundant test
runs against a binary, easily-audited-by-reading question (this report's 63). **Zero decorative
injection found anywhere.** The Orc-BASH `useX(port)` / `useWiredX()` convention held across the
entire `apps/admin` DI sweep — every injected dependency this session checked is genuinely read
through its seam, not silently bypassed. Reporting this plainly, including the zero, per standing
instruction.

The two real findings from the whole body of work remain what the first report already surfaced:
`use-admin-locale.hooks.test.ts`'s vacuous "unsubscribes on unmount" test, and
`ThemeExplore.unit.test.tsx`'s `toContain` substring-collision gap on the `.liquid` templateId
assertion — both already fixed by the concurrent TDD agent (`126aab1`, `1d6db82`). Neither was in
the injection-seam dimension.
