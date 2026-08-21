# e2e timing-fragility sweep — `development/e2e/` (54 spec files)

Generated 2026-08-21 · Branch `general-work`

## Ask

Inventory `development/e2e/`'s 54 `.spec.ts` files for the same dangerous shape a prior sweep found
and fixed in the unit suite: **a test whose assertion cannot distinguish which path ran** — a bare
`waitForTimeout` used as the entire wait mechanism, a `waitFor`/`expect.poll` condition satisfied by
both the pass and fail states, or an assertion on a value that is identical before and after the
thing under test. Inventory only — no fixes, no test runs against the live suite (a killed Playwright
run leaves a child bound to the port; next run dies `EADDRINUSE` and looks like a flake).

## Method

Read-only. No Playwright run was started. Two passes:

1. **Grep sweep, all 54 files**, for every arbitrary-time or weak-condition mechanism this suite
   uses at all: `waitForTimeout`, `expect.poll`, `.waitFor({ state: ... })`, `.toPass(`,
   `waitForFunction`, a bare `new Promise((resolve) => setTimeout(resolve, N))`, `networkidle`, and
   custom `sleep`/`delay`/`pause` helpers (none exist — grep for those returned nothing, so
   `waitForTimeout` plus the two bare-`setTimeout` sites are the suite's *complete* inventory of
   arbitrary-time waits).
2. **Manual read** of every call site that pass 1 flagged, checking what assertion (if any) follows
   the wait and whether it can distinguish the regression the test is named for from the passing
   case.

28 of 54 files matched at least one pattern; all 28 were opened and read at the flagged call sites
(not skimmed). The other 26 had zero matches for any of the above — their waits are exclusively
Playwright's own auto-retrying `expect(locator).toX()`/`page.waitForResponse()`/`page.waitForURL()`
forms, which are not bare timeouts and carry their own real condition.

## Finding: no instance of the dangerous shape

Every `waitForTimeout` in this suite (20 call sites, 14 files) is a **documented settle window**
immediately followed by a real, discriminating assertion — never the sole basis for pass/fail. The
two bare `setTimeout`-in-`Promise` sites (`a2ui-transport-contract.spec.ts`,
`surface-resilience.spec.ts`) are both inside a documented daemon-readiness poll loop in
`beforeAll`, not a test assertion. Every `expect.poll`/`.toPass(`/`waitForFunction` site sampled
polls a real mechanism (request counts, captured payload bytes, server-side state via a follow-up
API call, `document.fonts.status`) rather than a value both the pass and fail path would produce.
`state: "attached"` (weaker than `"visible"`, found in 6 files) is always paired with a follow-up
measurement (e.g. `naturalWidth`) that only a genuinely-loaded element satisfies — a broken/blank
image would fail that check even though it was "attached." `networkidle` appears only in code
*comments* explaining why it is deliberately avoided (confirmed dead-end against this app per
existing project memory); zero real usages.

This suite is unusually disciplined about exactly this risk: several files carry an inline comment
naming the specific danger ("no UI signal to poll on," "genuinely temporal — there is no event to
wait for, because the property being proven is that nothing further happens," "checking the same
race produces the same (empty) outcome, not a different one") and then show the assertion that makes
the wait safe anyway (a bounded margin against a measured failure rate, e.g. "~2.5s against a bug
measured at ~11 navigations in 6s," or a check on a mechanism that would visibly differ under the
regression).

## One borderline pattern worth naming, not flagging as broken

`byok-credential-persistence.spec.ts`'s cross-tab race test asserts `afterTabBSave` is `null` — the
**same** value (`null`) the test asserted for `afterTabASave` one step earlier. Superficially this
matches "identical before/after." It is not actually vacuous: the property under test is "the API
key must never reach localStorage, under any interleaving," so `null` at *every* checkpoint is the
correct passing shape by construction, not evidence of two states collapsing together — a real
regression (key leaking) would flip either checkpoint non-null, and the test also greps the raw value
for the literal typed key as a second, independent check. The file's own comment already discloses
that the pre-ADR-058 version of this test asserted the *opposite* invariant. Documenting this here
because it is the closest thing found to the named pattern, not because it needs a fix.

## What was not covered

The 26 unflagged files were not read line-by-line beyond the grep sweep — they had no arbitrary-time
or weak-condition construct to inspect, so a full manual read would only be re-confirming that
`expect(locator).toBeVisible()`-style Playwright assertions are self-discriminating, which is true by
construction of the API. If a fragile test exists in this suite, it is more likely a *timing-margin*
problem (a settle window too short for a slow CI box, producing an intermittent false failure) than
the *structural* problem asked about here (an assertion with zero discriminating power) — those are
different bug classes and this sweep was scoped to the latter, per the assignment.

## Verdict

**No fixes filed.** Inventory found no test in this suite whose assertion cannot distinguish the
pass case from the fail case. The suite's discipline here appears to be a deliberate, repo-wide
convention (the `networkidle`-avoidance comment is copy-pasted near-verbatim across 5 unrelated
files), not an accident of which files happened to get reviewed carefully.
