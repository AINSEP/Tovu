# CTX — Reaching a capability the agent never thought to look for

Packet id: `CTX-TOVU-CAPABILITY-MANIFEST-FORK-2026-08-23`
Round: 1 (independent, blind)
Supersedes: `CTX-tovu-unconsidered-capability-2026-08-22.md` (marked DO NOT DISPATCH in-file — that
packet asked "what bounds manifest size as installs grow," which was a misreading; the real fork is
below in "What to argue").

## ACK

Reply first with exactly:
`ACK_PACKET_RECEIVED CTX-TOVU-CAPABILITY-MANIFEST-FORK-2026-08-23 -- I received the packet and will work on it.`

## The system

Tovu is a CMS whose admin has an AI assistant. The assistant spawns a real coding-agent CLI with
filesystem access. That agent reaches Tovu's capabilities through an MCP bridge and finds them by
search (FTS5/BM25 keyword index), one index per kind of thing:

- `search_tools` / `describe_tool` — **147 native Tovu tools** (`content_post_create`,
  `theme_read_file`, …), registered through `tool-contribution-registry.ts`.
- `capability_search` / `capability_get` — a **separate** discovery index, currently fed by exactly
  **one** registered source: installed **Agent Plugins** (markdown skill packages, optionally
  bundling an MCP server reference). Source code, verified today:
  - The registry's own card shape (`capability-source-registry.ts`) declares `kind` as `string`, not
    a closed enum, **on purpose** — its doc comment: *"A closed union here would mean every future
    source edits this file to add its own kind, which is exactly the by-name coupling this registry
    exists to avoid."* New sources register via `registerCapabilitySource()` without editing the
    registry file.
  - Today's one source (`features/agent-plugins/capability-source.ts`) produces cards of kind
    `agent-plugin-skill` and `agent-plugin-mcp-server` — nothing else feeds this index yet.

**Four distinct kinds of extensible thing exist in this codebase, and conflating them produces wrong
answers.** Do not treat these as interchangeable:

1. **Native tools** (147, above) — built into Tovu, reached via `search_tools`, not
   `capability_search`.
2. **Agent Plugins** — markdown skill packages + optional MCP server ref, extend what the
   **assistant** can do. Reachable via `capability_search` today (the only source wired in).
   Consumption is a "push" model — a plugin ref pinned by the composer gets mandatory-injected at run
   start (`resolve-agent-plugin-refs.ts`); nothing pulls it via search in practice (measured, below).
