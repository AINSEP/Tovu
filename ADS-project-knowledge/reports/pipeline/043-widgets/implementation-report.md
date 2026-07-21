# Implementation Report: widgets (SPEC-043)

- Spec: SPEC-043 v1.0.0 | ADR: ADR-047 (debate-cleared 2026-07-21, audit still owed)
- Base commit: `03a8781` (Add widgets domain: ADR-047 debate fold-in, spec, outline, TDD suite + implementation)
- This report covers: verification of `03a8781`'s unverified final edit, and the four disclosed
  implementation-gap decisions that commit's own file-header comments left open.
- Author: Claude Sonnet 5, interactive session, 2026-07-21 (a scheduled cloud task was dispatched
  for this same work ~10 hours earlier; it fired but left no trace on the remote — no persisted
  session, no commit, no branch, no PR — so this work was redone from scratch against the identical
  task prompt, recovered from the trigger record).

---

## Step 1 — Baseline verification

Fresh `npm run typecheck` (clean) and `npm test`, run twice to rule out flakiness:

| Run | Total | Pass | Fail |
|---|---|---|---|
| 1 | 1734 | 1732 | 2 |
| 2 (rerun) | 1734 | 1732 | 2 |

Both runs failed on exactly the same two tests, unrelated to widgets and confirmed untouched by
`03a8781` (`git show --stat` on that commit has no `redirect`/`seo` paths):
- `src/server/__tests__/routes/redirects-site-serving.test.ts` — `T041/INV-03`
- `src/server/__tests__/routes/seo-site-serving.test.ts` — `T045`

**The previously-unverified `AC-29/REQ-42` widgets test now passes**, and I confirmed it's a real
pass, not a vacuous one: it creates a widget instance, places it into a live region via
`bindWidgetArea`/`mutateWidgetAreaPlacements`, then asserts `purgeWidgetInstance({ force: false })`
rejects with `WidgetReferencedError` — genuinely exercising `write-service.ts`'s reference-gate logic
against a real referencing placement, not a mock.

**Fix applied:** `write-service.ts`'s file-header comment still described the *pre-fix* state of this
test ("FLAGGED... Left failing and reported, not silently patched around"), which is now stale and
misleading — the test was rewritten and passes. Corrected the comment to describe the actual current
state (`src/widgets/write-service.ts` lines 10–18).

No other changes were needed. Baseline is: **1734 tests, 1732 passing, 2 pre-existing unrelated
failures, typecheck clean.**

---

## Step 2 — The four disclosed gaps: decisions

All four gaps were already accurately disclosed inline in the code by the prior implementation
session. I independently verified each claim against the actual current source (not just the
comments) before deciding. In every case the underlying reason is the same shape: the gap lives in a
**shared module outside this feature's scope** (`features/entries/*`, `src/navigation/resolver.ts`),
which this task was explicitly directed not to edit, and which every other content type in the system
(posts, menus, forms, redirects, SEO, comments, …) also depends on. Per this project's standing rule
("fix upstream intent, don't patch around it — route to the owning stage") and the Programmer
guardrail against out-of-scope structural changes, my decision for all four is: **do not edit the
shared module now; log each as named, disclosed technical debt with a specific recommended fix**, for
whoever owns that module's next change (Software Architect / a small dedicated ADR amendment, not a
unilateral patch from inside a widgets dispatch).

### 1. Storage envelope: `fieldsJson.ext.site.payload` instead of `fields.ext.widget.*` — most consequential

**Verified:** `features/entries/field-validation.ts` (`validateFieldsAgainstSchema`,
`selectVisibleEntryFields`) hardcodes the literal namespace `ext.site` — there is no per-content-type
owner parameter anywhere in that file. This directly contradicts ADR-022 §2's documented
`fields.ext.{owner}.*` promise; it was never actually built for the generic entries system, only for
`navigation`'s separate, pre-generic-entries `menus` table. `features/entries/write-service.ts`'s
`updateEntry` also only accepts `title`/`fieldsJson` — no `bodyJson` — confirming widget config
(which must be updatable, REQ-05) had no home in `bodyJson` either.

