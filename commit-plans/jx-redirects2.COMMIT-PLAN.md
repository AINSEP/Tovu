# T07 redirect capacity

FIXES: open-bugs 2026-11-20 T07

Base: `26d5ddfdd15d2d1de22cf8e894eb8afd4da2056a` (`codex/jx-redirects2`).
Local changes only; no commits or pushes. No tests, builds, installs, type-checks,
linters, or mutations executed, as required by the dispatch.

## R1 — implemented for the specified create/update save cases; verification owed

Files:
- `packages/cms/src/redirects/resolver.ts`
- `packages/cms/src/redirects/redirects.ts`
- `packages/cms/src/redirects/__tests__/redirects.test.ts`

Export the existing `DYNAMIC_SET_LIMIT = 500` in place. The one new private
function, `requireWildcardCapacity`, accepts a single required object, skips
non-active/non-wildcard records, and reads at most 501 active wildcard records
for the workspace with `includeOverrideOnly: false`. An existing member does
not consume another slot. Otherwise, 500 existing members cause the prescribed
plain-message `RedirectValidationError` before persistence. Create/update
signatures and existing optional argument pads are unchanged.

Tests were written before production edits, using the existing memory repository:
- Create a 501st active wildcard: expect the exact validation message, unchanged
  stored rules, and no new revision. Expected RED before the fix because create
  previously saved the additional wildcard.
- Create an exact rule at 500 active wildcards: expect the exact record persisted.
  This is a compatibility control, expected GREEN before and after the fix.
- Activate an inactive wildcard at 500: expect the exact validation message,
  unchanged inactive record, and no revision. Expected RED before the fix because
  update previously activated and saved it.
- Edit an existing active wildcard among the 500: expect the active edited record
  persisted. This is a compatibility control, expected GREEN before and after.

Inactive wildcard creation is omitted per the coordinator ruling: create has no
status input and always creates active records. Status-changing updates exist,
so the activation refusal case is retained. Seeds mix override and ordinary
rules to count the full workspace set.

Mutations owed: remove the guard calls (or its capacity refusal); the create and
activation refusal tests must fail. Restore the implementation and rerun those
tests plus existing create/update tests. RED/GREEN results remain unmeasured.

API-baseline delta: newly exported `DYNAMIC_SET_LIMIT` from `resolver.ts`, value
500; no re-export shell or baseline artifact changed. The targeted pre-edit
symbol lookup found no external references. The prescribed resolver import-cycle
lookup returned no match.

Open scope item: `updateRedirect` already returns early for Trash entries through
`restoreTrashedRedirect`, before normal record persistence. The sheet's two
specified pre-save calls do not guard that separate restore path. It is unchanged;
coordinator follow-up is needed if Trash restoration must enforce this cap too.

`redirects.ts` and its existing test file exceed 500 lines; continue per the owner
correction. New helper: 13 lines, complexity below 10. Create/update remain below
50 lines and complexity 10 by manual inspection. Added operations are one bounded
repository read and a scan of at most 501 returned records; repository-internal
query costs are unchanged.

## R2 — implemented; verification and Chrome look owed

Files:
- `packages/admin/src/redirects/react/pages/RedirectsPage.tsx`
- `packages/admin/src/redirects/messages.en.ts`
- `packages/admin/src/redirects/react/__tests__/Redirects.unit.test.tsx`

The existing unfiltered `listRedirects({})` read provides all listed rules with
status, match type and pattern. Count active wildcard rows and render the exact
translated notice above the table only when the count exceeds 500. No endpoint,
port field, dependency, helper, or exported signature added. The page function
grows from 47 to 48 lines and stays within complexity 10 by manual inspection.
The count scans the already-loaded list once; no extra I/O.

One test, written before production edits, renders 501 active wildcard rules and
expects the notice, then remounts with 500 and expects no notice. The 501 assertion
is expected RED before the fix because no notice existed; the 500 assertion is
the compatibility boundary control. Execution remains owed.

API-baseline delta: none. Mutations owed: none specifically dispatched for R2.
Look owed: Chrome after combine, at 501 and 500 active wildcard rules. No Chrome
automation tool is exposed in this session; no browser verification was performed.

## Diff reread and handoff

Deletions at diff reread: none. No existing tests, assertions, optional pads,
comments, production behavior branches, or declarations removed or weakened.
Exactly four CMS tests and one admin test added; each added assertion carries a
plain-words message. Existing tests were preserved.

Reuse: R1 uses the resolver's existing cap, `repo.listDynamic`, and
`RedirectValidationError`; R2 uses the loaded list, existing notice styling and
translation dictionary. Discovery stayed in the dispatched redirects files and
their directly referenced contracts/fixtures.

Static architecture review: changes stay within existing CMS and admin owners;
no new ports, packages, dependencies, casts, or vendor/framework imports. No
executable validation is claimed. The existing Trash-restore bypass above remains
an explicit scope limitation. Count-before-save concurrency behavior was not
expanded beyond the requested query and pre-save check.

Function review: `requireWildcardCapacity` owns only capacity refusal; create and
update only add the required call; `RedirectsPage` adds only a list count and
notice. All assessed edited functions satisfy the stated size/complexity bounds
by inspection. Skepticism pass checked override inclusion, exact-rule exemption,
existing-member edits, error wording, persistence ordering and the 500/501 UI
boundary; runtime and mutation evidence remain owed.
