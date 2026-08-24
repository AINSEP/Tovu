# Consensus Report — Capability Discovery Manifest Fork

Question: does Tovu's AI assistant need a capability-discovery manifest (and if so, fixed or derived,
and how does it survive a kind of capability source that doesn't exist yet)? Triggered by a measured
finding: pull-based discovery (`capability_search`) is called 0/5 times when the agent isn't told
exactly what to search for — not because ranking is bad, but because the agent never forms the query
in the first place.

Mode: `debate`, 2 rounds + an added blind cross-scoring round. `max_rounds=2`, `min_confidence=0.90`.

## The Swarm

| Participant | Route | Model | Role |
|---|---|---|---|
| Primary | host | Claude Sonnet 5 | Coordinator + voting participant every round |
| Peer | `agy` | Gemini 3.1 Pro (High) | voting participant |
| Peer | `agy` | Gemini 3.7 Flash (High) | voting participant |
| Peer | `codex` | `gpt-5.6-sol` (high reasoning) | voting participant |
| Addition (in-host) | Agent tool | Claude Sonnet 5 | voting participant, alongside not replacing external peers |

## Dispatch Diagnostics

- All model identities proven via `cli_smoke_test.py --model-plan-only` before dispatch (saved-report /
  local-default exact `command_model` for each; no unresolved/alias-only peer).
- Peer Handshake Gate passed for all three CLI peers on every round (Round 1, Round 2, blind-scoring)
  via probe-then-dispatch (Tier 2 buffered transport for both `agy` and `codex exec`).
- One transport hiccup, corrected in-flight: on the blind-scoring round, `codex exec` returned only the
  ACK line and stopped — it treated "reply first with the ACK" as the entire task. Retried once with an
  explicit "do not stop after the ACK, continue in this same reply" instruction; second attempt returned
  the full scoring output. Classified as a one-off prompt-literalism issue, not a transport or model
  failure — no further retries needed.
- Both `agy` sessions and `codex exec` visibly read repository context (AGENTS.md-style content) despite
  `--ignore-rules`/no-ancestor-AGENTS.md working directories, evidenced by stray "Coordinator(Review
  Mode)"/"Codex Peer(Consensus)" self-labels appearing in raw traces. This did not corrupt any
  substantive answer — final answers were clean and on-topic in every case — but is worth noting for
  future dispatches: these flags reduce but do not eliminate repo-context bleed-through.

## Individual Responses

Full verbatim text for every round is committed and linked, not reproduced here:

- Round 1 packet (question, framing, measured facts): `../../context/CTX-tovu-capability-manifest-fork-2026-08-23.md`
- Round 1 Primary frozen answer: `../../context/primary-round1-response-2026-08-23.md`
- Round 2 packet (all Round 1 answers disclosed verbatim, Round 2 ask): `../../context/CTX-tovu-capability-manifest-fork-round2-2026-08-23.md`
- Round 2 Primary rebuttal: `../../context/primary-round2-response-2026-08-23.md`
- Blind-scoring packet (all 5 Round 2 answers anonymized): retained locally under the session scratchpad
  (not repo-committed — transport artifact); scores reproduced in Synthesis below since the packet
  itself is not load-bearing after aggregation.

## Synthesis

### Fully settled, 5/5, do not re-argue if this work continues

- **Rendering protocols (MCP-UI/AG-UI/A2UI) are not a capability category.** Unanimous, independently
  reasoned by all five. They are a presentation facet on a capability card (how a result is shown),
  orthogonal to what job the capability does (what a user asks for). Treating them as a category was
  called a "category error" by name in at least three of the five answers.
- **`kind`-keyed category mapping is wrong; category membership must derive from the card's own
  purpose/description text.** Converged in Round 2 after Primary conceded its own Round 1 design was
  wrong on this point. Costs nothing extra — the FTS index already indexes this text for search.
- **Push/streaming-shaped capability sources break or badly strain every design proposed.** Independently
  discovered by all five in Round 1's "three surprises" exercise. Consensus: name this as an explicit,
  tested v1 exclusion (a capability with a finite, pull-based `list()` contract only) rather than
  half-solving it now. Every design agreed the fix is a named boundary plus a canary proving a
  push-shaped stub can't hang or crash the catalog build — not a real accommodation.
- **A genuinely new top-level *concept* (not a new instance of an existing one) always costs a small,
  named human edit.** No design claims full automatic invariance to concept-level novelty, only to
  volume growth under existing concepts. Treat as an accepted, bounded cost, not a flaw to keep chasing.
- **Discovery unifies, activation does not — no unified `capability_invoke`.** Carried over from the
  prior 5-model consensus and never challenged this round. Codex's port decomposition (independently
  praised by 3 of the other 4 participants) makes this explicit: Inventory / Classification /
  Consideration policy / Activation handoff are four separable concerns, and no single mechanism should
  try to own more than one.

### The live disagreement, resolved by blind evidence rather than argument

