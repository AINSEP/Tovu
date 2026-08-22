# PRIMARY (Claude Opus 5, 1M) — Round 1 frozen answer

**Packet:** CTX-TOVU-CAPABILITY-BUCKET-2026-08-22
**Frozen at:** before any peer or subagent output was read. No peer response existed at write time.

## Position

Unify **discovery**; do **not** unify **activation**. One index and one agent-facing
`capability_search` covering every kind; activation stays per-kind and typed. The extension point is
a registered **source**, not a new **kind** — reusing the `register*/list*/reset*ForTests` pattern
this repo already has four instances of. This is option **F**, and it subsumes the useful half of B
and C while rejecting the part of B that creates the real damage.

## Why

**Discovery genuinely unifies; activation genuinely does not.** Discovery has exactly one shape —
text in, ranked ids out — for every conceivable capability kind. Activation has N shapes: a tool has
a JSON arg schema and a permission gate; a skill has neither and is just bytes; a persona is never
invoked by the agent at all, it is applied by the run assembler before the agent exists. Forcing
those into one type produces a union-of-optionals where most fields are null for any given kind.

That failure is already visible in this repo at small scale:
`AgentPluginCapabilityDescriptor.execute` is a two-member union and one member is permanently
`{kind: "unavailable"}` — a field that exists solely to say "not this one." Scaling that shape to
five-plus kinds multiplies it.

**The extension point must be a source, not a kind.**
`registerCapabilitySource({ id, list(): CapabilityCard[] })`, where a card is discovery-only:
`{id, kind, name, description, keywords, source, scope, handle}`. `handle` is opaque — only the
registering source understands it. Adding a new capability kind then means: register a source, write
its activation adapter. It should touch exactly two files and change nothing in the index, the search
tool, the composer, or any other kind. That two-file property is the testable definition of "no
structural change per kind," and it is the only claim in this position that can be falsified cheaply.

**`kind` is data, never a switch.** The composer half already has this written as law
(`slots.ts:77-80`: kind is "filtered/rendered, never switched on"). Extend it to the whole bucket.
The moment core code switches on kind, the extension point is dead and every new kind is a core edit
again.

**Split activation is the strongest trust argument, not a concession.** A unified
`capability_invoke` would be one omnipotent entry point, and every admission decision would have to
be re-implemented inside it. With activation split, each lane keeps the gate it already has:
`ToolExecutor`'s deny-by-default for tools, `mcp-federation/trust.ts`'s admission record for
federated MCP, and READ needs no gate at all because returning text cannot do anything. Unifying
discovery makes trust *better* precisely because activation stays split. If I had to defend only one
sentence of this position, it would be this one.

## Rejected

- **A (keep current).** Fails the hard constraint outright. Agent Plugins have no agent-side reach;
  the pinned chip is the only path their content has. Worse, `resolve-agent-plugin-refs.ts:153`
  hardcodes the eponymous skill and the manifest schema does not enforce it, so a third-party plugin
  that never read Tovu's source can install successfully and be permanently unreachable. That is
  precisely the "works for a third-party author" constraint, failed.

- **D (everything becomes MCP) — as the primary model.** Three reasons. MCP's tools/resources/prompts
  trichotomy has no primitive for the SHAPE group; prompts are user-invoked templates, not behavior
  modifiers. It imposes process boundaries and serialization on 131 first-party tools that are
  function calls today. And it makes Tovu's capability surface a dependent variable of an external
  spec's evolution. **Keep MCP as an adapter — one registered source among several.** MCP is a
  source, not the model. That distinction is the whole of my disagreement with D.

- **E (two lanes).** Under-counts. There are at least four verbs, not two, and E has no home for
  personas, output styles, hooks, or policies. It is A's mistake at a coarser grain: a fixed set of
  lanes is still a fixed set.

- **C (add only the missing tool).** Not wrong, just insufficient. It fixes today's one asymmetry by
  adding a fourth special case. It buys a working system and buys nothing toward "any new kind works
  without structural change." I would ship C only as a strict subset of F, never instead of it.

## Failure modes and hidden costs

**F's hidden cost, stated plainly:** two things to maintain instead of one — the card contract *and*
per-kind activation adapters. Anyone who wants a single mental model will find this unsatisfying, and
the seam between discovery and activation is exactly where drift will appear: a card whose `handle`
no longer resolves. Mitigation is a contract test per source asserting every listed card's handle
activates. If that test is not written, F rots into A with extra indirection.

