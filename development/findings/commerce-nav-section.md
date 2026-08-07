# Commerce nav section (Payments, Orders, Products)

Dispatched as Programmer agent (`AI-Dev-Shop/agents/programmer/skills.md` loaded). Branch
`refactor/jini-admin-extraction`.

## Files changed

- `apps/admin/src/panels.tsx` — moved the `payments` panel out of `People` into a new `Commerce`
  section; added two new panels, `orders` and `products`.
- `apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts` — extended with a `Commerce nav section`
  describe block.

No other files touched. `nav.ts`, `App.tsx`, and `Placeholder.tsx` needed no changes — `getNav()`
derives everything from `ADMIN_PANELS` automatically, and `Placeholder` resolves `orders`/`products`
labels through `getNav()` by `sectionId`, exactly as `skills`/`newsletter`/`design-system` already do.

## Correction to the dispatch brief

The brief said Payments' existing panel id is `paypal`. It is actually `id: "payments"`
(`panels.tsx:365` before this change) — confirmed by reading the file directly. I did not rename it
either way (per the instruction not to change the id), so this only matters for anyone searching the
codebase by the wrong id afterward.

The brief also stated the current group order is "Content, People, Marketing, Operations, Studio,
Administration." The actual `ADMIN_PANELS` registration order (which is what `buildNav` uses for
group order — see below) is **Content, People, Studio, Operations, Administration, Marketing**. I
placed Commerce according to the real order, not the brief's stated one.

## Group ordering — how `buildNav` decides it, and why Commerce sits where it does

Read `/Users/la/Programming/Jini/packages/admin/src/core/manifest/rules.ts` (not
`core/manifest/rules.ts` as the brief guessed — it's under `src/`). `buildNav`'s own doc comment
(`rules.ts:60-63`) states it plainly: "groups appear in the order their first member was registered
... with registration order as a stable tiebreak" for items within a group too. There is no explicit
group-priority list anywhere — array position in `ADMIN_PANELS` is the only source of truth for
group order, confirmed by the implementation (`groupOrder.push(key)` the first time a group key is
seen, `rules.ts:76-79`).

I inserted the new `// --- Commerce ---` block (payments, then orders, then products) immediately
after the `// --- People ---` block and before `// --- Studio ---`, so the resulting group order is:

```
Content, People, Commerce, Studio, Operations, Administration, Marketing
```

Reasoning: the `payments` panel's own prior comment (now replaced) had already anticipated this
exact move — "If a storefront surfaces later ... this and Orders likely move together into a
Commerce group." Commerce is core business-facing functionality, the same category as Content and
People, not a Studio/Operations/Administration tooling concern — so it reads more naturally as a
direct successor to People than tacked onto the end after Marketing. This is a judgment call, not a
spec-mandated position; if the owner wants a different slot, it's a one-block move since group order
is driven purely by where the block sits in the array.

## `soon` / `soonPreviewable` — precedent and choice

- **Payments** (moved, not new): kept `soon: true, soonPreviewable: true` unchanged — it already
  renders via `PlaceholderTabs` with named sub-tabs (Home/Stripe/PayPal), matching the pattern
  `deployment` (GitHub/AWS) and `authentication` (Google/Facebook/LinkedIn) use.
- **Orders** and **Products** (new): `soon: true` only, no `soonPreviewable`, rendering via the plain
  `Placeholder` component — matching `skills`, `newsletter`, and `design-system`, the three existing
  panels that are real-but-unbuilt with no named sub-integrations to preview. `soonPreviewable` only
  has meaning for a link that leads somewhere with real preview content (a tab set); a bare
  `Placeholder` shows the identical "coming soon" body regardless of the flag, so setting it on Orders
  or Products would be a no-op that misleadingly implies there's something to click through to.
  There's no admin API for orders/products (confirmed already by the dispatch brief and re-confirmed
  by inspecting `panels.tsx` — no route wiring exists), so there's nothing to build tabs around yet.

## Icons

- **Payments**: unchanged (card icon).
- **Orders**: a small document/receipt shape (`rect` + two inner lines) with a checkmark overlay in
  the bottom-right corner — same "icon + overlay mark" idiom `authentication`'s key-with-diagonal-
  strokes already establishes in this file, distinct in silhouette from Payments' plain card and
  Products' box.
- **Products**: an isometric box/package outline (hexagonal outer path + internal Y-seam) — the
  standard "package" pictogram, distinct from both neighbors.