Three delivery shapes were proposed for getting the agent to actually consult the manifest: (i) passive
always-injected text, (ii) a mandatory pre-planning "you must check" gate, (iii) a required tool call.
Round 2 converged 3-of-4 peers on (ii); the fourth (the in-host Addition voice) argued no shape
escapes the root cause without a live test, and proposed a fourth option nobody else had: **have the
composer itself run a cheap keyword search server-side before the agent's first turn**, so there is no
"choice to consult" left for the agent to skip. This was independently rated the single most novel and
best-defended idea across all five blind scorers.

**This is not resolved by the debate — it's resolved by whichever arm wins the actual experiment**,
which every design converged on as necessary regardless of which mechanism wins the argument. Decision
below reflects that: build the test, then decide, don't decide first.

### Blind cross-scoring results

All five participants scored all five Round 2 answers blind (identities and self-authorship hidden,
responses shuffled into random order). Self-scoring was included per the requested design; no
participant scored their own entry as the outright winner, and no cross-family favoritism pattern was
detectable in the grid (Gemini-authored answers did not systematically rate other Gemini answers
higher; same for the two Sonnet-authored answers).

**Overall score, averaged across all 5 raters (10-point scale):**

| Response (author, revealed) | Rater: Primary | Codex | Gemini 3.1 Pro | Gemini 3.7 Flash | Addition voice | **Average** |
|---|---|---|---|---|---|---|
| Codex's Round 2 answer | 9 | 9 | 9 | 9 | 8 | **8.8** |
| Gemini 3.1 Pro's Round 2 answer | 7 | 6 | 8 | 7 | 6 | **6.8** |
| Addition voice's Round 2 answer | 9 | 9 | 9 | 9.5 | 8 | **8.9** |
| Gemini 3.7 Flash's Round 2 answer | 8 | 7 | 7 | 9 | 9 | **8.0** |
| Primary's Round 2 answer | 6 | 3 | 3 | 4 | 4 | **4.0** |

**Result, not an opinion: the panel converged tightly on two answers as strongest** (Codex's and the
in-host Addition voice's, both ~8.8-8.9, both praised specifically for the most complete/most
self-critical canary harness) **and on one answer as clearly weakest** (Primary's own — 4.0, last place
by every single rater including Primary itself). The reason is consistent across all five raters:
Primary's Round 2 entry synthesized the debate and named what should be built, but never actually
produced a canary table the way all four other participants did. This is a real, disclosed gap, not
spin — Primary's own self-score (6) was in fact the *most generous* score that entry received from
anyone, which is itself a small, honest data point about self-assessment leniency worth naming plainly.

## Decision Ledger

| Question | Decision | Confidence |
|---|---|---|
| Frame | (A)-as-substrate-for-(B): a category layer only matters if it's paired with something that forces the agent to actually check it. Neither frame alone is sufficient. | High, 5/5 |
| Fixed vs derived | Category *names* fixed (editorial); category *membership* derived from FTS-matching card text against a curated vocabulary, never from a `kind` string. | High, 5/5 |
| Rendering protocols | Not a category. Card-level presentation facet only. | Settled, 5/5 |
| Delivery mechanism | Not decided by argument. Build and run the delivery-mechanism experiment (3-4 arms: passive text / mandatory gate / required tool call / server-side forced first-turn injection) before shipping any one shape. | Deferred to test, by design |
| Push/streaming sources | Explicit v1 exclusion. Ship a named contract ("finite pull-based `list()` only") plus one canary proving a push-shaped stub can't hang the catalog. | High, 5/5 |
| Canary harness | Build from the two highest-rated, independently-converging designs (Codex's 11-canary CI/nightly/pre-release cadence; Addition voice's 7-canary set with an explicit deterministic-vs-live-LLM-judge split). Both are stronger and more complete than Primary's own contribution — use them as the actual basis, not Primary's list. | High, blind-scored 5/5 |

## POST-DEBATE UPDATE (2026-08-23, same day): the live experiment ran, and it overturned the prediction

3 of 4 peers predicted the mandatory gate would win. It didn't. Real data, N=3/arm via
`agent-run-probe.mjs --isolate-memory` against the real dev stack:

- **`off` (control): 0/3** `capability_search` calls, consistent with the original 5-run measurement.
- **`passive`: 1/3** called `search_tools` (not even `capability_search` directly) with a real
  capability-shaped query, and that call's OWN results ranked `capability_search` as a hit — just near
  the bottom (score 4.72 of 15 results). The agent never took the second call. 0/3 correctly surfaced
  the real installed `ui-ux-design` plugin.
- **`gate`: 0/3** tool calls of ANY kind — worse than both other arms. Root cause: the gate's own
  wording ("before proposing an implementation path...") only triggers when the agent is about to
  propose a path. All three runs skipped straight to asking a clarifying question instead, which never
  trips the gate's condition at all. The mechanism 3-of-4 peers argued for empirically made things
  worse on this sample, not better.

