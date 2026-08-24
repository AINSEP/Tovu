# Primary (Claude Sonnet 5) — Round 1 frozen response

Packet: `CTX-TOVU-CAPABILITY-MANIFEST-FORK-2026-08-23`

## Frame

(A), with a caveat: a category layer is the right instrument, but it is not self-sufficient — it
still needs a (B)-flavored fallback rule (a mechanical "if this returns nothing, go back and try a
different category" loop) or it just moves the "agent never considers X" failure up one level of
abstraction instead of closing it.

## Fixed vs derived — my position

Neither pure form. Split the manifest into two independently-varying parts:

- **Category *names/ids*: fixed**, authored by Tovu. Same cadence as adding a new registered
  `CapabilitySource` — an editorial decision, not something installs can silently create or destroy.
- **Category *kind→category mapping*: fixed**, a small table Tovu maintains — NOT self-declared by
  plugin/source authors (the packet's own evidence: self-declaration gives inconsistent junk). Any
  registered `kind` not yet in the table falls into an explicit `other installed capabilities — search
  to find out` bucket by default, so a new kind is never silently invisible, only uncategorized.
- **Category *presence* (does this category currently have anything installed under it, and how
  much): derived**, computed at the same point `capability-tool-registrations.ts` already lazily
  gathers every source's `list()` to build the FTS index — zero new I/O, same memoization lifecycle.
  The manifest text is generated from that gather, not hand-authored prose that can drift from what is
  actually installed.

This directly answers "what bounds size / what stays true": names are bounded because they're
editorial; presence is always true because it's derived from the same data the search index already
builds from.

## The four open questions

1. **Scope.** All four kinds. Native tools get their own category line that just points at
   `search_tools` (they already have a working index; no need to duplicate it). Agent Plugins and
   (once built) MCP servers feed categories through the kind→category table. Plugin-runtime plugins
   are the one real gap: they are not a `CapabilitySource` today, so until one is written for them,
   they stay invisible under this design exactly as they are now — that is a real, nameable exclusion,
   not solved by the manifest alone.
2. **Dead end.** Present truthful counts, not booleans: `design & visual guidance (2 installed)`,
   `connecting outside services (0 installed)`. A zero-count category is shown, not hidden — hiding it
   recreates "invisible again." Pair this with one instruction in the assistant's standing framing:
   "if a category search returns nothing useful, return here and try a different category before
   concluding nothing exists." That is the (B)-flavored loop this frame needs to not be self-sufficient
   fiction.
3. **Timing.** Derive at catalog-build time — the same lazy, memoized gather that already runs per
   workspace for the FTS index, not a fresh per-request computation and not an install-time-only
   snapshot that can go stale on uninstall. Reuses existing invalidation, adds no new staleness surface.
4. **Invariance to a fifth kind.** The mapping table does NOT auto-extend — a genuinely new kind of
   source falls into the `other` fallback until a person adds a row. That is a real, named cost: this
   design is invariant to *volume* (more installs, more sources of an existing kind) but not to *kind
   novelty* without a small human edit. I will not pretend otherwise; the `other` bucket exists
   precisely so that edit is cheap and non-blocking rather than a silent gap.

## Candidate 1 verdict

Steelman: cheap (low hundreds of bytes), always present so it does not depend on being pulled
correctly, bounded by construction, and it targets the actual measured failure — the agent never
considered the category existed — rather than re-ranking an index that was never queried.

Biggest failure mode: it recreates its own version of the exact bug it fixes, one layer up. If
categories are static and coarse, a real capability that doesn't map cleanly onto any of the 5-6
buckets is exactly as unconsidered as `capability_search` was before this proposal — just now the
unconsidered thing is a category instead of a tool. The `other` fallback (above) is what keeps this
from being fatal, but it is a mitigation, not a fix; the recursion is real and worth naming instead of
hand-waving.

## Unlisted option

Not a separate option so much as an implementation constraint on "derived": the category text the
agent sees should be *generated* from the existing gather at build time, never a second
hand-maintained artifact living beside the code. A hand-authored manifest, even a short one, is a new
thing that can drift from the registry independently of code changes — the same class of failure as a
comment that used to be true. Render, don't author.

## Ranking

Criterion: closes the measured failure without recreating it one level up > stays bounded/cheap >
cheaply falsifiable, in that order.

1. Hybrid category layer (fixed names + fixed kind-mapping + derived presence), as above.
2. Plain always-present manifest + loop (candidate 1 as originally stated) — same idea, less honest
   about zero-counts and mapping ownership.
3. Intent classifier — real added cost: a second model call that can itself misclassify, reproducing
   the same failure mode one component earlier.
4. Ask-the-user — defers to the user noticing to ask, but the entire finding is that the agent doesn't
   know to ask either; doesn't survive contact with "the agent thinks it already knows the answer."
5. Accept the limit, push-only — a real regression from the current (imperfect) state, and it doesn't
   scale as more sources register.

## Experiment slate

1. **Falsifies my own recommendation.** Re-run the exact case-(b) prompt ("use whatever design
   guidance is available") 5× with the hybrid manifest present, nothing else pinned. Pass: 
   `capability_search` called in ≥4/5 with a query that does not contain "theme." Fail: still 0/5 —
   proves an always-present low-cost nudge does not survive whatever attention-allocation problem
   caused the original failure, and push-only may be the real ceiling regardless of manifest design.
2. **Zero-count honesty.** Ask for something in a genuinely empty category (e.g., a payment gateway
   with nothing installed) with the manifest showing `(0 installed)` for that line. Pass: agent states
   plainly nothing is installed. Fail: agent still invents or ignores the zero-count — falsifies the
   "truthful zero" design specifically.
3. **Fifth-kind canary.** Register one stub `CapabilitySource` with a `kind` absent from the mapping
   table (simulating a genuinely new kind of thing arriving later). Pass: it surfaces under the
   `other` fallback bucket. Fail: it is silently dropped — falsifies the invariance claim in open
   question 4.
4. **Cost regression.** Run an unrelated content-editing task (nothing to do with any category) with
   the manifest wired in vs. today's baseline. Pass: no material turn-count or cost regression. Fail:
   the agent starts spending turns re-checking the manifest even when irrelevant — proves the "cheap"
   claim wrong in practice, not just in byte count.

## Mini design — the actual category list

Fixed names (editorial, Tovu-authored), each with the kind(s) that map into it today:

1. **Deploying & hosting this site** — native tools (any deploy-related ones), MCP servers
   (Vercel/AWS once built), agent plugins bundling deploy skills.
2. **Generating or adding images & media** — native tools, MCP servers (Higgsfield/Midjourney),
   agent plugins.
3. **Adding functionality to the site (plugins)** — plugin-runtime (site) plugins are the primary
   source here; this is exactly the gap named in open question 1 — nothing registers this today.
4. **Design & visual guidance** — agent plugins (e.g. `ui-ux-design`), plus a pointer broadening past
   "the active theme" specifically, since that's the exact failure this whole packet is about.
5. **Connecting outside services** — MCP servers, agent plugins that bundle an MCP server ref.
6. **Extending what the assistant itself can do** — a pointer to `search_tools` for the 147 native
   tools, plus general-purpose agent plugin skills that don't fit categories 1-5.
7. **Other installed capabilities** — the fallback bucket from the kind→category mapping table
   (open question 4); anything with an unmapped `kind` lands here, never silently dropped.

**MCP-UI / AG-UI / A2UI do not belong in this list at all.** They are a different axis: how a
capability's result gets rendered (inline image, interactive widget, generative UI), not what the
capability does. Folding them into the same category list as "deploying" or "connecting services"
would be a category error — a user doesn't say "I want an AG-UI capability" the way they say "deploy
my site." If anything, these belong as a card-level attribute (e.g. `rendersVia: "mcp-ui" | "agui" |
"a2ui" | "text"`) that tells the assistant HOW to display a hit it already decided to surface, fully
orthogonal to which category or search led it there. Treating them as categories would double-count
the same underlying tools/plugins under a second, unrelated grouping.

## Three surprises — technology classes, not use cases

Naming a future technology directly isn't possible — if it were nameable, it would already exist as a
pattern here. What's actually testable is the assumption my own design makes about the SHAPE a
capability source takes. Three such assumptions, each with a stub that violates it and what my hybrid
design does when it meets one:

1. **Assumption: a capability is invoked by query/request and answers once.** Everything in the
   hybrid design — `list()`, `read()`, the lazy catalog gather — is pull-shaped: something asks, the
   source answers, done. Stub: a `CapabilitySource` whose `list()` never completes on its own but
   instead calls back into the registry repeatedly over time (a push/subscribe shape, not
   request/response). My design has no place for this — the lazy gather awaits a `Promise` once and
   moves on. Result: it would either hang the catalog build or silently see only whatever the source
   happened to have ready at that one instant. This is a real gap, not absorbed gracefully.
2. **Assumption: one installed thing maps to one flat capability card.** The whole `kind→category`
   table assumes a source hands back a flat list of independently describable cards. Stub: a source
   that registers ONE card whose `handle` is itself a nested tree of sub-capabilities (a "capability
   of capabilities" — think a delegated sub-agent that can do many things, but the parent system only
   sees one entry point). My design maps it to one category, one line in the manifest, and everything
   beneath that single card becomes invisible to the discovery layer — exactly the "unconsidered"
   failure this whole packet is about, just recursed one level down inside a single card instead of
   across cards.
3. **Assumption: every source has a stable, persistent `kind` string that means the same thing across
   calls.** The `kind→category` mapping table is keyed on exactly this stability. Stub: a source whose
   `kind` value is generated fresh per call (or per session) — never the same string twice, by design,
   because the underlying thing is itself adaptive/self-modifying. My mapping table would treat every
   single card as a NEW unmapped kind, all falling into the `other` fallback bucket permanently, and
   the table would never converge — it grows without bound instead of stabilizing.

None of these three are absorbed cleanly by my design as stated. I'm recording that plainly rather
than claiming false invariance: the hybrid design is invariant to new VALUES of `kind` (volume), not
to new SHAPES of what a capability source fundamentally is (push vs. pull, flat vs. nested, stable vs.
unstable identity). Whether that's an acceptable boundary or a real defect is exactly what I want
peers to weigh in on.

## What would change my mind

A peer showing that the `other`-bucket / human-mapping-edit cost in open question 4 is not actually
cheap in practice (e.g., mapping edits get forgotten routinely, and "uncategorized" capabilities pile
up unnoticed) would push me toward a fully derived categorization (model-synthesized at gather time)
despite the self-declaration-noise risk the measured facts warn about — I'd want to see that risk
quantified rather than asserted before conceding it, though.