3. **Plugin-runtime plugins** (`tovu.plugin.json`, worker-sandboxed) — a **separate, unrelated
   standard** that extends the **site/CMS itself** (adds functionality to the published site, not to
   the assistant's own tool surface). Distinct install path, distinct manifest format, distinct
   runtime (`src/features/plugin-runtime/`). **Not currently a `CapabilitySource` at all.**
4. **MCP servers** as an external tool/capability source — designed in a prior 5-model consensus,
   settled 5/5, **not built**. Would be a second registered source, not a new kind of registry.

The owner's framing, verbatim, of why this matters for what follows: *"agent-plugins are a new
standard"* — distinct from plugin-runtime plugins despite the shared word "plugin" — and *"AI is
changing fast so we will need to plan to add more stuff."* Read literally: whatever this debate
settles must survive a fifth, sixth, and tenth kind of capability source arriving later, not just
correctly describe today's four. A design that is only evaluated against today's known sources and
happens to look elegant is not a passing design — evaluate every candidate explicitly against "a new
kind of source appears next quarter that nobody today has named."

## The need

A user who knows nothing about deployment says **"deploy my site."** Somewhere in this workspace
there may be a native tool, an installed Agent Plugin, a plugin-runtime extension, or (eventually) an
MCP server that covers exactly this. The user cannot name it — they do not know it exists, and would
not know what to call it if they did.

Today nothing surfaces it. The question is what should, and at what cost — in a way that keeps
working as new sources are added, not just for the four kinds listed above.

Note the shape of the problem, because it is not the obvious one: the agent is competent and will
confidently do the task badly rather than stall. It does not report being stuck. It finds a plausible
adjacent answer and proceeds.

## Measured facts. These are binding. A proposal that contradicts one is dead on arrival.

1. **Pull alone fails, 0 of 5.** Five identical live agent runs, nothing pinned, prompt included "use
   whatever design guidance this workspace has available to you." `capability_search` was called
   **0 of 5 times**.
2. **It is not a ranking failure, and this is the finding that governs everything below it.** Every
   design-related query the agent issued across all 5 runs contained the word *"theme"* — e.g.
   `"read the active theme's design tokens (colors, fonts, spacing)"`. It resolved "design guidance"
   to "the active theme" **before searching**, then searched for theme tools and correctly found
   them. A better index answers a question that was never asked. **Do not propose better ranking,
   keywords, embeddings, doc2query, or a merged index as a fix for this — that class of fix was tried
   this cycle (keyword tuning moved `capability_search` from unranked to rank 8/10 and changed
   nothing observable), and the finding above explains why it cannot work: retrieval quality is
   irrelevant to a query that never gets issued.** If your answer routes through "improve how
   `capability_search` ranks results," it has not engaged with this fact — revise it before
   submitting.
3. **Push works, 0 counterexamples.** Every run where a short mandatory pointer naming an exact tool
   call was injected, the agent made that exact call.
4. **Injection does not scale.** The current push mechanism injects ~15KB of skill text per pinned
   item into every message. Pointer mode (naming the tool call instead) cut that to ~400 bytes and
   still worked, at the cost of the agent needing extra turns to fetch what the pointer named.
5. **Prior settled architecture (5/5, still binding):** one discovery index over many registered
   sources, not several; there is no `capability_invoke` and must never be one — discovery unifies,
   activation does not; the extension point is a registered *source*, not a new *kind*; MCP is a
   source, not the model.

## What to argue

**Frame it first.** Two framings are on the table. Say which is the better frame and why — you may
reject both and supply a third.

- **(A) A category layer.** A short, human-legible list of capability *categories* — kinds of thing
  this system can do at all (deploying/hosting, generating media, adding functionality, design
  guidance, connecting outside services, …) — plus a pointer to the search tools, so the agent learns
  the category exists even when it would never have thought to search for it. If this layer exists:
  what IS a category — authored data, derived from what is installed, or model-synthesized? Who owns
  one when a new source registers? How does it stay correct without a human curator, and across a
  new *kind* of source (not just a new instance of an existing kind)?
- **(B) Intent formation.** Given an agent will not look for what it has not considered, what
  mechanism makes an unconsidered capability reachable at all, independent of whether a category
  layer exists?

### The real fork inside (A) — truthfulness, not size

- A category listed with **nothing installed** is a lie. "I can help you deploy" → the agent hunts,
  finds nothing, burns turns or invents something.
- A category **not** listed but with something installed → invisible again, i.e. back where we
  started.

So: is the category list **fixed** (authored by Tovu, stable, cheap, but drifts out of truth in both
directions as installs and new source *kinds* change) or **derived** (always true relative to what is
actually installed, but something must decide which category a newly-installed thing — of a kind that
may not exist yet — belongs to, and self-declaration by installers/plugin authors gives inconsistent
junk)?

**This fork, or your better frame's equivalent question, is the center of Round 1.** Settle it — or
show it is a false dichotomy — before proposing implementation detail.

### Explicit open questions folded into this fork (answer all four)

1. **Scope.** Does the category/discovery layer you propose span all four kinds of source above
   (native tools, Agent Plugins, plugin-runtime plugins, MCP servers), or a subset? If a subset, which,
   and what happens to the excluded kinds — do they stay invisible the way plugin-runtime plugins are
   today? Be explicit; "the manifest covers capabilities generally" is not an answer without saying
   which of the four it actually reaches.
2. **Dead end.** When the agent consults your mechanism and the category it wants has nothing
   installed under it (or the mechanism itself has nothing to say), what happens next? Does it loop
   back and search again from a different angle, ask the user, give up, or something else? An answer
   that doesn't cover this recreates the exact "confidently proceeds with a plausible wrong answer"
   failure this whole packet is about.
3. **Timing (if you favor "derived" for any part of your answer).** WHEN does derivation happen —
   at install time, at daemon boot, per request? State the cost of your choice: a per-request derive
   pays a tax on every message; an install-time derive can go stale if something changes the installed
   set out from under it (uninstall, a package edit) without a corresponding hook.
4. **Invariance to a fifth kind.** Walk your own proposal forward one step: a genuinely new kind of
   capability source (not a new instance of tools/plugins/MCP, but a kind nobody in this packet named)
   registers next quarter. Does your design absorb it without editing a hardcoded list, or does
   someone have to come back and extend your mechanism by hand? If the latter, say so plainly — that
   is a real cost, not disqualifying by itself, but it must be named.

**Then evaluate these candidates adversarially.** They are options to attack, not a shortlist to
endorse. Reject any or all if warranted, and add your own.

1. A short always-present manifest of capability categories, plus the existing search tools — with a
   loop: if a search returns nothing suitable, return to the manifest and search again from a
   different angle.
2. An intent classifier that runs before planning and injects only what matches.
3. The agent asks the user ("I can also check installed deployment guidance — want me to?").
4. A category layer as in (A), fixed or derived per your answer above.
5. Accept the limit. Invest only in explicit pointers the operator sends deliberately (i.e., push
   only, no pull-side fix at all).

## Required in your answer

- Your position on (A) vs (B), or your own better frame.
- An explicit verdict on candidate 1, **including its single biggest failure mode.** Steelman it
  first; do not attack a weaker version.
- Your answers to all four open questions above (scope, dead end, timing, invariance).
- If you favor a manifest of any kind: fixed vs derived, stated plainly, with your reasoning.
- **A SLATE of several testable experiments — not one.** These findings will be tested live via a
  canary harness (a standing set of probes run through the product's own agent-run path), not adopted
  on argument. For each experiment: what prompt/setup would run, what result would count as your
  recommendation working, and what result would falsify it. At least one experiment in your slate
  must be aimed specifically at falsifying your own top recommendation.
- Rank your options. State the ranking criterion you used.
- **Is there a strong option, shift, or decomposition not listed above that you believe is better or
  that the framing has missed?** If yes, describe it and explain why it's stronger than the presented
  options. "No, the listed options cover it" is a valid response.
- **A mini design for the actual category list.** Don't stay abstract — draft the concrete categories
  your answer would ship, explicitly covering: Agent Plugins, plugin-runtime (site) plugins, MCP
  servers, native Tools, and the UI/rendering-protocol surfaces (MCP-UI, AG-UI, A2UI). For the last
  group specifically: state whether a rendering protocol needs its own category at all, or whether it
  is a different axis entirely (a property of HOW a capability's result is displayed, not WHAT the
  capability is) — and say plainly if putting it in the same list as the others would be a category
  error.
- **Three surprises — but technology classes, not use cases.** The goal is to stress your design
  against AI mechanisms that do not exist as a pattern in this system yet, not new business use cases
  built on mechanisms it already has. "AI narrates my blog posts as a podcast" is NOT a valid surprise
  — that is text-to-speech, a known technology, wearing a new task. A valid surprise changes something
  structural about how a capability shows up at all.
  There is a real problem here, and do not paper over it: you cannot literally name or fixture a
  technology that has not been invented. So do not try. Instead, name **three assumptions your own
  design silently makes about the SHAPE a capability source takes** — e.g. "assumes a capability is
  invoked by query/request and answers once," "assumes one installed thing maps to one flat
  capability," "assumes every source has a stable, persistent `kind` string," "assumes activation is
  synchronous and bounded in time." For each assumption: describe a stub source that violates exactly
  that assumption (arbitrary, minimal, deliberately not resembling any real future product) and say
  what your design does when it meets one — absorbed cleanly, degrades gracefully, or breaks. These
  three stubs are what actually becomes testable in the Round 2 canary harness; a named future
  technology would not be, since none of us can build or predict one.

Be concrete and be brief. Disagreement is more useful here than consensus.

## What Round 2 will be (informational only — do not pre-answer it)

If Round 1 converges on a fork resolution, Round 2 will NOT re-argue it. Round 2 asks how to build
it — specifically, the design of the canary harness itself (what each canary asserts, what a pass
looks like, how a regression surfaces). You do not need to design that harness now; just know it is
coming so your Round 1 answer's experiment slate is written with "this becomes a standing canary"
in mind, not a one-off validation.
