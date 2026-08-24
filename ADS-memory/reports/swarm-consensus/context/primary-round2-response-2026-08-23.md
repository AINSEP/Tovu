# Primary (Claude Sonnet 5) — Round 2 frozen response

Written after reading all four Round 1 peer answers (Gemini 3.1 Pro, Gemini 3.7 Flash, Codex
`gpt-5.6-sol`, and the in-host Addition-case subagent), before building or dispatching the Round 2
packet.

## What changed my mind

**Category membership should derive from matching each card's own purpose/description text against
the fixed category vocabulary — never from a `kind`-string lookup table.** My Round 1 design keyed the
`kind→category` mapping table on the literal `kind` string, and I named my own third surprise (a
source whose `kind` is generated fresh per call) as something my design does NOT survive — the table
grows without bound. Codex and the Addition-case subagent both independently designed around this by
mapping on the card's own text (the same FTS5 content `capability-catalog-query.ts` already indexes),
never on `kind`. That's strictly more robust and costs nothing extra — the index already exists. I'm
dropping the kind-keyed table; this is a real concession, not a compromise.

## Where I hold

**The pointer-vs-inventory reframe (Addition voice, §4) is the sharpest single idea across all five
answers, but I don't think it fully dissolves the fork — it relocates the open question rather than
closing it.** A category phrased as "for X, try searching these terms" is indeed never false regardless
of install state. But two things still need settling, and neither is answerable by more argument:

1. Whether an LLM agent, in practice, actually treats "for deployment, try `capability_search` with
   these terms" differently from "you can deploy your site" — or whether both phrasings get read the
   same way once "deployment" is merely present in context. If they read the same, the reframe is a
   real logical improvement that doesn't change measured behavior, and the truthfulness question comes
   back through a side door (a human operator, or the agent narrating to a user, may still represent an
   always-present pointer as an inventory claim even if the source text wasn't one).
2. Whether ANY passive, always-injected text — pointer-phrased or not — is sufficient at all, given
   Codex's structural objection: the measured failure was the agent never checking, and inert context
   that never interrupts planning stays inert regardless of how it's worded. This is the actual live
   fork now, and it's testable, not arguable.

## The real Round 2 disagreement: delivery mechanism, not manifest content

Stripped of restating each other, the four peers plus me actually propose three different delivery
shapes for the same underlying content:

- **(i) Passive always-injected system-prompt text.** My Round 1 answer, Gemini 3.7 Flash's
  "environmental ontology mask," the Addition voice's pointer list. Cheapest, but untested against the
  specific failure mode it's meant to fix — we have zero evidence it survives contact with an agent
  that has already decided "theme" is the answer before reading anything.
- **(ii) A mandatory pre-planning consideration gate** — an explicit instruction that consultation is
  required, not optional, layered on top of (i) or (ii)/(iii). Codex's core argument: "a perfect
  inventory that does not interrupt planning remains inert."
- **(iii) The manifest as a callable tool the agent is instructed to invoke before answering an
  unfamiliar ask**, rather than context text at all. Gemini 3.1 Pro's `list_available_capability_
  categories()`. This is arguably the most literal, enforceable version of (ii) — you cannot skip
  calling a tool the way you can skim past a paragraph of system prompt.

I don't think this is resolvable by more debate. It's the harness's job. **I'm proposing this become
the headline Round 2 experiment**, run as three arms against the identical case-(b)-style prompt:
passive text only, passive text plus explicit gate instruction, and tool-call-required. Whichever arm
actually produces non-theme `capability_search` calls is the answer, and it settles (i) vs (ii) vs
(iii) empirically instead of by whoever argues best.

## Converged findings I'm carrying forward as settled (do not re-argue in Round 2)

- **Rendering protocols are not a category, 5/5 unanimous.** MCP-UI/AG-UI/A2UI are a presentation
  facet on a capability card, orthogonal to what job the capability does. Closed.
- **A genuinely new top-level *concept* (not a new instance of an existing one) always costs a small
  human edit, in every design proposed, including mine.** Nobody claims full automatic invariance to
  concept-level novelty — only to volume growth under existing concepts. This should stop being framed
  as a design flaw to solve and start being named as an accepted, bounded cost in whatever Round 2
  ships.
- **Push/streaming-shaped capability sources break or badly strain every proposal on the table,
  independently arrived at by all five answers.** This is the strongest cross-model finding to come
  out of Round 1 — not one person's assumption-naming exercise anymore, but five independent designs
  hitting the identical wall. I'm recommending Round 2 explicitly scope this out as a named v1
  limitation (a capability that pushes rather than answers a query needs a subscription/event
  mechanism, which is a separate, larger feature) rather than trying to solve it inside this fix.
- **Hierarchical/compositional sources (one install, many sub-capabilities) get a mixed but leaning-
  optimistic verdict** — Codex and the Addition voice both argue for registering the root as
  browsable and treating full child enumeration as a describe-time concern, not a discovery-time one.
  I raised this as a full break in Round 1; I'm updating toward their position, but flagging it as a
  canary to verify rather than fully conceding — my worry (a card's own internal hierarchy going
  invisible beneath one discovery line) isn't disproven, just deprioritized relative to the push/stream
  problem, which is worse and more certain.

## What I want Round 2 to actually produce

Per the handoff's own framing (which none of the peers have seen yet, since Round 1 was blind): Round
2 is not a re-argument of the fork, it's the canary harness design. Given the above, I want Round 2 to
converge on:

1. A verdict on the three delivery-mechanism arms (i)/(ii)/(iii) — via a concrete experiment design,
   not further argument.
2. Confirmation (or objection) on dropping the kind-keyed mapping table in favor of FTS-text matching
   against the fixed category vocabulary.
3. An explicit, named v1 scope boundary excluding push/streaming sources.
4. A synthesized, deduplicated canary set from the ~15+ overlapping experiments already proposed across
   all five Round 1 answers — what each canary asserts, what a pass looks like, how a regression
   surfaces later.
