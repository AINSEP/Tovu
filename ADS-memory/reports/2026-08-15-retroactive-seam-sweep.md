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

## Running tally (this sweep)

2/2 defaulted-dependency files checked (1 carried over from the prior report, 1 new). Both PROVEN.
0 findings so far in the defaulted-dep priority tier.

Continuing to the required-param bulk (the 22-file candidate list minus the 2 already covered
above and the off-limits/concurrent files) once team lead confirms or adjusts scope.
