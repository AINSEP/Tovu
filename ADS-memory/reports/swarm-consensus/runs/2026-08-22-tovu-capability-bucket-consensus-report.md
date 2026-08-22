# Consensus Report — Tovu Capability Bucket Architecture

**Date:** 2026-08-22
**Prompt:** What is the best, simplest, most future-proof way to hold MCP servers, Agent Plugins,
regular plugins, skills, and unknown future capability kinds in one bucket the assistant can search
and use — without structural change per new kind?
**Context Packet (R1):** `ADS-memory/reports/swarm-consensus/context/CTX-tovu-capability-bucket-2026-08-22.md`
**Context Packet (R2):** `ADS-memory/.local-artifacts/swarm-consensus/runs/R2-PACKET.md`
**Mode:** debate
**Controls:** `max_rounds=2`, `min_confidence=0.90`, `swarm_timeout_seconds=300`
**Primary model:** Claude Opus 5 (1M)
**Result:** **Consensus reached at Round 2 — 5/5 decision points, 100% ≥ 0.90 threshold.**

## The Swarm

| Role | CLI | Requested Model | Resolved Model | CLI Version | Selection Source | Status | Attempts |
|---|---|---|---|---|---|---|---|
| Primary | (host) | n/a | Claude Opus 5 (1M) | 2.1.221 | host | Responded R1+R2 | 1 |
| Peer | agy | Gemini 3.7 Flash (High) | Gemini 3.7 Flash (High) | 1.1.18 | per_run_override | Responded R1+R2 | 1 |
| Peer | agy | Gemini 3.1 Pro (High) | Gemini 3.1 Pro (High) | 1.1.18 | per_run_override | Responded R2 (joined R2) | 1 |
| Peer | codex | gpt-5.6-sol | gpt-5.6-sol (high) | 0.148.0 | saved_codex_report | Responded R1+R2 | 2 (R2 re-dispatch) |
| In-host subagent | Task | sonnet | Claude Sonnet 5 (Software Architect persona) | n/a | user_requested_addition | Responded R1+R2 | 1 |

Claude CLI peer (`global.anthropic.claude-opus-4-6-v1`) was **excluded as same-family** with the
Primary, per the skill's participant-roles rule. Sonnet 5 was added as an in-host subagent
participant at the owner's explicit request (Addition case, Debate Routing Guard) — noted because it
makes 2 of 5 voices Claude-family.

## Dispatch Diagnostics

| CLI | Output Mode | stdout Parser | stderr Summary | Retry Notes |
|---|---|---|---|---|
| agy (Flash) | text | ANSI-stripped full stdout / end marker | clean | R1 66s, R2 85s. No retries. |
| agy (Pro) | text | ANSI-stripped full stdout / end marker | clean | R2 92s. Emitted a harmless ACK preamble before the answer. |
| codex | json | JSONL `agent_message` items | clean | R1 201s. **R2 attempt 1 failed** — see below. R2 attempt 2 150s, clean. |
| Task (Sonnet) | text | teammate message | n/a | Went idle without reporting 3×; recovered by SendMessage each time. |

**Codex R2 attempt 1 — `malformed_or_no_output`, Coordinator-caused.** The R2 packet's ACK block read
"Probe call only — reply with exactly this and nothing else." R1's equivalent had been scoped with
"if you are in the handshake/probe call"; that scoping was dropped when the R2 header was written.
Codex obeyed literally and returned only the ACK (450 bytes, 20s, no end marker). Classified as a
prompt defect, not a model failure; re-dispatched once with the ACK block replaced by an explicit
"this is the full task call, do not ACK." One variable changed, not a verbatim retry.

**Transport notes proven this run:** Intel macOS (`Darwin x86_64`) + `codex-cli 0.148.0` passes the
tool-use smoke cleanly — the `0.141.x`/`0.142.x` SIGTRAP quarantine class does not apply to this
version on this host. `agy` accepted a 70KB prompt as a single shell argument without truncation.

## Debate Trace

