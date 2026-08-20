# Architecture: final back-edge closure (6 → 0)

**Date:** 2026-08-20
**Agent:** Programmer (Execution mode)
**Baseline:** `f4cc0aa6` (pushed) on `general-work`
**Result:** `back-edges into composition root`: **6 → 0**. All three jobs closed, all four
compiler-verified claims in this report are backed by a quoted diagnostic, not asserted.

## Summary of commits

| Commit | Job | Files |
|---|---|---|
| `99494a66` | 1 | 4 (`src/assistant/byok-tool-surface.ts`, `src/assistant/index.ts`, `src/server/modules/assistant-byok.ts`, `src/assistant/__tests__/byok-tool-surface.test.ts`) |
| `1f882ffd` | 2 | 9 (`src/server/routes/types.ts`, `src/server/app.ts`, `src/server/deps.ts`, `src/export/site-exporter.ts`, `src/export/route-manifest.ts`, `src/export/__tests__/route-manifest.test.ts`, `src/export/__tests__/site-exporter.test.ts`, `src/features/source-control/__tests__/commit-site.unit.test.ts`, `src/features/deployments/static-publish/__tests__/adapter.unit.test.ts`) |
| `f6c35a93` | 3 | 4 (`src/seo/types.ts`, `src/seo/ports.ts`, `src/seo/page-head-contributor.ts`, `src/seo/__tests__/page-head-contributor.test.ts`) |

**17 files total, all source/test, zero config or docs files.** No file was touched by more
than one commit. Verified against the commit log, not the working tree:

```
git log --oneline f4cc0aa6..HEAD --name-only
```

reproduces exactly the three commits above (plus one unrelated commit from a concurrent
session, `87ad4f8c`, sandwiched between mine — not this dispatch's work). Working tree is
clean of every file this dispatch touched (`git status --porcelain` on the full list returns
nothing).

## Job 1 — the `as unknown as` double cast in `byok-tool-surface.ts`

**Outcome: cast removed from the function itself; the ONE remaining cast moved to the actual
seam where the type information is genuinely insufficient, and is now a single, well-documented,
empirically-verified `as unknown as`.**

`createByokToolSurface`'s own parameter was typed `ClockDeps` but spread into the 24-way
`AssistantToolRegistryDeps` intersection via `as unknown as`. Root cause: the signature was
dishonest — it declared far less than the function actually needed.

Fix: added an exported `ByokToolSurfaceDeps = Omit<AssistantToolRegistryDeps,
"magicLinkPerEmailLimiter">` (the one field the function builds itself) and retyped the
parameter to it. The function body now composes `AssistantToolRegistryDeps` with **zero casts**
— verified: `npx tsc -p tsconfig.json --noEmit` reports 0 errors on the file.

That exposed a second, real gap: the caller (`modules/assistant-byok.ts`'s
`createAssistantByokModule`) has its own `routeDeps: RouteDeps` parameter, and `RouteDeps` is
genuinely missing all 10 of `NewsletterToolDeps`'s fields relative to what
`AssistantToolRegistryDeps` requires — confirmed by removing the cast and reading the real
diagnostic:

```
error TS2345: Argument of type 'RouteDeps' is not assignable to parameter of type
'Omit<AssistantToolRegistryDeps, "magicLinkPerEmailLimiter">'.
  Type 'RouteDeps' is missing the following properties ...: newsletterReady,
  newsletterCampaignRepo, newsletterListRepo, newsletterSubscriptionRepo, and 6 more.
```

This is the identical structural gap `server/app.ts`'s own precedent
(`newsletterAdminDeps = routeDeps as NewsletterRouteDeps`) already documents at another seam —
except that precedent gets a free single `as` because `NewsletterRouteDeps extends RouteDeps` is
a declared nominal relationship, and `ByokToolSurfaceDeps` has none. Verified a single `as`
genuinely fails here too, not assumed:

```
error TS2352: Conversion of type 'RouteDeps' to type 'ByokToolSurfaceDeps' may be a mistake
because neither type sufficiently overlaps with the other. If this was intentional, convert
the expression to 'unknown' first.
```

**This is the one place in the whole dispatch where the double-cast shape survives** — moved
from inside `byok-tool-surface.ts` (where it was hiding a dishonest signature) to
`assistant-byok.ts`'s call site (where it is the correct, minimal, fully-documented
representation of a real, pre-existing narrowing gap). Widening `createAssistantByokModule`'s
own signature to close this structurally would ripple into `app.ts`'s `createApp` signature and
every test that builds a bare `RouteDeps` fixture for this module — out of scope for a
narrowing pass.

