# Commerce nav section (Payments, Orders, Products, Subscriptions)

Dispatched as Programmer agent (`AI-Dev-Shop/agents/programmer/skills.md` loaded). Branch
`refactor/jini-admin-extraction`. Delivered in three passes: an initial three-entry Commerce section;
a follow-up correcting two brief errors and adding a fourth entry (Subscriptions) plus a
`soonPreviewable` policy change; and a third pass fixing a comment that understated how much less
built Subscriptions is than its siblings. All three directed by the team lead after reviewing the
prior pass.

## Final result

Commerce group, in order: **Payments, Orders, Products, Subscriptions**. All four render as
`soon: true, soonPreviewable: true` — real, clickable preview links, none disabled — because a
section with some rows clickable and others inert would read as a bug (owner's stated rationale).

## Files changed (across both passes)

- `apps/admin/src/panels.tsx` — moved the `payments` panel out of `People` into a new `Commerce`
  group (id/route/render/icon untouched, only `nav.group` and its comment changed); added three new
  panels: `orders`, `products`, `subscriptions`.
- `apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts` — extended with a `Commerce nav section`
  describe block (3 tests: exact order, Payments no longer under People, every entry previews as a
  real link).

No other files touched. `nav.ts`, `App.tsx`, and `Placeholder.tsx` needed no changes — `getNav()`
derives everything from `ADMIN_PANELS` automatically, and `Placeholder` resolves each new panel's
label through `getNav()` by `sectionId`, exactly as `skills`/`newsletter`/`design-system` already do.

## Corrections to the dispatch brief (pass one), confirmed by the team lead (pass two)

1. **Panel id**: the brief said Payments' existing panel id is `paypal`. It is actually
   `id: "payments"` — confirmed by reading `panels.tsx` directly, and independently confirmed by the
   team lead's own follow-up ("my extraction script misread a nested `PlaceholderTabs` tab id as the
   panel id"). Never renamed either way.
2. **Group order claim**: the brief stated the current group order is "Content, People, Marketing,
   Operations, Studio, Administration." The actual `ADMIN_PANELS` registration order (which is what
   `buildNav` uses for group order — see below) is **Content, People, Studio, Operations,
   Administration, Marketing**. Commerce was placed according to the real order.

## Group ordering — how `buildNav` decides it, and why Commerce sits where it does

