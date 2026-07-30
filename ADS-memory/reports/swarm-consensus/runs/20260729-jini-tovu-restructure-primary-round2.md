# Primary (Claude Sonnet 5) — Round 2 rebuttal

Written after reading all three other Round 1 answers (Codex GPT-5.6-sol, Gemini 3.1 Pro, Opus 5 — Gemini 3.6 Flash excluded, timed out) and after the remote-tool-event fix was built, tested, and shipped into Jini's real source. Frozen before dispatching the Round 2 packet to peers.

## Current position: revised toward Opus's D-variant, with one addition

Round 1 converged more than I expected: Codex, Sonnet (me), and Opus all independently reached "bundle a feature's tools+routes+cleanup into one atomic unit" as the fix for the Route-vs-Tool Gap — three independent arrivals at the same mechanism is a strong signal, not a coincidence. Gemini 3.1 Pro landed in the same place but shallower (no code, no root-cause finding).

Opus's Round 1 answer is the one I'm updating toward. Its structural finding — that Jini's actual `Pack` primitive (`core/src/pack.ts:16-24`) has no slot for `ToolRegistration`s at all — is more root-cause than my own or Codex's "the preset's registrars happen to be inconsistent" framing. That's *why* the gap exists, not just a description of it. A fix that only patches `createLocalNodeDaemon`'s composition (my Round 1 proposal, and Codex's) risks the same gap reappearing the next time someone adds a family without going through the wrapper. Opus's capability-derived model (`provides: CapabilityId[]`, explicit-enable-can't-override-denied-capability) is the more defensible version, and its three-named-topologies table (`embedded`/`sidecar`/`daemon`) is a cleaner way to express "not uniform, but not unbounded either" than my own "just let each consumer configure it" framing, which under-specified what the supported shapes actually are.

**What changes given the fix is now real, not hypothetical:** Opus's own Round 1 blind spot (b) said "I would want that comparison run before committing to the larger refactor" — we ran it. The comparison result: adding `POST /api/runs/:runId/tool-use` + `.../tool-result` took two small files, 23 tests, no regressions, and works exactly as described. This means:

1. The co-location constraint (§1a) is now a *choice*, not a wall. That doesn't make Opus's or my Round 1 work wasted — the Route-vs-Tool Gap and the "how does a host pick what's active" problem are completely unaffected by whether tool-execution is co-located. Those still need fixing regardless of topology.
2. It does mean the *topology* table should be honest that a 4th shape is now possible — genuinely split tool-execution from run-ownership — even though I don't think it should become a fourth named preset yet, since no concrete consumer (Tovu, or anything known about Open Marketing/Zana) has asked for it. Worth documenting as "possible," not worth building a named preset around on spec.
3. It weakens one specific argument in my own Round 1 answer: I argued B2 (Tovu's sidecar shape) was necessary largely because of the co-location wall combined with "Tovu never spawns a CLI directly." That second constraint still fully stands on its own (it's an explicit architectural decision, not a byproduct of co-location) — so my conclusion for Tovu specifically doesn't change, but the reasoning chain should no longer lean on "and also co-location forces this," since it doesn't anymore.

## What I'd ask Round 2 to settle

Beyond the topology/buffet question: whether any of the backend code in Tovu's `src/assistant/` is actually generic Jini-consumer glue (not Tovu-CMS business logic) that should move into Jini and be re-exported, rather than every consumer reinventing it. My own candidate read, to be checked against by peers: `mcp-injection.ts`'s `resolveMcpJsonInjection` (works around `@jini-ai/mcp`'s own `exports` map bug — 100% Jini's problem, not Tovu's) looks like the clearest candidate; `agents.ts`'s `listAssistantAgents` (thin wrapper over `agent-runtime`'s own listing) is a plausible second; `tool-registrations.ts` is very likely NOT a candidate (it maps Tovu's own content-types catalog, genuine business logic) but the *pattern* it implements might be worth a generic helper. I want peers to check this independently rather than rubber-stamp my read.

## What would change my mind again

If a peer identifies a concrete reason Tovu itself should actually exercise the newly-possible split-tool-execution topology now (not just note it's possible) — I'd want to hear the specific benefit before agreeing, since I don't currently see one for Tovu's own shape.