| DP | Round | Primary (Opus 5) | Gemini 3.7 Flash | Gemini 3.1 Pro | Codex 5.6-sol | Sonnet 5 |
|---|---|---|---|---|---|---|
| DP1 one index vs two | R1 | one | one (host registry) | — | one | **two** |
| DP1 | R2 | one — **held**, now grounded in the verified `.list()` seam | one — refined | one — **new**, cites finding #2 | one — refined | **one — REVERSED** |
| DP2 primary axis | R1 | verb axis "mostly right" | modality+trust+tenancy | — | operation contract | admission pipeline |
| DP2 | R2 | operation contract — **CHANGED**, withdrew own axis | operation contract + trust boundary | operation contract | operation contract — held | **operation contract — CHANGED** |
| DP3 boot-only seeding | R1 | unacceptable | unacceptable | — | unacceptable for installables | **acceptable** |
| DP3 | R2 | unacceptable — held | unacceptable — held | unacceptable | unacceptable — held | **unacceptable — REVERSED** |
| DP4 is it discovery? | R1 | flagged in blind spot only | flagged in blind spot only | — | flagged in blind spot only | flagged in blind spot only |
| DP4 | R2 | **No** — necessary not sufficient | **No** | **No** | **No — and reverses build order** | **No — and splits the claim in two** |
| DP5 tactical slice | R1 | ok as strict subset | **reject outright** | — | ok tactically | under-scoped |
| DP5 | R2 | ok if named generically | **ok — REVERSED** | ok if named generically | ok if named generically **and after delivery** | ok if the seam is real, not just the name |

**Provenance note on Sonnet's DP1/DP3 reversal — recorded because the synthesis leans on it.**
Sonnet asserts it composed its Round 2 answer from Round 1 material alone, before the Coordinator's
status-check message (which disclosed the running 4-for-1 count on DP1) reached it, and therefore that
its reversal was evidence-driven rather than count-driven. What is **verifiable**: the Round 2 packet
Sonnet received contained *only* Round 1 responses — no Round 2 answers from any participant. What is
**not verifiable**: the Coordinator's status-check message did disclose the counts, and Sonnet's file
was written at 08:08:26, after that message was sent (~08:06-08:07). Messages to in-host subagents land
at turn boundaries, so send-order does not establish read-order in either direction. **The claim is
plausible and unproven; it is recorded as Sonnet's assertion, not as a finding.** Weight Sonnet's
reversal accordingly — the reasoning it gave stands on its own merits either way, and the reasoning is
what the synthesis actually uses.

**Position movement is real, not cosmetic.** Sonnet reversed on DP1 and DP3 and explicitly owned the
contradiction ("my own Blind Spot (a) named the one-index answer and I filed it as a blind spot
instead of my position"). Gemini Flash reversed on DP5. The Primary withdrew its own taxonomy on DP2.
Codex changed build priority on DP4. Every participant moved on at least one point.

## Individual Responses

### Claude Opus 5 (1M) — Primary
R1: unify discovery, do not unify activation; the extension point is a registered **source**, not a
new **kind**; `RENDER` in the Coordinator's own taxonomy is a false grouping. R2: **held** the core,
**withdrew** the verb axis in favour of Codex's operation contract, and **raised delivery guarantee
above discovery** in priority. Between rounds, verified three source claims (below) and corrected an
error in its own packet.
Frozen artifacts: `...PRIMARY-round1-frozen.md`, `...PRIMARY-round2-frozen.md`,
`...PRIMARY-round2-OUTLINE-frozen.md` — each written before reading that round's peer output.

### Gemini 3.7 Flash (High)
R1: rejected five of six options; unified host registry with dual-modality agent projection. R2:
refined to one FTS5 projection over registered sources; named the binding constraint "Instruction
Authority, Context Economics, and Framing"; proposed a Two-Tier Delivery Pipeline (compact
authoritative pointer for pinned items, on-demand retrieval for unpinned). Reversed on DP5.

### Gemini 3.1 Pro (High) — joined at Round 2
Moved to one index citing the Coordinator's `.list()` verification. Strongest single line on DP4:
*"You cannot solve an agent behavioral failure with an information retrieval tool."* Proposed a
Modality Disambiguation Test as its falsifier.

### Codex GPT-5.6-sol (high)
R1: option F — unified discovery/policy plane over typed adapters, open protocol namespace,
activation as a policy router not a universal executor; enumerated ~18 capability classes the
Coordinator's taxonomy missed. Also correctly reported three repo-mandated docs as absent.
R2: **reversed the build order** — delivery and compliance are the first product problem, discovery
is supporting infrastructure — and produced the only outline that begins with measurement.