**Decision: log as technical debt, do not extend `field-validation.ts` now.** This is the biggest of
the four gaps — it's a real, confirmed hole in core infrastructure other features may also hit, not
just widgets — and deserves its own ADR-022 correction (e.g., let a content-type registration declare
its own `ext` owner key, defaulting existing types to `site` for backward compatibility with already-
stored data) rather than a special-case fix bolted on under a widgets task. **Flagging this prominently
per the original instruction: this is worth a dedicated Software Architect pass, not a footnote.**

Current behavior (JSON-serialize the real config into one required `payload` text field under
`ext.site`) is schema-valid, fully round-trips, and every widgets test passes against it — functional,
just not literally spec-shaped. `src/widgets/entry-payload.ts`'s header already documents this in
detail.

### 2. `entry_refs` extraction is not same-transaction with the triggering write (INV-06)

**Verified:** `createEntry`/`updateEntry` in `features/entries/write-service.ts` wrap `save` +
`appendRevision` in one `deps.entryRepo.transaction(async () => {...})` block with no parameter or
hook for additional same-transaction work. There is no way to run `entry_refs` extraction inside that
transaction without changing that function's signature.

**Decision: log as a known limitation, not a same-session fix.** The narrow fix is real and low-risk
in isolation — an optional `onWritten?: (entry) => Promise<void>` callback invoked inside the existing
transaction block, additive and behavior-preserving for every other caller — but it's still a change
to the one chokepoint every content type in this system writes through, and this task's scope
(inherited from the original dispatch and still true) excludes editing `features/entries/*`. This
should land as its own small, reviewed change once someone owns it, not as a side effect of a widgets
dispatch. **Practical exposure:** a crash between the entry write committing and the immediately-
following extraction call would leave that one write's `entry_refs` rows stale until the entry's next
write — a narrow window, not zero risk, and a genuine (if minor) INV-06 violation as currently built.

### 3. `purgeWidgetInstance` has no true hard-delete

**Verified:** `EntryRepoPort` (`features/entries/write-service.ts`) exposes exactly
`findBySlug`/`findById`/`save`/`appendRevision`/`transaction` — no delete/remove method anywhere, for
any content type in this codebase.

**Decision: not actually a gap against the certified spec — re-read REQ-43 in full.** REQ-43 only
requires that force-purge "flags any dangling references it creates rather than silently leaving them
unresolved," not literal physical row deletion. The current implementation marks the instance
permanently `trash` via the real chokepoint; every resolver/where-used consumer already treats a
trashed target as unavailable and renders the REQ-28 failure placeholder (EC-07), which *is* the
"flag." This also matches a real, deliberate pattern already used elsewhere in this codebase — Forms
definitions are "never deleted, only `active`⇄`disabled`" (ADR-047 Amendment 4) — so the absence of
hard-delete looks like house style, not an oversight. Adding a hard-delete primitive to the shared
`EntryRepoPort` would be a system-wide architectural decision (does *any* content type get real
physical deletion, ever, given every other invariant in this codebase — revisions, `entry_refs`,
outbox events — assumes an entry id stays resolvable forever?), squarely a Software Architect/ADR
call, not something to add unilaterally here.

**One real, minor, disclosed observable gap:** `trash` and `force-purge` currently produce
byte-identical entry state (`status: 'trash'` either way) — there is no way to tell from stored state
alone whether an instance was merely trashed or force-purged past a known reference. Nothing in the
certified spec requires that distinction; noting it as low-priority tech debt in case it becomes
operationally relevant later (e.g. a distinct `purged` status).

### 4. `menu` widget resolver doesn't re-resolve hrefs

**Verified:** `navigation/resolver.ts` exports only `resolveForLocation` (location-scoped, not
by-menu-id). The actual href-walking functions, `resolveItemList`/`resolveItem`, are module-private.
There is no menu-id-scoped entry point to get real, resolved hrefs from `navigation`'s existing code.
No test in this TDD suite exercises the `menu` widget resolver's real output shape (confirmed —
nothing under `src/widgets/__tests__/` references `createMenuResolver`/`resolvers/menu`), so this gap
is currently silent rather than a failing/skipped test.