Also fixed a wrong pre-existing comment: `magicLinkPerEmailLimiter` was attributed to
`IdentityToolDeps`; verified against `members/tool-registrations.ts` that it is actually
`MembersToolDeps`.

Back-edges: 6 → 5 (closed `byok-tool-surface.ts`'s `ClockDeps` import as a side effect of making
the signature honest).

## Job 2 — `export/site-exporter.ts` + `export/route-manifest.ts`

**Outcome: both back-edges closed. Not the "copy the local-interface pattern" job it initially
looked like — see "what the brief got wrong," below.**

Root cause, found by empirical testing rather than assumption: these two files didn't just
import `RouteDeps` as "the deps bag" — they each read exactly one field
(`createSiteApp`/`resolveStorefrontProducts`) whose OWN declared type in `server/routes/types.ts`
was self-referential to `RouteDeps` (`(routeDeps: RouteDeps) => X`). A locally-declared narrow
interface can't satisfy TS's contravariant parameter check against a field typed that way,
no matter how the consumer's own interface is shaped — confirmed by writing the narrow
interface first and watching it fail, not by reasoning alone.

Fix: converted both fields to pre-bound nullary closures (`() => createApp(routeDeps)`,
`() => resolveStorefrontProducts(routeDeps)`), the exact shape `RouteDeps.exportSiteBound`
already used (added earlier this same session for `commit-site.ts`/`static-publish/adapter.ts`).
Grep confirmed each field had exactly ONE reader before the change
(`site-exporter.ts:657`, `route-manifest.ts:183`), with no per-call argument the reader's own
`routeDeps` local wasn't already the right one for — the same justification `exportSiteBound`
itself already carries.

This let `route-manifest.ts` declare a genuinely narrow `RouteManifestDeps` (6 fields:
`workspaceId`, `postRepo`, `presentationRepo`, `themes`, `redirectRepo`,
`resolveStorefrontProducts`) with zero import from `server/**`, and `site-exporter.ts`'s new
`ExportSiteRouteDeps` extend it with just `createSiteApp`. Added `RouteManifestProduct` — a
local `{id, title}` slice rather than an import of the real `SiteProduct`
(`server/http/site/render.ts`) — return-type covariance means the real, wider
`resolveStorefrontProducts` (returning full `SiteProduct[]`) satisfies it with no cast;
importing `SiteProduct` would have relocated this back-edge into a different `server/**` file
rather than removed it.

### Mandatory test-fixture audit (per Coordinator's condition)

Enumerated every construction site of both fields across the whole test tree (`grep -rln`, not
"the suites I expect"), 4 files total:

- `commit-site.unit.test.ts` + `adapter.unit.test.ts` (static-publish): already used in-place
  mutation for `createSiteApp` from an earlier fix this session, but the FAKE function's own
  signature was still unary. Updated `createSiteAppWithFailingAsset` in both to take `routeDeps`
  explicitly and return a nullary fake.