**This changes the recommendation below.** The single most informative result (`passive-2`) shows the
failure is not purely "never considers searching" — sometimes it searches via `search_tools` and the
right tool IS in the results, just outranked and one hop away. That points at re-ranking
`capability_search` higher for capability-shaped queries, or collapsing the two-tool
`search_tools → capability_search` chain into one unified call — not at rewording delivery mechanism
text. N=3/arm is small; treat this as a strong lead to pursue next, not a final answer. Full data and
per-run summaries: session scratchpad `manifest-arm-experiment/` (ask the coordinating session for the
path if resuming this later — not repo-committed).

**Incident during this run, unrelated to the finding above:** switching arms required a dev-stack
restart; the kill command used was port-based (`lsof -ti :PORT | xargs kill`) rather than
identity-checked, and it killed a *different* project's (Tovu-Runner) dev server that happened to share
port 5173. Lesson for any future arm-switching: verify each PID's actual command/cwd before killing by
port, every time, even under time pressure — a port number is not proof of ownership.

## Final Recommendation (ORIGINAL — items 2-4 still stand; item 1 is superseded by the update above)

Build, in this order:

1. ~~**The delivery-mechanism experiment first**~~ — DONE, see update above. ~~Do not re-run this exact
   3-arm comparison; instead pursue the ranking/two-hop-collapse lead it surfaced.~~ **Superseded again,
   same day — see "SECOND POST-DEBATE UPDATE" at the end of this file. The ranking/two-hop-collapse lead
   is now deprioritized; do not build it without new evidence.**
2. **In parallel (cheap, deterministic, no LLM calls needed):** implement FTS-text-based category
   classification (never `kind`-keyed), the fixed category name list, the `other installed
   capabilities` fallback bucket, and the explicit push/streaming exclusion contract with its one
   quarantine canary. None of this depends on which delivery arm wins.
3. **Canary harness:** adopt Codex's 11-canary operational table (PR / nightly / pre-taxonomy-change /
   dashboard cadence) as the backbone, folding in the Addition voice's deterministic-vs-live-judge split
   and its three structural-shape sub-canaries (push-shaped, nested/compositional, unstable-`kind`
   identity) as the specific implementations of Codex's C5/C8/C9 slots. This is not a compromise pick —
   it's what the blind-scoring panel independently rated as the two strongest designs in the debate,
   merged rather than re-derived.
4. Do not build a fifth, from-scratch canary design. The panel's own evidence says two already-produced
   designs are stronger than anything Primary would add unilaterally at this point.

## SECOND POST-DEBATE UPDATE (2026-08-23, same day, later): the ranking/two-hop-collapse lead is itself deprioritized

Re-reading the earlier `ADS-memory/reports/2026-08-22-case-b-five-run-verdict.md` and its companion
handoff surfaced that the ranking/two-hop-collapse lead above was already tried once, two days earlier,
and already falsified: commit `168aea24` re-ranked `capability_search` from unranked to rank 8/10 on the
recorded query, and 2 of the case-(b) session's 5 runs happened AFTER that fix landed. Result: still
**0 of 5**. The reason is upstream of retrieval — in every failing run the agent resolved "design
guidance" to "the active theme" (a plausible, sufficient-looking wrong answer) *before issuing a single
query*, so it never searched for the capability catalog at all. No amount of re-ranking or hop-collapsing
reaches a search that never happens. An independent Claude Opus 5 consultation, given the same evidence
plus this file, reached the identical conclusion without being shown the case-b verdict first.

**Corrected real next steps, in build order (superseding item 1 above a second time):**

1. **Build the slash-command pointer first** (`/ui-ux-design`-style, composer-only, zero server change —
   already wired end-to-end via `src/features/agent-plugins/resolve-agent-plugin-refs.ts`, proven 100%
   success rate in the Aug 22 session's case-(a) pointer-mode runs, small n but zero counterexamples).
   This does not solve the measured failure (a user who doesn't know to invoke it is unaffected), but it
   is cheap, ships real value, and gives a "known good" trace to score everything else against.
2. **Then retest the fixed-category manifest text**, paired with an actually-working forced-check
   mechanism — the original `gate` arm's trigger never fired in any of its 3 runs (it only checks
   "before proposing an implementation path," and all 3 runs asked a clarifying question instead), so
   that arm never tested whether a working gate helps; treat its 0/3 as void, not as evidence against
   gates in general. Score by "did the run end up using the plugin," not "did it call
   `capability_search`" — the passive arm already showed those two diverge (1/3 searched, 0/3 used).
   Spend the run budget on prompt diversity (5-6 distinct gestures, including at least one with no
   plausible decoy available) rather than repeating one prompt more times, and include one negative
   canary (a gesture in a category with nothing installed) to catch the manifest making things worse.
3. **Do not resume ranking/two-hop-collapse work** without new evidence beyond the single `passive`-arm
   run it was originally built on — the data twice now (Aug 22 measurement, Aug 23 Opus consultation)
   points upstream of retrieval, not at retrieval quality.
