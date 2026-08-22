> **DO NOT DISPATCH THIS AS-IS — SUPERSEDED 2026-08-22.**
>
> This packet encodes the Coordinator's MISREADING of the owner's design: it treats the manifest as
> a list of what is *installed*, which is why it demands "what bounds its size as installs grow from 1
> to 50 plugins." The owner's actual design is a short FIXED list of capability CATEGORIES, bounded by
> construction and independent of install count. The real fork is TRUTHFULNESS (fixed vs derived), not
> size. Rewrite around §4.1 of
> `ADS-memory/reports/continuity/2026-08-22-handoff-pull-discovery-is-dead-next-is-the-manifest-debate.md`
> before dispatching. Retained only as a record of the superseded framing.

# CTX — Reaching a capability nobody asked for

Packet id: `CTX-TOVU-UNCONSIDERED-CAPABILITY-2026-08-22`
Round: 1 (independent, blind)

## ACK

Reply first with exactly:
`ACK_PACKET_RECEIVED CTX-TOVU-UNCONSIDERED-CAPABILITY-2026-08-22 -- I received the packet and will work on it.`

## The system

Tovu is a CMS whose admin has an AI assistant. The assistant spawns a real coding-agent CLI with
filesystem access. That agent reaches Tovu's ~147 registered tools through an MCP bridge, and finds
them with a keyword search over each tool's id and description (FTS5/BM25).

Three separate kinds of thing can provide capability:
- **Tools** — Tovu's own registered tools (`content_post_create`, `theme_read_file`, …).
- **MCP servers** — external, not yet wired as a source, design already settled.
- **Agent Plugin skills** — installed packages of markdown instructions plus reference files. Reachable
  today via `capability_search` / `capability_get`, which are themselves ordinary registered tools.

## The need

A user who knows nothing about deployment says **"deploy my site."** Somewhere in this workspace there
may be a tool, an MCP server, or an installed plugin skill that covers exactly this. The user cannot
name it — they do not know it exists, and would not know what to call it if they did.

Today nothing surfaces it. The question is what *should*, and at what cost.

Note the shape of the problem, because it is not the obvious one: the agent is competent and will
confidently do the task badly rather than stall. It does not report being stuck. It finds a plausible
adjacent answer and proceeds.

## Measured facts. These are binding. A proposal that contradicts one is dead on arrival.

1. **Pull alone fails.** 5 identical live runs, nothing pinned, prompt included "use whatever design
   guidance this workspace has available to you." `capability_search` was called **0 of 5 times**.
2. **It is not a ranking failure, and this is the important one.** Every design-related query the agent
   issued across all 5 runs contained the word *"theme"* — e.g. `"read the active theme's design tokens
   (colors, fonts, spacing)"`. It resolved "design guidance" to "the active theme" **before searching**,
   then searched for theme tools and correctly found them. A better index answers a question that was
   never asked. Keyword work that moved `capability_search` from unranked to rank 8/10 changed nothing.
3. **Push works.** Every run where a short mandatory pointer naming an exact tool call was injected,
   the agent made that exact call. Zero counterexamples.
4. **Injection does not scale.** The current push mechanism injects ~15KB of skill text per pinned item
   into every message.
5. **Prior settled architecture (5/5, still binding):** one discovery index over many registered
   sources, not several; there is no `capability_invoke` and must never be one — discovery unifies,
   activation does not; the extension point is a registered *source*, not a new *kind*; MCP is a
   source, not the model.

## What to argue

**Frame it first.** Two framings are on the table. Say which is the better frame and why — you may
reject both and supply a third.

- **(A) A category layer.** Should there be a category/domain layer spanning tools, MCP servers and
  plugin skills? If so: what IS a category — authored data, derived from what is installed, or
  model-synthesized? Who owns one when a package is installed? How does it stay correct without a
  human curator?
- **(B) Intent formation.** Given an agent will not look for what it has not considered, what mechanism
  makes an unconsidered capability reachable at all?

**Then evaluate these candidates adversarially.** They are options to attack, not a shortlist to
endorse. Reject any or all if warranted, and add your own.

1. A short always-present manifest of what categories of help exist, plus the existing search tools —
   with a loop: if a search returns nothing suitable, return to the manifest and search again from a
   different angle.
2. An intent classifier that runs before planning and injects only what matches.
3. The agent asks the user ("I can also check installed deployment guidance — want me to?").
4. A category layer as in (A).
5. Accept the limit. Invest only in explicit pointers the operator sends deliberately.

## Required in your answer

- Your position on (A) vs (B), or your own better frame.
- An explicit verdict on candidate 1, **including its single biggest failure mode.** Steelman it first;
  do not attack a weaker version.
- If you favour a manifest of any kind: what exactly is in it, and **what bounds its size** as installs
  grow from 1 plugin to 50? An answer with no size bound is not an answer.
- **The cheapest experiment that would falsify your own recommendation.** Required. These findings will
  be tested live, not adopted on argument, so a recommendation that cannot be cheaply falsified is
  worth less than one that can.
- Rank your options. State the ranking criterion you used.

Be concrete and be brief. Disagreement is more useful here than consensus.
