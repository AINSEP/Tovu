# Round 2 — Claude Sonnet 5 (adversarial reviewer, non-voting; "Peer D")

Verified by the primary against source 2026-08-20 — all three load-bearing claims exact:
- `src/widgets/types.ts:223-227` — `WidgetRenderIR` has `children?: readonly WidgetRenderIR[]`. CONFIRMED.
- `src/server/http/site/render.ts:1362` — `COMPONENTS`. (Primary's earlier cite of :1226 was stale;
  a concurrent session is editing that file. Sonnet's number is current.) CONFIRMED.
- `src/server/http/site/render.ts:1380` — "Deliberately a separate switch, not folded into
  `COMPONENTS`". Verbatim. CONFIRMED.

## D1 Merge or separate — REVISING (concedes the merge)

Independently verified Correction 1: no `loader.ts` in `site-glue/` (contrast `plugin-runtime/
loader.ts`, real); `GlueHostPort` has zero non-test implementations; zero external callers of
`attachment-points/*`.

Does NOT kill ADR-057's trust-axis argument — "never distributed" stays true regardless of whether
anything runs. But it kills its own round-1 mechanical argument #2: the deliberate re-declaration of
capability strings is "a design-frozen intent that has never been exercised against real traffic —
evidence of what someone wanted, not evidence of a boundary earning its keep."

`plugin-runtime` already has working `loader.ts`, `activation.ts`, `quarantine.ts`, `discovery.ts`,
`hook-registry.ts`. Building site-glue a second full lifecycle duplicates working machinery for a
system with zero callers. Cheapest possible moment to not build it twice.

**Revised position:** one mechanism — one loader, one activation/quarantine/capability-gate — with
an `origin: "marketplace" | "local-agent" | "built-in"` field set by the installer, never
self-claimed by a manifest. ADR-057 survives as a *constraint on* the merged system, not a reason
for a parallel one.

## D2 Contribution return shape — HOLDING, plus a new finding

Self-correction: round 1 undersold the shape. `WidgetRenderIR` is `{componentId, props, children?}`,
not flat — `renderWidgetRecentEntries` already recurses over it.

**New finding neither packet mentioned: there are TWO closed componentId vocabularies.**

| | Location | Members | Shape |
|---|---|---|---|
| `COMPONENTS` | `render.ts:1362` | 12 hand-written theme components (`hero`, `section`, `feature-grid`, `cta`, `footer`…) | flat, props-only, **no children** |
| Widget IR | `widgets/types.ts:223` | 5 | **recursive `children`** |

No shared dispatch; the code itself says they are "deliberately a separate switch." Two closed
vocabularies diverging in the same file — a smaller-scale instance of the drift the embed-marker
unification fixed elsewhere.

**This reframes D2.** It is not "flat props vs. arbitrary tag tree" — Tovu already ships the hybrid
(closed id + optional children). The real question is *how new componentIds enter a closed set*.

Concrete argument against the generic-tag-tree camp: `section()` branches
`section--media-left`/`-right`; `featureGrid()` owns its grid scaffolding. **Core does not trust a
generic `{tag,attrs,children}` primitive even for its own first-party content**, because generic
tags push markup-consistency decisions onto every caller. A plugin surface on generic tags would be
a second, less-reviewed rendering discipline beside the one core already rejected internally.

Concrete gap that is already real: **neither vocabulary can express "testimonial"** — a gap for
first-party authors today, before any plugin exists.

**Holding:** `{componentId, props, children?}` against a closed, per-tier-gated vocabulary. Tier-1
parameterizes existing ids; Tier-2/3 registers new ones via reviewed resolver (`registry.ts:11`).
**Adding:** resolve the `COMPONENTS`/widget-IR split — or explicitly ratify it as intentional —
before calling either "the" extension seam. "Extend the widget seam" is currently ambiguous between
two different seams.

## D3 Kinds vs capabilities — REVISING (mildly)

`PluginCapability` (`plugin-runtime/manifest.ts:36`) is a flat 3-string union validated against a
`Set`; glue's `GlueCapability` is the same discipline at 8. Neither has a `kind` field — **except
site-glue's `callSite` already functions as one**, and is already a field separate from
`capabilities`.

So the kinds-catalog camp isn't proposing a foreign architecture; it's already half-present in
site-glue and absent in plugin-runtime. Given D1's merge, the fix is small: one manifest with two
explicit typed fields — `kind` (generalizing `callSite`) and `capabilities: CapabilityString[]`.
Substantively the same as capability-strings-plus-schema.

## What it got wrong in round 1

- Described the widget contribution shape as flatter than it is (missed `children`).
- Treated site-glue's "independent re-declaration" comment as a load-bearing boundary rather than an
  unexercised design choice.
- **Never checked `COMPONENTS` at all** — which held the sharpest concrete evidence in either round.

## The one thing it refuses to concede

> Merging the *mechanism* is right; merging the *trust semantics* is not.

If any path — including an internal migration or admin action — can promote an
`origin: "local-agent"` module to marketplace-eligible without a real re-authorship event, that
recreates exactly the failure ADR-057 exists to prevent: **code with no publisher acquiring a
publisher's distribution rights.** One codebase and one loader are fine. One *mutable trust field*
is not — `origin` must be install-time-assigned and un-promotable.