### Claude Sonnet 5 (in-host, Software Architect persona)
The only participant with unrestricted in-place repo access, and it used it. R1: corrected the
packet's composer counts against source; went into the sibling Jini repo to answer the
`ToolRegistration` question mechanically rather than by inference. R2: reversed DP1 and DP3 with
explicit reasoning about why its earlier arguments were wrong, and produced the debate's sharpest
DP4 reading.

## Synthesis

### Agreement

All five, independently, on all five decision points:

1. **One discovery index over many registered sources** — with a `kind`/`lane` column so callers can
   scope a query. Splitting the physical index protects nothing: an FTS5 row is inert regardless of
   which table holds it.
2. **The primary structural axis is the operation contract** — protocol/adapter, sync vs async,
   side-effect and reversibility, interaction requirements — with trust/admission and tenancy as
   required *fields on every record*, not as the axis. The Coordinator's original
   CALL/READ/SHAPE/RENDER verb taxonomy is sound as search metadata and unsound as structure; all
   five said so, including its author.
3. **Boot-only index seeding is unacceptable for install-driven sources.** It remains fine for the
   first-party tool lane, whose change-cadence is code-deploy time. Sonnet's reversal supplied the
   clean reason: the analogy fails because the two lanes have different change-cadences.
4. **Findability is not the binding constraint** for the failure this project actually measured.
5. **The tactical slice is acceptable as the first commit** only if named `capability_search` /
   `capability_get` from commit one **and** built on a real generic source-registration seam.

Also unanimous, unprompted: **never build a universal `capability_invoke`**; **no new persistent
datastore** for the catalog; **no MCP as universal substrate**; **no unconditional bulk injection**;
**MCP-UI stays deferred, but tool results must carry typed media rather than flattened text.**

### Divergence

**One substantive nuance survives, and it is not a disagreement about direction.** Sonnet retained a
piece of its Round 1 argument that the other four glossed: a first-party tool's one-line description
and a Skill's long markdown abstract have very different term-frequency statistics, and mixing them
under one BM25 ranking can degrade both. Its fix — a `kind` column enabling scoped queries — costs
one field and is compatible with everyone else's position. Adopted into the recommendation.

Codex alone insists the generic *name* is insufficient without stable identity, source registration,
workspace filtering, live invalidation, bounded reads and provenance labels — *"otherwise it is
merely `agent_plugin_search` with a future-facing name."* Sonnet independently reached the same
condition. This is a strengthening of the agreed position, not a divergence from it.

### Unique Insights

**Sonnet's precise reading of the A/B — the single most valuable output of this debate.** In both
runs zero search was involved; the content was already unconditionally in the prompt. And the delta
was not "the agent became more thorough": under corrected wording it read **exactly the 4 files the
SKILL.md's own text named** — not more, not a different 4, not all 30. So the mechanism that worked
was **directed fetch** — following a decision tree a human author had already written into the skill
— not retrieval. Ranking was never the bottleneck.

**Sonnet's split of the justification, which nobody else made.** The packet's §1 names two use cases:
(a) capabilities the user names explicitly, and (b) capabilities matching a broad category where the
user does not know what is installed. **Case (a) is the measured failure and is not a retrieval
problem. Case (b) is genuinely a retrieval problem and has no data yet.** All four other participants
— the Primary included — conflated "the bucket is justified by case (b)" with "the bucket fixes the
case-(a) failure we have data on." Those are different claims requiring different evidence, and only
the first currently has any.

**Codex's failure-classification requirement.** Record separately whether the agent *never saw* the
instruction, *saw and ignored* it, or *followed it and the task still failed*. Those need different
remedies and today Tovu cannot tell them apart.

**Codex's warning about building discovery first:** *"A larger catalog could make the failure worse by
adding an optional search step the agent can also skip."*

### Decision Ledger