All three use `viewBox 0 0 18 18`, `stroke=currentColor`, inline SVG inner markup, matching every
other entry in the file.

## RED evidence

Wrote the two new test cases first, then confirmed they failed against the pre-change code via
`git stash push -- src/panels.tsx` (isolating the test-file change from the implementation change),
then ran:

```
cd apps/admin && npx vitest run src/__tests__/unit/nav-wiring.unit.test.ts
```

Result: 2 failed, 3 passed (the 3 pre-existing tests stayed green).

```
FAIL  Commerce nav section > exists with exactly Payments, Orders, Products in that order
  AssertionError: expected undefined to be defined   (no Commerce group exists yet)
FAIL  Commerce nav section > no longer lists Payments under People
  AssertionError: expected [ 'users', 'authentication', … ] to not include 'payments'
```

## GREEN evidence

`git stash pop` to restore `panels.tsx`, then re-ran the same command:

```
Test Files  1 passed (1)
     Tests  5 passed (5)
```

Then the full scoped unit suite, per the owner's standing rule against full-suite runs:

```
cd apps/admin && npx vitest run src/__tests__/unit
Test Files  7 passed (7)
     Tests  50 passed (50)
```

## Build

```
npm run admin:build
✓ 1160 modules transformed.
✓ built in 6.09s
```
Succeeds. The pre-existing "chunk larger than 500kB" warning is unrelated to this change (same
warning would fire regardless of this diff — it's about `index-*.js` bundle size overall).

## Commits

One commit, staged by explicit path only (`git add apps/admin/src/panels.tsx
apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts`), never `-A`/`.`/`-a`. The repo had many
unrelated modified/untracked files at dispatch time from other in-flight sessions (`App.tsx`,
`styles.css`, `src/assistant/**`, `development/evals/**`, etc.) — none of them touched here.

```
commit 12cbce3 feat(admin): add Commerce nav section (Payments, Orders, Products)
 apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts | 18 +++++++
 apps/admin/src/panels.tsx                             | 58 +++++++++++++++++-----
 2 files changed, 64 insertions(+), 12 deletions(-)
```

`git show --stat HEAD` confirms exactly these two files and no others.

## Architecture Audit

**Status: PASS.**

- ADR rule checked: `nav.ts`'s file header — "presence in the nav controls sidebar presence only,
  never reachability" and "adding a section: see `apps/admin/INFO.md`." Both Orders and Products are
  routable-but-unbuilt panels with a `nav` entry, matching the `skills`/`newsletter`/`design-system`
  precedent exactly (same `soon: true` + `Placeholder` shape, same absent `agentReachable`).
- Did not touch `App.tsx`, `styles.css`, `Jini/**`, the assistant routes, `src/assistant/**`,
  `development/evals/**`, or `features/widgets/**` — all on the "do not touch" list.
- `agentReachable` left unset (defaults `false`) on both new panels, consistent with "nothing built
  here yet for an agent to do," matching `skills`/`newsletter`/`design-system`'s own comments.
- No panel id was renamed; `payments`' id, route, and `agentReachable` (unset, same as before) are
  unchanged — only its `nav.group` and its explanatory comment changed.

No violations found.

## Pre-Completion Checklist

- Requirements re-verified: Commerce group exists with exactly [Payments, Orders, Products] in that
  order; Payments no longer appears under People. Directly asserted by the new tests.
- Fresh evidence commands: RED/GREEN vitest runs above, both re-run in this session, plus the build.
- No certified/existing tests were deleted or weakened — the two pre-existing describe blocks in
  `nav-wiring.unit.test.ts` are untouched and still pass.
- Scope: exactly the two files listed above; nothing else changed.
- Open items: none for this task. The Commerce group placement (right after People) is a judgment
  call documented above, not a blocking gap — flagging it in case the owner wants a different slot.

## Self-Validation

Not required — this is a pure data/config change (nav manifest declarations), no runtime-changing
behavior in the `self-validation.md` sense (no new server route, auth flow, migration, or integration
call). Compile-time (`admin:build`) and unit-test evidence above is the applicable verification for
this kind of change.

## Style / function-quality notes

No new logic-bearing functions were added — this is declarative data (panel objects + JSX render
thunks identical in shape to existing entries). No `@overallScore` assessment applies; nothing here
introduces branching, I/O, or reuse pressure beyond what `Placeholder`/`PlaceholderTabs` (unmodified,
pre-existing, already-scored components) already handle.