- `route-manifest.test.ts`'s `baseDeps` helper: was `{ ...deps, ...overrides }` — a spread, on
  every one of its ~12 call sites. Converted to `Object.assign(deps, overrides)`. This did not
  currently break an assertion (the only override in play, `postRepo`, isn't read by
  `resolveStorefrontProducts`'s internals), but it was structurally the identical silent-inert
  landmine, un-triggered rather than absent.
- `route-manifest.test.ts`'s "enumerates products" test overrides `store` — a field
  `resolveStorefrontProducts`'s own implementation reads, correctly absent from the new narrow
  `RouteManifestDeps` (so it can no longer flow through `baseDeps`'s typed override param).
  Rebuilt that one test to mutate `.store` directly on a real `createRouteDeps()` object.
- `site-exporter.test.ts`'s "a route that fails to render" test: `{ ...base, postRepo }` — a
  spread. This one would have failed **loudly**, not silently: with `createSiteApp`
  closure-bound to `base`, the spread copy's booted app would have used the real, non-wrapped
  `postRepo`, the forced failure would never occur, and the test's own
  `if (!welcomeFailure) throw` would fire. Converted to mutation.

Extended `RouteDeps.exportSiteBound`'s existing TEST GOTCHA doc comment in `routes/types.ts` to
name all three closure-bound fields (`exportSiteBound`, `createSiteApp`,
`resolveStorefrontProducts`) and state the general rule once: *any `RouteDeps` field whose value
is a function bound by closure at construction time must be overridden by mutating the object,
never by spreading it into a copy.*

**Verification:** `npx tsc -p tsconfig.json --noEmit` 0 errors (production tree). All 4 affected
test files typechecked directly (tsc excludes `__tests__`) with matching compiler flags:
`route-manifest.test.ts`/`site-exporter.test.ts` clean; `adapter.unit.test.ts`/
`commit-site.unit.test.ts` show only pre-existing errors, confirmed present in the untouched
`git show HEAD:<path>` content and outside every diff hunk this dispatch produced
(`GitHubCommitAdapterResult.filesDeleted` missing on 2 fixtures, a `never`-typed array-literal
narrowing quirk on 5 lines, `null` cast to `object` on 2 lines — none in code this dispatch
touched). Ran both suites, `TEST_CONCURRENCY=2`, scoped: 18 + 45 = 63 tests, 63 pass, including
both "forced failure" regression tests whose fixtures were just fixed — confirming the mutation
makes the override visible at **runtime**, not just at compile time.

Back-edges: 5 → 3. `propagation cost (all-import)` also recovered from Job 1's transient
regression: 12.2 → 11.68 (past the pre-session baseline).

## Job 3 — `seo/` back-edges into `server/http/site/page-head.ts`

**Outcome: all 3 closed by duplication, not by moving ownership.**

The Coordinator's brief suggested seriously weighing a dependency inversion — `seo/` owning
these types, since SEO is the one contributing `page.head` elements. Read the actual source
(`ADS-memory/reports/pipeline/008-seo/adr.md`, ADR-PIPE-008 Decision §2) rather than the code
comment or the brief's framing. That ADR already scored this exact alternative in a table and
rejected it:

> `page.head` seam: keep entirely inside `src/seo/`, `render.ts` imports SEO directly — Weak
> fit — "Wrong ownership — a future non-SEO contributor (ADR-032 §4 names a feeds plugin) would
> have to import the SEO module to register into a 'shared' seam SEO doesn't conceptually own;
> couples the render layer to a feature module." Not selected.

That reasoning is still live (no feeds plugin exists yet, but the seam is deliberately shaped to
support one without a second architecture pass). So ownership stays exactly where it is;
`seo/types.ts` now holds a **structural duplicate**, not a re-export, of `HeadElement`,
`HeadElementKey`, `JsonLd`, `PageHeadContext`, `PageHeadEntryRef`, `PageHeadHook`. `seo/ports.ts`
and `seo/page-head-contributor.ts` (previously importing 2-3 of these names each directly from
`server/http/site/page-head.js`) now import from `./types.js` instead — collapsing what the
Coordinator's drift concern was about (three independently-rotting mirrors) into exactly one
duplicate declaration.

### Required proof — the tripwire, verified empirically with two DIFFERENT perturbations

The Coordinator required proving, not asserting, that a structural drift between the duplicate
and the real types fails loudly. Both perturbations below were applied to `seo/types.ts`,
checked with `npx tsc -p tsconfig.json --noEmit`, and reverted — confirmed clean
(`tsc` exit 0) after both reverts.

1. **Dropped `canonicalUrl` from the duplicate's `PageHeadContext`** — a field
   `page-head-contributor.ts`'s own `handle` body actually reads. Failed immediately, *inside*
   `seo/`, before ever reaching the composition-root wiring call:
   ```
   src/seo/page-head-contributor.ts(34,55): error TS2339: Property 'canonicalUrl' does not exist
   on type 'PageHeadContext'.
   ```
2. **Changed the duplicate's `PageHeadEntryRef.ext`** from `Record<string, unknown>` to
   `string` — a field NOTHING in `seo/` reads, chosen specifically to test whether the wiring
   call is a genuinely independent backstop or redundant with case 1. It fired exactly there:
   ```
   src/server/app.ts(796,5): error TS2345: Argument of type '...PageHeadHook' [seo/types.ts] is
   not assignable to parameter of type '...PageHeadHook' [server/http/site/page-head.ts].
     Types of property 'handle' are incompatible.
       ... Types of property 'entry' are incompatible.
         ... Types of property 'ext' are incompatible.
           Type 'Record<string, unknown>' is not assignable to type 'string'.
   ```
   at `registerPageHeadContributor(createSeoPageHeadHook({...}))`, `server/app.ts` line 796.

**The original hypothesis (single tripwire, at the wiring call) was only half right.** The real
guarantee is two-layered: a drift in a field the contributor actually reads fails fast, inside
`seo/`, at the point of use — even earlier than the wiring call; a drift in a field it does NOT
read still fails, loudly, at the `server/app.ts` wiring call. No incompatible-drift shape is
missed silently by either layer. Both diagnostics and the ADR-PIPE-008 §2 citation are recorded
verbatim in `seo/types.ts`'s own duplicate block comment, so the next person finds the reasoning
rather than "fixing" the duplicate back into an import.

### Rejected alternative

Special-casing `server/http/site/page-head.ts` in `check-architecture.ts`'s back-edge rule
(mirroring how `src/index.ts`/`src/cli/**` are already exempted as the composition root's own
front door). Not implemented: it would silently exempt *all* future imports into that path from
*anywhere*, not just these three narrow ones — gate-weakening, the opposite of what this whole
workstream exists to do.

### Side finding — flagged, not fixed (per Coordinator's explicit instruction)

`seo/types.ts:129`'s `EntrySnapshotIdentity` (unaffected by this dispatch's edits, present
before and after) claims in its own doc comment to be a "compile-time guard" pinning
`PageHeadEntryRef` to `PostRecord` — "If `PostRecord` renames/removes one of these, this alias
fails to typecheck — pinned to the real content record." Verified: nothing in the repo
references `EntrySnapshotIdentity` at all (`grep -rn "EntrySnapshotIdentity" src/` returns only
its own declaration), and even if something did, the type as written only checks that
`PostRecord` itself has 5 named fields — it never checks `PageHeadEntryRef` against anything. A
sixth evidence-shaped-but-false comment in this file family in the last 24 hours. Left alone,
out of scope, for a deliberate follow-up.

Back-edges: 3 → **0**.

## Final numbers

```
$ npm run check:architecture -- --list
...
back-edges into composition root improved: 11 → 0
propagation cost (all-import) improved: 12.2 → 11.67
module API surface (files exposed) improved: 201 → 199
check:architecture — OK, and ahead of baseline.

$ npm run ci:local
GATE SUMMARY
  PASS  typecheck (root)
  PASS  check:boundaries
  PASS  check:architecture
  PASS  check:inventory
  PASS  check:src-complexity-drift
  PASS  complexity (eslint)
  PASS  typecheck (admin)
  PASS  admin:build
```

8/8. (The "11 →" baseline number in `--list`'s own comparison line is the checker's stored
pre-session reference, not this dispatch's own start point of 6 — the dispatch's own starting
count of 6, and every step down from it, is independently confirmed by re-running `--list`
after each commit throughout this report and in the SendMessage trail during the session.)

## What the brief got wrong (disclosed per instructions)

- **Job 2 was described as "copy the local-interface pattern" work.** It genuinely wasn't — two
  fields on the shared `RouteDeps` type were self-referential to `RouteDeps` itself in their own
  declared signature, which made a locally-declared narrow interface structurally impossible
  without also changing the field's contract. The Coordinator revised the cap and scope
  mid-dispatch once this was reported; the final approach (nullary closures, mirroring
  `exportSiteBound`) is the one actually implemented.
- **Job 1's pre-existing comment** attributing `magicLinkPerEmailLimiter` to `IdentityToolDeps`
  was wrong (it's `MembersToolDeps`) — fixed as part of Job 1.
- **The brief's assumption that a single tripwire location (the `server/app.ts` wiring call)
  would catch any Job 3 drift** was only half correct, as detailed above — some drifts are
  caught earlier, inside `seo/` itself, which is a stronger property than assumed, not a weaker
  one, but it means the original single-location claim in the plan (and my own first draft of
  the duplicate's comment, before the second perturbation) was imprecise until verified.

## Nothing was left open

All three jobs' back-edges are closed (0 remaining), every claim above is backed by a quoted,
freshly-reproduced compiler diagnostic or test run, and the working tree is clean of every file
this dispatch touched.