| Decision Point | Opus 5 | Gemini 3.7 Flash | Gemini 3.1 Pro | Codex 5.6-sol | Sonnet 5 | Agreement | Key Why / Movement |
|---|---|---|---|---|---|---|---|
| One index vs two | one | one | one | one | one | **Yes** | Sonnet reversed. Trust is protected by refusing an execute path on the facade, not by splitting the table. |
| Primary structural axis | operation contract | operation contract (+trust) | operation contract | operation contract | operation contract | **Yes** | Primary withdrew its own verb axis; Sonnet demoted its trust axis to one facet. |
| Boot-only seeding | unacceptable | unacceptable | unacceptable | unacceptable | unacceptable | **Yes** | Sonnet reversed: precedent ≠ correctness; cadences differ. |
| Is this a discovery problem? | No | No | No | No | No | **Yes** | 5/5. All had it in R1 blind spots; none had it as a position until forced. |
| Tactical slice acceptable? | yes, if generic | yes, if generic | yes, if generic | yes, if generic **and after delivery** | yes, if the seam is real | **Yes** | Flash reversed from outright rejection. |

**agreement_percent = 5/5 = 100%** — above the 0.90 threshold. Debate stopped at Round 2 by
convergence, not by round exhaustion.

### Unresolved Deltas

None on direction. Two open sequencing questions the debate surfaced but could not settle without
data, both of which the recommended first step resolves:

- Whether case (b) — ambiguous-intent search — is a real user need at Tovu's scale, or a projected
  one. No measurement exists. It is the entire justification for the bucket.
- Whether directive-compliance wording alone is sufficient for case (a), or whether something
  architectural is also required. One data point exists; one is not enough.

## Verifications performed by the Coordinator (all against source)

1. `Jini/packages/core/src/tool-registry.ts` — `ToolRegistration.handler` is **non-optional**. A
   handler-less row cannot enter the real registry. **Sonnet's claim: confirmed.**
2. `ToolDescriptor` is pure metadata; its own doc states it "Never carries the handler or policy."
   `ToolRegistry.list()` returns `readonly ToolDescriptor[]`; `buildToolCatalogQuery` takes
   `Pick<ToolRegistry, "list">`. **Therefore any object exposing `.list()` can back the existing
   FTS5/BM25 index — no core type change, no new datastore.** This is what moved three participants
   on DP1.
3. **The Round 1 packet contained an error.** §2.5.6 claimed "six groups, five hardcoded stubs";
   actual is **five groupIds, five entries, four stubs**, one wired to a real tool. Inherited from
   the prior session's handoff and carried forward unchecked. **The handoff needs correcting.**
4. **Root `AGENTS.md` lines 14-17 mandate three documents that do not exist:** `tovu-architecture.md`,
   `tovu/PROJECT_MEMORY.md`, `tovu/src/INFO.md`. The `tovu/` prefix is stale from an earlier repo
   layout. Every agent booting in this repo is instructed to read files that are absent. Codex's
   report of this was correct, not overcautious. **Separate defect, unrelated to this design.**

## Final Recommendation

### Ranking criteria (stated before the ranking)

1. Does it address the failure that was actually **measured**, rather than a hypothesised one?
2. Cost to add capability kind N+1 — target: the new source's own files plus one registration call.
3. Blast radius on already-shipped, already-trusted code.
4. Falsifiability — can its central claim be cheaply tested?
5. Does it preserve the native/federated trust split `mcp-federation/trust.ts` built on purpose?

### Slate

**Option 1 — Wording fix now, then seam, then index (RECOMMENDED).**
Ship the injection-wrapper wording fix immediately and alone. Then build a generic source seam with
one registered source. Then generalize the existing FTS5 catalog over it.
*Genuine sacrifice:* slower to a visible feature than a bespoke fix; the seam and the `kind` column
must exist before the first commit counts as real. Not free.

**Option 2 — Bespoke `agent_plugin_search` / `agent_plugin_read_skill`, no seam.**
*Genuine sacrifice:* ships fastest, and both the name and the implementation become debt the moment a
second readable kind appears — which the requirement says is expected, not merely possible.

**Option 3 — Full generic activation router now.**
*Genuine sacrifice:* adds a layer every activation must traverse, to serve a second operation
protocol that does not exist in the repo yet. Rejected for now; revisit when an async job,
subscription, or hook actually exists.

### The recommendation

**Ship the wording fix first, alone, and measure. Then build the seam. Do not lead with the bucket.**