**F fails outright if** the catalog stays tiny forever. At under ~50 items the registry is pure
overhead and C is correct.

**B's hidden cost** is the null-field union above, plus one permission surface with no natural bound.

**D's hidden cost** is latency and an external dependency on spec evolution — both easy to miss
because D looks like the "standards-compliant" answer.

## What we missed (§4 attack)

The axis is mostly right, but I wrote §4 and I think one of its four groups is wrong:

- **RENDER is a false group.** Inline images, MCP-UI panels, themes, and content transforms share no
  mechanism. Themes and transforms are CMS-render-time; MCP-UI is chat-render-time; an inline image
  is a *result shape* of a CALL. RENDER is not a capability kind — it is a property of a result. It
  should be a field on the activation result, not a group in the taxonomy.

- **Missing: connections / credentials.** A connected Vercel account is not a capability; it is what
  a capability needs. If cards cannot reference a connection, every capability re-solves auth
  independently. This is load-bearing and absent.

- **Missing: triggers / events.** I filed scheduled jobs under CALL, which is wrong. A trigger is not
  something the agent calls — it is something that calls the agent. Inverted control flow does not fit
  the taxonomy at any point, and pretending it does would be the taxonomy's first real break.

- **Missing: evals / validators** — capabilities whose job is to grade another capability's output.

## Structural dimensions (§5)

1. **Lifecycle — load-bearing.** A saved reference must survive an upgrade to a new content digest.
   Reference by `pluginId` + resolved-at-use, never by digest.
2. **Trust — load-bearing, and the strongest argument for split activation.** See above.
3. **Failure modes — load-bearing for external MCP only.** A down server must degrade to a missing
   card, not a failed run. Today a bad ref fails the run closed.
4. **Tenancy — load-bearing and unaddressed anywhere.** Scope must be a card field, and search must
   filter by scope *before* ranking. Filtering after ranking leaks the existence of other workspaces'
   capabilities through result counts.
5. **Freshness — load-bearing and a real gap in every listed option.** Boot-time seeding breaks the
   exact workflow being designed for: install a capability mid-conversation and use it. The index is
   `:memory:` and disposable, so the fix is cheap — `invalidate()` re-runs `list()` across registered
   sources. Neither the current code nor any option A-E addresses this.
6. **Discovery cost — partially moot.** FTS5/BM25 already exists and is wired. The live risk is the
   opposite of the stated one: ~25% baseline top-3 recall means relying on retrieval while the
   catalog is small *silently loses* capabilities. Answer: list-then-search. Return the full card list
   under a threshold; rank above it. Same tool signature either way.
7. **Guaranteed vs optional — the A/B says something narrower than it appears.** 0-of-30 versus
   exactly-the-4-named is a *wording* delta, not a *transport* delta. It shows the agent obeys
   framing; it does not show push works. So the pointer stays mandatory and tiny (~100 bytes) and
   names the tool call explicitly; the content is pulled. "A tool can be ignored" is answered by the
   mandatory pointer, not by pushing 15KB.

## What would change my mind

- Evidence the catalog will stay under ~50 items indefinitely → C is right, F is over-engineering.
- Evidence that SHAPE capabilities are never user-installable, only first-party → E becomes correct
  and the fourth verb disappears.
- A repo fact showing `ToolRegistration` can already carry a non-callable entry without breaking
  `ToolExecutor` → B gets substantially cheaper and my null-field objection weakens.
- MCP gaining a first-class behavior-modifier primitive → D strengthens considerably.

## Blind Spots

**(a) Unlisted option:** expose the bucket to the agent as a **filesystem**, not a tool. Capabilities
become files the agent reads with the Read/Glob/Grep it already has. Tovu spawns agent CLIs, which
are already exceptional at filesystem navigation. Zero new protocol, zero index, zero search tool.
The packet never considered this and it may well beat F on simplicity.

**(b) The question we should be asking but aren't:** not "how do we store capabilities" but **"who
decides which capabilities are in scope for a given run — the user, the agent, or a policy?"** Every
option A-F silently assumes an answer, and no two assume the same one. That question should be
settled before any of them is chosen.

**(c) The framing assumption most likely wrong:** that the *agent* should choose. The entire packet
assumes agent-driven selection with search as the mechanism. If the correct answer is that the user
picks and the agent simply uses what it was handed, then search is nearly worthless, the 25% recall
number stops mattering, and the composer UI is the whole product rather than a front-end to it.

<<SWARM_END>>