Read `/Users/la/Programming/Jini/packages/admin/src/core/manifest/rules.ts` (not
`core/manifest/rules.ts` as the brief guessed — it's under `src/`). `buildNav`'s own doc comment
(`rules.ts:60-63`) states it plainly: "groups appear in the order their first member was registered
... with registration order as a stable tiebreak" for items within a group too. There is no explicit
group-priority list anywhere — array position in `ADMIN_PANELS` is the only source of truth for
group order, confirmed by the implementation (`groupOrder.push(key)` the first time a group key is
seen, `rules.ts:76-79`).

The `// --- Commerce ---` block (payments, orders, products, subscriptions, in that array order) sits
immediately after `// --- People ---` and before `// --- Studio ---`, so the resulting group order is:

```
Content, People, Commerce, Studio, Operations, Administration, Marketing
```

Reasoning: the `payments` panel's own prior comment (now rewritten — see below) had already
anticipated this exact move — "If a storefront surfaces later ... this and Orders likely move
together into a Commerce group." Commerce is core business-facing functionality, the same category
as Content and People, not a Studio/Operations/Administration tooling concern — so it reads more
naturally as a direct successor to People than tacked onto the end after Marketing. This is a
judgment call, not a spec-mandated position; if the owner wants a different slot, it's a one-block
move since group order is driven purely by where the block sits in the array. Not revisited in pass
two — the team lead's corrections didn't touch group placement.

## `soon` / `soonPreviewable` — how the decision changed between passes

**Pass one** (my own judgment call, since the brief left it open): Payments kept its existing
`soon: true, soonPreviewable: true` (real sub-tabs, Home/Stripe/PayPal). Orders and Products got
`soon: true` only, no `soonPreviewable`, matching `skills`/`newsletter`/`design-system` — the existing
precedent for a plain, unbuilt `Placeholder` entry with no named sub-integrations.

**Pass two** (owner override, relayed by the team lead): "All of these should be coming soon...
because they're obviously not active now" — settled as every Commerce entry getting
`soonPreviewable: true` to match Payments, specifically so the section doesn't read as some rows
clickable and others inert sitting right next to each other. I re-checked `AdminNavEntry.soonPreviewable`'s
actual semantics in `types.ts` before applying this: it only controls whether the *nav row* renders
as a real link vs. a disabled non-link — it says nothing about needing `PlaceholderTabs` specifically.
So Orders/Products/Subscriptions stay on the plain `Placeholder` component (no sub-tabs to preview)
and simply gained `soonPreviewable: true`, landing a click on the same "coming soon" body a disabled
row would have shown text for, just now reachable by URL and click.

## Subscriptions (new in pass two)

`member_tiers` and `member_subscriptions` are real tables (`src/platform/db/schema.sqlite.ts:466-506`, defined
immediately after the `members` table as part of the same membership feature) — verified both are
empty via direct query (`sqlite3 infra/content.db "SELECT count(*) FROM member_tiers"` → `0`, same for
`member_subscriptions`), and verified no admin route references either
(`grep -rl memberTiers|memberSubscriptions src/server/routes/admin/` → no matches). Same unbuilt state
as Orders/Products, so it gets the identical `soon: true, soonPreviewable: true` + plain `Placeholder`
treatment.

## Pass three — Subscriptions' comment overstated parity with Orders/Products

Pass two's comment for `subscriptions` read: "unbuilt in exactly the same way as Orders and
Products." The team lead flagged this as dishonest and asked for a precise comparison instead of an
assertion of sameness. Verified the actual gap before rewriting:

- **Products**: 3 seeded rows in `p_store__products`, a live public route
  (`src/server/routes/site/products.ts`), and a storefront theme actually rendering them.
- **Orders**: 0 rows in `p_store__orders`, but a real, wired path to get them —
  `store-plugin.ts`'s `checkout()` (an OCC-guarded stock decrement + order-row insert), called from
  `routes/site/store.ts`'s buy action. Unexercised, not unbuilt.
- **Subscriptions**: `member_tiers`/`member_subscriptions` have a full CRUD repo
  (`SqliteMemberTierRepo`/`SqliteMemberSubscriptionRepo` in `src/members/repo.sqlite.ts`), but
  `grep -rl` for their method names (`upsertMemberTier`, `listMemberTiers`,
  `upsertMemberSubscription`, `getMemberSubscription`) across `src/` outside that one file and its
  tests returns no hits — no route, plugin, or admin surface calls any of it. This is one level more
  speculative than Orders: not "hasn't happened yet on a working path" but "no reachable path exists
  yet at all."

Rewrote the `subscriptions` panel's comment to state this explicitly rather than imply parity with
its siblings. Comment-only change; re-ran the scoped suite (51/51 green, unchanged) and the build
(green) to confirm no regression, then committed by explicit path.

## Icons

- **Payments**: unchanged (card icon).
- **Orders**: a small document/receipt shape (`rect` + two inner lines) with a checkmark overlay in
  the bottom-right corner — same "icon + overlay mark" idiom `authentication`'s key-with-diagonal-
  strokes already establishes in this file.
- **Products**: an isometric box/package outline (hexagonal outer path + internal Y-seam) — the
  standard "package" pictogram.
- **Subscriptions**: two opposing curved arrows forming a refresh/cycle loop — the standard
  "recurring" pictogram, distinct from the other three.

All four use `viewBox 0 0 18 18`, `stroke=currentColor`, inline SVG inner markup, matching every
other entry in the file.

## The stale comment (pass two "BONUS" instruction)

The original `payments` panel comment predicted this exact reshuffle: "If a storefront surfaces
later ... this and Orders likely move together into a Commerce group — that is a reshuffle worth
doing once, when there is something to group, rather than pre-creating a one-row section now." Once
that reshuffle happened (pass one), the comment was stale. Rewrote it in present tense to also
disambiguate a new wrinkle Subscriptions introduces: `payments` is provider *configuration* (the
`lipay` plugin's Stripe/PayPal integrations), not the billing data itself — the `member_tiers`/
`member_subscriptions` tables it charges against are now their own `subscriptions` entry. Kept the
underlying "what belongs in Commerce vs. People" reasoning rather than deleting it.

## RED / GREEN evidence

**Pass one** — wrote 2 tests (exact 3-entry order, Payments removed from People), confirmed RED
against pre-change code via `git stash push -- src/panels.tsx`:
```
FAIL Commerce nav section > exists with exactly Payments, Orders, Products in that order
  AssertionError: expected undefined to be defined   (no Commerce group exists yet)
FAIL Commerce nav section > no longer lists Payments under People
  AssertionError: expected [ 'users', 'authentication', … ] to not include 'payments'
```
2 failed, 3 pre-existing passed. `git stash pop`, re-ran: 5/5 passed (GREEN).

**Pass two** — extended to 3 tests (4-entry order including Subscriptions, Payments removed from
People, every entry has both `soon`+`soonPreviewable` true), confirmed RED against the pass-one
committed state via the same stash technique:
```
FAIL Commerce nav section > exists with exactly Payments, Orders, Products, Subscriptions in that order
  AssertionError: expected [ 'payments', 'orders', 'products' ] to deeply equal [ ...4 items ]
FAIL Commerce nav section > every entry previews as a real link: soon + soonPreviewable both set
  AssertionError: expected undefined to be true
```
2 failed, 4 pre-existing (now including pass one's own 2) passed. `git stash pop`, re-ran: 6/6 passed
(GREEN).

Then the full scoped unit suite after each pass, per the owner's standing rule against full-suite runs:
```
cd apps/admin && npx vitest run src/__tests__/unit
Test Files  7 passed (7)
     Tests  51 passed (51)      (was 50 after pass one, now 51 after pass two's 3rd new test)
```

## Build

```
npm run admin:build
✓ 1160 modules transformed.
✓ built in 5.67s
```
Succeeds after both passes. The pre-existing "chunk larger than 500kB" warning is unrelated to this
change — it fires regardless of this diff, it's about overall `index-*.js` bundle size.

## Commits

Six commits total across three passes, each staged by explicit path only, never `-A`/`.`/`-a`. The
repo had (and still has) many unrelated modified/untracked files from other in-flight sessions
(`App.tsx`, `styles.css`, `src/assistant/**`, `development/evals/**`, etc.) — none touched by any of
them, verified via `git show --stat` after each:

```
commit 12cbce3 feat(admin): add Commerce nav section (Payments, Orders, Products)
 apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts | 18 +++++++
 apps/admin/src/panels.tsx                             | 58 +++++++++++++++++-----
 2 files changed, 64 insertions(+), 12 deletions(-)

commit 9bee6cc docs(findings): Commerce nav section report
 development/findings/commerce-nav-section.md | 183 +++++++++++++++++++++++++++
 1 file changed, 183 insertions(+)

commit 55acb66 fix(admin): add Subscriptions to Commerce, match Payments' soonPreviewable
 apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts | 18 ++++++++-
 apps/admin/src/panels.tsx                             | 43 ++++++++++++++++------
 2 files changed, 47 insertions(+), 14 deletions(-)

commit 0e44226 docs(findings): update Commerce nav report for pass-two corrections
 development/findings/commerce-nav-section.md | 229 +++++++++++++++++--------
 1 file changed, 138 insertions(+), 91 deletions(-)

commit 30a044e fix(admin): stop implying parity between Subscriptions and Orders/Products
 apps/admin/src/panels.tsx | 15 +++++++++++----
 1 file changed, 11 insertions(+), 4 deletions(-)

commit <this doc's own commit> docs(findings): pass-three update
 development/findings/commerce-nav-section.md | ...
```

Each `git show --stat` confirms exactly the intended files and no others.

## Architecture Audit

**Status: PASS.**

- ADR rule checked: `nav.ts`'s file header — "presence in the nav controls sidebar presence only,
  never reachability" and "adding a section: see `apps/admin/INFO.md`." Orders, Products, and
  Subscriptions are all routable-but-unbuilt panels with a `nav` entry, matching the
  `skills`/`newsletter`/`design-system` shape for the render side (`soon` + plain `Placeholder`) while
  following the owner's explicit override for the nav-row side (`soonPreviewable: true` on all three,
  rather than defaulting to disabled).
- Did not touch `App.tsx`, `styles.css`, `Jini/**`, the assistant routes, `src/assistant/**`,
  `development/evals/**`, or `features/widgets/**` — all on the "do not touch" list, across both
  passes.
- `agentReachable` left unset (defaults `false`) on all three new panels, consistent with "nothing
  built here yet for an agent to do."
- No panel id was renamed; `payments`' id, route, render, icon, and `soon`/`soonPreviewable` flags are
  byte-for-byte unchanged from before this task — only its `nav.group` and its explanatory comment
  changed, per the team lead's explicit pass-two instruction not to touch anything else on that panel.

No violations found.

## Pre-Completion Checklist

- Requirements re-verified against the final (pass two) spec: Commerce exists with exactly [Payments,
  Orders, Products, Subscriptions] in that order; Payments no longer under People; every entry has
  both `soon` and `soonPreviewable` true. Directly asserted by the three Commerce tests.
- Fresh evidence commands: RED/GREEN vitest runs for both passes above, all re-run in this session,
  plus two green builds.
- No certified/existing tests were deleted or weakened — the two pre-existing describe blocks in
  `nav-wiring.unit.test.ts` (plugins wiring, authentication-between-users-and-roles ordering) are
  untouched and still pass in both passes.
- Scope: exactly the two files listed above across both commits; nothing else changed.
- Open items: none. The Commerce group placement (right after People) remains a judgment call
  documented above — the team lead's pass-two message didn't revisit it, so it stands as delivered in
  pass one.

## Self-Validation

Not required — this is a pure data/config change (nav manifest declarations), no runtime-changing
behavior in the `self-validation.md` sense (no new server route, auth flow, migration, or integration
call). Compile-time (`admin:build`) and unit-test evidence above is the applicable verification for
this kind of change.

## Style / function-quality notes

No new logic-bearing functions were added in either pass — this is declarative data (panel objects +
JSX render thunks identical in shape to existing entries). No `@overallScore` assessment applies;
nothing here introduces branching, I/O, or reuse pressure beyond what `Placeholder`/`PlaceholderTabs`
(unmodified, pre-existing, already-scored components) already handle.