**Step 0 — the wording fix, gated on nothing.** It is already committed (`a36edeb0`) but **not live**
— `:3000` has no auto-reload and was last restarted before it landed. **Restart the server.** This is
the only change in this entire report with a real before/after measurement behind it, and it targets
the failure that was actually observed.

**Step 1 — classify the failure before architecting for it.** Record separately whether the agent
never saw an instruction, saw and ignored it, or followed it and still failed. Cheaper than any
architecture here, and it tells you whether the rest is worth building.

**Step 2 — delivery levels before catalog semantics.** `optional | recommended | user-selected |
required` as a field on every capability reference, with the composer chip emitting a compact
mandatory pointer that names the call to make, instead of ~15KB of content.

**Step 3 — the generic source seam,** shaped like the four registries this codebase already has, with
Agent Plugin skills as its single first registrant.

**Step 4 — one index over registered sources,** reusing `buildToolCatalogQuery`'s pattern, with a
`kind` column, workspace scope applied **before** ranking, and a complete-list fallback for small
catalogs or low-confidence queries. Agent surface is `capability_search` / `capability_get`, and
**the discovery surface never gains an execute path** — and enforce it mechanically, not by convention.

> **Enforce the invariant in `check:architecture`, not in an ADR.** Sonnet's closing contribution, and
> it is better than what the rest of us proposed. Tovu already runs a module-boundary gate
> (`check:architecture` -> `development/scripts/check-architecture.ts`, backed by
> `.dependency-cruiser.cjs` with a `GUARDED_MODULES` list — **verified present**). Add a named rule:
> *no import path exists from the `capability_search`/`capability_get` module into any activation entry
> point* (`ToolExecutor`, the federated MCP caller, the content-read adapter). That converts "we agreed
> not to do this" into "the build fails if anyone does," which is the posture this codebase already
> takes toward module cycles. Sonnet also notes the invariant is *already partly enforced one layer
> down*: `ToolDescriptor` carries no handler field, so the object discovery hands back is structurally
> incapable of admitting activation. The gate closes the remaining gap at the module level.
>
> **Caveat on that gate:** `GUARDED_MODULES` is a hardcoded path list. Renaming the capability module's
> folder silently removes its rule without failing anything. Whoever adds the rule should also add a
> test that the guarded path still resolves.

**Step 5 — reseed on install/enable/disable,** not boot only.

**Step 6 — resolve the digest-ambiguity lifecycle gap** before discovery traffic increases. Better
discovery converts a rare known failure into a common one.

**Do not build:** a universal `capability_invoke`; a second agent-facing search surface; a new
persistent datastore for the catalog; a change to Jini's `ToolRegistration` to permit handler-less
rows; a closed capability-kind taxonomy; speculative adapters for jobs, subscriptions, hooks,
renderers, or sub-agents. **Do** keep typed media on tool results from day one — one field, and
without it the owner's image-generation use case forces a transport rework later.

### Cheapest tests that would falsify this recommendation

**For the sequencing claim (run this one first).** Re-run the coffee-roastery A/B three ways on an
identical prompt: (1) no-plugin control, (2) mandatory pointer + read tool, (3) today's ~15KB
injection. If (2) does not match or beat (3), the pull model is wrong and Steps 3-6 should not be
built. One afternoon.

**For the extension-point claim.** Register a deliberately unrelated second source through the seam —
a throwaway test double is sufficient, no real second kind needed — and count files changed outside
that source's own module. If the answer is anything but "its own files plus one registration call,"
the unification claim is falsified and the bespoke approach was the honest answer.

### The caveat that should not be lost

Five models agreed on all five points. **That is not evidence of correctness.** In the prior session
four models agreed on plans that all scored at or below a rejected control under blind cross-scoring.
What makes this run different is not the agreement — it is that three of its load-bearing claims were
verified against source rather than reasoned to, that every participant moved position on at least
one point, and that the recommendation leads with a measurement rather than a build.

The single most likely way this consensus is still wrong: **all five of us are architects, and
architects propose architecture.** Sonnet's split of the justification is the guard against that —
case (b) is the bucket's entire warrant and it has no data behind it. Step 1 exists to get that data
before Steps 3-6 spend anything.