**Decision: log as a known limitation — the narrowest and cheapest of the four to eventually fix.**
The `menu` widget type currently passes the menu's raw, unresolved item tree through as IR props
verbatim (real delegation to `navigation`'s data via `getMenu`, just without href resolution). The
recommended fix — export `resolveItemList`/`resolveItem` (or add one new thin wrapper) from
`navigation/resolver.ts` — is a pure, stateless, behavior-preserving addition for every existing
`navigation` caller, genuinely the lowest-risk of the four shared-module touches described here. Still
deferred, per this task's scope and because `navigation/` has its own owner, but worth flagging as the
one a future small PR could close quickly. Impact is scoped to the `menu` widget type only — Text,
Social Links, Recent Entries, and Contact Form are unaffected.

---

## Step 3 — Domain layer status and next-step decision

Per the original directive's stated default for an unattended/handoff run, and because nothing found
above changes that calculus (if anything, the four confirmed shared-module gaps reinforce that
architect-level input is needed before more surface is built on top): **stopping here.** The domain
layer is solid — full suite clean at 1732/1734 (2 pre-existing, unrelated failures), typecheck clean,
the one previously-unverified test confirmed genuinely passing, all four disclosed gaps independently
re-verified against real source and given an explicit decision rather than left ambiguous.

**Not started:** the routes/UI/AI-tools slice (`src/server/routes/admin/widgets/*`,
`apps/admin/src/sections/WidgetsLibrary.tsx`/`WidgetPlacement.tsx`, the TipTap `widgetEmbed` editor
extension) — no tests exist for it yet and it needs its own TDD pass first, per this project's
Test-First discipline. Also not started: `/audit-work` — explicitly gated behind an owner decision per
this project's standing rule, not run here.

**Recommended next steps, owner's call:**
1. Decide whether to proceed to the routes/UI/AI-tools slice (own TDD pass first) or go straight to
   `/audit-work` on the domain layer as it stands.
2. Decide whether gap #1 (the `ext.site` envelope hole) warrants a scoped ADR-022 amendment now or
   stays logged debt — this is the one most likely to resurface for other features, not just widgets.
3. Gaps #2 and #4 are small, well-scoped, low-risk follow-ups whenever `features/entries/` or
   `navigation/` next gets a maintenance pass; #3 needs no action, just awareness.

## Step 4 — Owner-directed follow-up: all four gaps fixed (2026-07-21, same session)

After the above was committed (`c946bbc`) and pushed, the owner reviewed the four decisions and
directed all four be fixed now rather than left as logged debt. Done in order of increasing risk,
typecheck + the relevant suite run after each, full suite run twice at the end to confirm no
regression and rule out flakiness.

**Gap 4 — menu resolver hrefs (fixed).** Added `resolveMenuDoc` as a new exported entry point in
`navigation/resolver.ts` (the doc-level building block `resolveForLocation` itself now composes on
top of, via a refactor — `resolveItemList`/`resolveItem` stay private, existing `navigation` tests
unaffected, all 53 still pass). Rewired `widgets/resolvers/menu.ts` to call it with an injectable
`resolveTargetHref` (defaults to an honestly-documented placeholder, since `src/routing`/ADR-039 has
no real implementation anywhere in this codebase yet — not even `navigation`'s own production callers
have one today). Net effect: `url`-kind menu targets now resolve to real `href`/`available`/`isActive`
data instead of a raw, unresolved `NavTarget` object being passed through as IR props (which was
itself a quiet violation of ADR-020 §6/§7's "theme receives resolved data" boundary, not just an
aesthetic gap). `entryRef`/`termRef`/`route` targets still resolve to `available: false` — the same
honest gap every other caller in this system has today, not a widgets-specific worse one. Added
`src/widgets/__tests__/unit/resolvers-menu.unit.test.ts` (2 new tests, both passing).

**Gap 3 — purge vs. trash distinguishability (fixed).** Added `"purged"` to `WidgetInstanceStatus`
(`widgets/types.ts`). `purgeWidgetInstance` now writes `status: "purged"` instead of `status: "trash"`;
every place that previously checked `status === "trash"` for availability (`resolver-service.ts`'s
resolution skip, `region-area-service.ts`'s placement-target validation) now checks both. No hard-delete
was added to `EntryRepoPort` — per the report's original finding, that's a system-wide house-style
question (no content type in this codebase hard-deletes), not something to bolt on for widgets alone.

**Gap 2 — `entry_refs` same-transaction extraction, INV-06 (fixed).** Added an optional
`onWritten?: (entry) => Promise<void>` hook to `features/entries/write-service.ts`'s
`CreateEntryRequired`/`ExistingEntryTransitionDeps`, invoked inside the existing
`entryRepo.transaction()` block after `save`/`appendRevision` (SQLite's adapter does a real
`BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`, so a failure here now genuinely rolls back the whole write, not
a best-effort follow-up call). Purely additive — every other caller of `createEntry`/`updateEntry`
across the codebase (posts, pages, forms, redirects, SEO, comments, …) omits it and is unaffected;
confirmed via a full-suite run (1734 pass, same 2 pre-existing unrelated failures, before and after).
`widgets/write-service.ts` and `widgets/region-area-service.ts` now pass their `entry_refs` extractor
as this hook instead of calling it as a separate statement after the write returns.

**Gap 1 — `ext.site` envelope hardcoding (fixed, the biggest one).**
`features/entries/field-validation.ts`'s `validateFieldsAgainstSchema` now takes an optional `owner`
parameter (default `"site"`) instead of hardcoding the literal `site` key — every existing caller that
omits it keeps byte-identical behavior (all 6 SPEC-020 certified tests in
`field-validation.unit.test.ts` pass unchanged, including the exact envelope-violation error-message
text). `createEntry`/`updateEntry` gained a matching optional `input.owner`, threaded through to
validation. Widgets now writes under `fields.ext.widget.*` for instances and `fields.ext.widgets.*` for
`widget_area` entries (`WIDGET_FIELD_NAMESPACE`/`WIDGET_AREA_FIELD_NAMESPACE` — both constants already
existed in `widgets/types.ts`, previously unused for this purpose), matching REQ-01/REQ-11's literal
namespacing instead of a shared `site` bag. `selectVisibleEntryFields` was deliberately left untouched
— it has no production caller anywhere in this codebase today, so widening it now would be
speculative; extend it the same way once a real caller needs a non-`site` read projection.

**Still not changed, and correctly so:** the config/doc payload is still one JSON-serialized string in
a single required `payload` field under the new owner namespace, not exploded into individual
generic-entries fields. That's independent of the namespace bug — a widget instance's `config` shape
is polymorphic per `widgetType` (declared in `registry.ts`), and the generic entries fixed-field-list
schema genuinely cannot express "shape varies by widget type" regardless of which `ext` owner it
validates under; widgets already runs its own `validateWidgetConfig` (REQ-02) against the real
per-type schema before this layer ever sees the data. Also unchanged: `widget_area`'s `placements`
still live in `fieldsJson` rather than `bodyJson.placements` as REQ-11 literally describes, because
`updateEntry` still has no parameter to change `bodyJson` after creation — a separate, larger gap this
session's scope didn't include and wasn't asked to fix.

**Verification:** typecheck clean throughout; full suite run twice after all four fixes landed —
**1736 tests, 1734 pass, 2 fail (the same pre-existing, unrelated redirects/SEO failures)**, stable
across both runs.

## Commit

Two commits on top of `03a8781`:
1. `c946bbc` — the `write-service.ts` header-comment fix, baseline verification, and this report's
   original (Steps 1–3) content. Pushed to `origin/main` on explicit request.
2. A second commit containing all four gap fixes described in Step 4 above, plus this report update.
   Push status: see conversation / handoff for the latest word — confirm before assuming pushed.
