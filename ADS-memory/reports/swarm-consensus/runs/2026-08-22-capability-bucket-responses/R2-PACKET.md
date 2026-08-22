# CTX-TOVU-CAPABILITY-BUCKET-R2-2026-08-22 — ROUND 2 (informed)

**Packet ID:** `CTX-TOVU-CAPABILITY-BUCKET-R2-2026-08-22`
**Mode:** Swarm Consensus — debate, Round 2. This round is INFORMED, not blind.
**Round 1 packet:** `CTX-TOVU-CAPABILITY-BUCKET-2026-08-22` (its §1-§10 still bind; re-read it if you
have it, but this packet is self-contained on everything that changed).

## ACK

Probe call only — reply with exactly this and nothing else:
`ACK_PACKET_RECEIVED CTX-TOVU-CAPABILITY-BUCKET-R2-2026-08-22 -- I received the packet and will work on it.`

End your full response with `<<SWARM_END>>` on its own line. No marker = discarded as truncated.

---

## WHAT ROUND 2 ASKS — this is different from Round 1

Round 1 asked for positions. **Round 2 asks for a build outline.**

The owner's instruction, verbatim: *"produce an outline for what they wanna build, and why — and have
them reason through why they're building everything. Answer the questions, then build a working
outline. No code. Just a working outline on what's needed and why. Then we can critique it for
future rounds."*

So:

1. **Answer the five decision points below.** For each: your position, whether it CHANGED this round,
   why, the strongest argument against the leading opposing position, and what would change your mind.
   A bare "still agree" is not an acceptable answer to any of them.
2. **Then produce a working build outline.** What to build, in what order, and **why each piece
   exists**. The "why" is the deliverable — an outline that lists components without justifying each
   one against a specific failure it prevents is not what was asked for.
3. **NO CODE.** No TypeScript, no function bodies, no interface literals. Module names,
   responsibilities, sequencing, and reasoning only. This constraint is the owner's and overrides the
   usual "back your leading option with pseudocode" rule.
4. **Rank a slate, do not give one answer.** State your ranking criteria BEFORE the ranking so the
   order is auditable. At least two options. Every option needs a genuine sacrifice — if an option
   looks all-upside, the cost is being hidden. Name what you would NOT build and why.
5. **Give the cheapest test that would falsify your own recommendation.**

Your outline will be critiqued in a later round. Write it to be attacked.

---

## THE FIVE DECISION POINTS

**DP1 — One discovery index over many registered sources, or two separate indexes (callable vs
readable)?**
Round 1: Primary, Gemini Flash, and Codex converged on one. Sonnet argued two — but Sonnet's own
Blind Spot (a) describes a shared discovery facade over separately-executed lanes, which is the
one-index position. Sonnet: is (a) your actual answer, or do you still hold two? Everyone else:
answer Sonnet's real objection, which is not cost — it is that one search surface drifts into one
trust tier by convenience.

**DP2 — What is the primary structural axis?**
All four of you rejected the Coordinator's "what the agent does with it" verb axis. But you proposed
three different replacements: the **operation contract** (Codex), **modality + trust + tenancy**
(Gemini Flash), and the **admission/trust pipeline** (Sonnet). These are not the same answer. Pick
one and argue against the other two.

**DP3 — Is boot-only index seeding acceptable?**
Three said no. Sonnet said not load-bearing, because it matches existing accepted behaviour
(`tool-catalog-query.ts` is already boot-seeded and disposable by design). Is "consistent with
existing behaviour" a correctness argument here, given the flagship workflow is install-a-capability-
and-use-it-in-the-same-conversation?

**DP4 — THE CENTRAL QUESTION. Is this a discovery problem at all?**
All four of you independently put this in Blind Spot (c) — and all four then wrote a position about
discovery architecture anyway. Sonnet's version is the only empirically grounded one: the skill's
full content was ALREADY unconditionally in the prompt, ~14,800 characters, zero search required, and
the agent still read 0 of 30 referenced files until the wrapper stopped hedging. That is an
instruction-following failure, not a findability failure.

Take a position. If findability is not the binding constraint, then what is, what should be built
instead or first, and does the capability bucket still earn its cost? Do not hedge this one.

**DP5 — Is the tactical option (add only Agent-Plugin search/read tools) an acceptable first slice or
a trap?**
Codex: acceptable tactically, wrong as endpoint. Gemini Flash: reject outright. Sonnet: under-scoped.
Does the answer change if the tool is named `capability_search` from the first commit rather than
`agent_plugin_search` — same work, no per-kind name to retire later?

---

## COORDINATOR'S BETWEEN-ROUND FINDINGS (disclosed per the Round-Disclosure Guard)

These are verifications the Coordinator ran against source between rounds. They are falsifiable —
check them if you doubt them.

1. **Sonnet's `handler` claim: VERIFIED.** `Jini/packages/core/src/tool-registry.ts` —
   `ToolRegistration.handler` is `readonly handler: ToolHandler`, non-optional. `register()` accepts
   only the full triple. A handler-less row cannot enter the real registry.

2. **The converse, which Round 1 did not draw out: ALSO VERIFIED, and it cuts the other way.**
   `ToolDescriptor` is pure metadata; its own doc says it "Never carries the handler or policy".
   `ToolRegistry.list()` returns `readonly ToolDescriptor[]`. `buildToolCatalogQuery` takes
   `Pick<ToolRegistry, "list">`. **Therefore any object exposing a `.list()` returning descriptors can
   back the existing FTS5/BM25 index — no core type change, no real registry, no new datastore.**
   This is load-bearing for DP1 and every participant should factor it in.

3. **The Round 1 packet contained an error, found by Sonnet and confirmed by the Coordinator.**
   §2.5.6 said the composer has "six groups, five hardcoded stubs." Actual: **five** groupIds,
   **five** entries, **four** stubs, one wired to a real tool. The error was inherited from a prior
   session's handoff and carried forward unchecked. Treat other inherited claims in §2.5 with
   corresponding suspicion.

4. **Codex's missing-docs claim: VERIFIED.** The repo's root `AGENTS.md` lines 14-17 mandate
   `tovu-architecture.md`, `tovu/PROJECT_MEMORY.md`, and `tovu/src/INFO.md`. **None of the three
   exist.** The `tovu/` prefix is stale from an earlier layout. Per-module `INFO.md` files do exist.
   Codex's provisional caveats were therefore correct, not overcautious.

5. **Convergence observed, stated so you can dispute it rather than be steered by it.** All four
   Round 1 answers independently landed on "unify discovery, separate execution," and all four
   independently named the same thing in Blind Spot (c). If you think that convergence is a shared
   blind spot rather than a signal, say so — four models agreeing is not evidence of correctness.

The Coordinator's own Round 2 position and outline are **frozen and deliberately withheld** from this
packet, so that your Round 2 outline is independent of it. You are seeing the Coordinator's Round 1
answer (below) and the verifications above — nothing further.

---

## OUTPUT FORMAT

```
## DP1 / DP2 / DP3 / DP4 / DP5
<per DP: position | changed this round? | why | strongest counter to the leading opposing view | what would change my mind>

## Ranking criteria
<stated before the ranking>

## Slate
<ranked options, each with its genuine sacrifice>

## BUILD OUTLINE
<what to build, in order, and why each piece exists — the why is the deliverable. No code.>

## What I would NOT build, and why

## Cheapest test that falsifies my own recommendation

<<SWARM_END>>
```

---

# ALL FOUR ROUND 1 RESPONSES, VERBATIM

What follows is every participant's complete Round 1 answer, unedited. Read all four before writing.



---

# ===== PARTICIPANT 1 of 4: PRIMARY — Claude Opus 5 (1M) =====

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


---

# ===== PARTICIPANT 2 of 4: Gemini 3.7 Flash (High) =====

## Position
Implement a **Unified Host-Side Capability Registry with Dual-Modality Agent Projection**. A single, extensible capability descriptor governs discovery, lifecycle, tenancy, and composer UI surfaces on the host, while projecting into two distinct agent execution lanes via the MCP bridge: **Callable Tools** (RPCs with side-effects/queries) and **Procedural Skills** (on-demand readable instructions and reference docs). This decouples authoring and packaging from execution mechanics without collapsing safety boundaries or polluting the context window.

---

## Why

1. **Host-Side Unity Solves Lifecycle, Multi-Tenancy, and UI**: 
   The root cause of Tovu’s three disconnected descriptor types is that packaging (Agent Plugins), UI interaction (Composer capabilities), and agent execution (ToolRegistry) were modeled independently. A single host registry where every capability—whether first-party, MCP server, plugin, or skill—registers a canonical descriptor (`id`, `urn`, `name`, `description`, `workspace_id`, `trust_profile`, `source`, `modality`) provides a single source of truth for installation, dynamic FTS5 indexing, workspace isolation, and the composer slash-menu.

2. **Agent-Side Dual-Modality Preserves Cognitive Ergonomics and Context Economics**:
   LLMs interact with instructions and actions fundamentally differently:
   - **Tools are Actions**: They require structured parameter schemas, deterministic JSON responses, and security sandboxing.
   - **Skills are Cognitive Procedures**: They require contextual understanding, heuristics, and procedural guidance.
   Projecting everything into a single naive `capability_invoke` (Option B) treats procedural guidelines as tool execution outputs, which wastes token budget across turns, lowers instruction compliance, and collapses security privilege separation. Projecting skills into an on-demand retrieval tool (`search_skills`, `read_skill`) eliminates the 14,800-character unconditional prompt-injection bloat while guaranteeing that agents can discover and load multi-skill plugins (like `ui-ux-design`'s 7 skills) when prompted by user intent or explicit mention.

3. **Future-Proof Extensibility**:
   When an unknown capability kind arrives tomorrow (e.g., a reactive database listener, an evaluation rubric, or a sub-agent workflow), the host descriptor schema accommodates it via its metadata and execution contract without requiring database schema rewrites or breaking existing tool/skill query indices.

---

## Rejected

- **Option A (Keep Current Architecture)**: **REJECTED.**
  Leaves Agent Plugins permanently disconnected from agent discovery tools. It perpetuates the eponymous skill path bug (`resolve-agent-plugin-refs.ts:153`), leaves multi-skill plugins unreachable, drops context on the AG-UI transport (`context: []`), and forces 14.8k characters of raw reference files into every prompt.
- **Option B (One Unified Registry + Single Agent Search/Invoke Tool)**: **REJECTED.**
  Collapsing all capabilities into a single `capability_invoke` primitive is an architectural anti-pattern. Invoking a read-only markdown guide produces massive context pollution in conversation history; invoking an external deployment script triggers irreversible production mutations. Merging them destroys the host's ability to enforce granular execution permissions, confuses the agent's action planning, and degrades prompt steerability.
- **Option C (Keep Kinds Separate; Add Only Missing Tools)**: **REJECTED.**
  A tactical band-aid that hardcodes technical debt. Adding `agent_plugin_search` fixes today's immediate omission but leaves three fragmented descriptor models, hardcoded composer UI stubs, and ensures that every new capability type in the future requires bespoke host-side tables, custom UI adapters, and new agent-facing discovery tools.
- **Option D (Everything Becomes an MCP Server)**: **REJECTED as an internal substrate.**
  MCP is a federated communication protocol, not an internal domain model. Standard agent CLIs auto-bind MCP `tools` but do not autonomously discover or poll MCP `resources` or `prompts` without custom driver loops. Wrapping every local markdown skill file and internal CMS query in an external stdio/SSE sub-daemon introduces severe process-management fragility, IPC latency, and multi-tenant security leaks.
- **Option E (Pure Two-Lane Split without Unified Host Registry)**: **REJECTED.**
  While the runtime separation of Callable vs. Readable is correct, maintaining two independent, uncoordinated registries at the host level fractures plugin packaging (e.g., an Agent Plugin shipping both a skill and an MCP server), complicates multi-tenant workspace scoping, and forces the composer UI to reconcile two disparate catalog stores.

---

## Failure Modes and Hidden Costs

### For the Recommended Shape (Unified Registry + Dual-Modality Projection)
- **Hidden Cost — Index Synchronization Overhead**: When a workspace installs or updates an Agent Plugin containing both skills and tools, the host must atomically update the metadata registry, refresh the dynamic FTS5 search index, and signal the active MCP bridge without restarting the daemon.
- **Failure Mode — Agent Indirection Fatigue**: If an agent must call `search_skills` $\rightarrow$ `read_skill` $\rightarrow$ `search_tools` $\rightarrow$ `call_tool` sequentially, multi-step latency increases significantly.
  *Mitigation*: The Composer pre-resolves explicit user gestures (e.g., `@shadcn` or `/deploy`) into active skill/tool pointers in the initial turn context, bypassing runtime search when user intent is explicit.

### For Option E (Two-Lane Split)
- **Failure Mode — Inconsistent Workspace Scoping and Lifecycle Drift**: Skills and tools lifecycle states get out of sync (e.g., a plugin's tool is enabled in a workspace while its accompanying skill documentation is orphaned or unindexed).

### For Option B (Single Universal `capability_invoke`)
- **Failure Mode — Security and Safety Policy Collapse**: The host cannot intercept dangerous tool executions with human-in-the-loop approvals without also intercepting harmless documentation reads, leading to either user prompt fatigue or catastrophic unvetted executions.

---

## What We Missed (§4 Attack)

### 1. Missing and Miscategorised Capability Classes
- **Lifecycle & Event Interceptors (Host Hooks)**: *Missing entirely.* E.g., `on_publish`, `before_tool_call`, content validation gates, and PII redactors. These are neither agent-invoked tools (`CALL`) nor static prompts (`SHAPE`); they are host-enforced middleware policies.
- **Ambient Credential / Auth Providers**: *Missing.* Capabilities that supply ephemeral OAuth tokens, dynamic database connections, or scoped API keys.
- **Bidirectional Interactive Client Widgets**: *Miscategorised under `RENDER`.* An interactive visual component (e.g., canvas editor, color palette picker, spatial map selector) is not merely a passive display artifact; it renders a UI *and* returns structured user-interaction payloads back to the agent session.
- **Stateful Sub-Agent Delegations**: *Miscategorised under `CALL`.* Sub-agents maintain their own conversational memory, tool scope, and pause/resume lifecycle. Modeling delegation as a synchronous RPC call fails on long-running or interactive tasks.

### 2. Critique of the Grouping Axis
"What the agent does with it" is the **wrong primary architectural axis**. It is purely agent-centric and ignores host isolation, execution trust, lifecycle management, and tenancy. 

The primary architectural axes must be:
1. **Execution Modality & Binding Lifecycle**: Ambient Context Directive vs. On-Demand Dynamic Retrieval vs. Transactional RPC vs. Client Event Listener.
2. **Side-Effect & Trust Boundary**: Read-Only / Idempotent vs. Local Mutation vs. External Network Egress vs. System Administrative.
3. **Tenancy Scope**: Global System vs. Workspace-Scoped vs. User-Private vs. Ephemeral Session.

### 3. False Groupings in §4
- **`CALL` False Grouping**: Lumps deterministic, read-only internal queries (`get_post`) with side-effectful external RPCs (`deploy_to_vercel`) and stateful sub-agent handoffs.
- **`SHAPE` False Grouping**: Lumps non-deterministic prompt heuristics (personas/styles) with deterministic host security invariants (permission policies and execution gates).

---

## Structural Dimensions

1. **Lifecycle (Load-bearing)**: Capabilities must register under a canonical URN (`tovu:<modality>:<package>:<item>`). Dynamic content digests (`packages/sha256/*`) should pin execution in historical chat logs for auditability, but point to active aliases for new sessions. Uninstalled capabilities must return structured `CapabilityUnavailableError` envelopes instead of silent prompt corruption.
2. **Trust and Admission (Load-bearing)**: Trust cannot rely on ad-hoc tool allowlists (`MCP_UI_REDEEMABLE_TOOL_IDS`). The unified descriptor must specify a declarative `TrustProfile` (`READ_ONLY`, `MUTATING_SAFE`, `SENSITIVE_EGRESS`). The host execution dispatcher enforces permission prompts uniformly across first-party, MCP, and third-party tools.
3. **Failure Modes (Load-bearing)**: External MCP sub-processes and remote plugins must be wrapped in strict timeout guards (e.g., 15s), circuit breakers, and standardized error envelopes. A crashed or malformed MCP server must gracefully fail with a structured tool error rather than hanging the daemon or agent CLI process.
4. **Tenancy and Scoping (Load-bearing)**: Tovu is multi-tenant. The capability registry and its FTS5 index must support workspace filtering (`workspace_id = :active_workspace OR workspace_id IS NULL`). Cross-tenant capability leakage or credential sharing is a critical security violation.
5. **Freshness / Invalidation (Load-bearing)**: Boot-time-only static seeding is unacceptable in a production CMS where users install plugins and connect MCP servers at runtime. The FTS5 index must be stored in the primary SQLite/Postgres database (or dynamically updated in-memory via pub/sub events) to support live hot-reloading without daemon restarts.
6. **Discovery Cost and Scale (Load-bearing)**: At 131+ tools and dozens of skills, full schema injection wastes token context and degrades selection accuracy. The system must use a **Two-Tier Model**: Tier 0 baseline tools (`search_tools`, `describe_tool`, `search_skills`, `read_skill`) are always present in the schema; Tier 1 capabilities are retrieved just-in-time via BM25/Doc2Query search.
7. **Guaranteed vs. Optional Delivery (Load-bearing)**: Empirical evidence proved that dumping 30 reference files (14.8k chars) unconditionally into prompts degrades agent performance. The rule: **Never inject bulk reference bodies**. Pinned chips inject explicit procedural pointers ("Follow skill X via `read_skill`"); unpinned capabilities are discovered autonomously via search.

---

## What Would Change My Mind

1. **Empirical Agent Steerability Parity**: Concrete benchmark evidence demonstrating that frontier and local models follow procedural instructions returned from generic tool outputs (`capability_invoke`) with identical fidelity and latency as system/context-injected instructions, without token context degradation across multi-turn sessions.
2. **MCP Specification Evolution**: If the MCP standard introduces native, autonomous client-side resource/prompt retrieval loops adopted universally across all agent CLIs (Claude Code, Gemini CLI, Aider, Cursor), making external MCP servers zero-cost and universally discoverable for static documentation.
3. **Catalog Scale Collapse**: If real-world Tovu deployments never exceed 20 total tools/skills per workspace, making ranked FTS5 retrieval unnecessary overhead compared to static schema injection.

---

## Blind Spots

- **(a) Viable Unlisted Option**: **Just-In-Time (JIT) Virtualized Tool Synthesis from Declarative Contracts**.
  Instead of hosting persistent running MCP daemons or static tool registrations, plugins declare lightweight OpenAPI specs, JSON-schemas, or Markdown workflows with YAML frontmatter. The host synthesizes ephemeral, sandboxed in-memory tools on demand per workspace session, compiling different capability types into a uniform execution format at zero idle cost.
- **(b) The Question We Should Be Asking**:
  *Are we designing an information retrieval problem for an LLM, or are we designing an isolated, multi-tenant Host Extension Micro-Kernel?*
  Focusing exclusively on search indexing (BM25 vs. vector, prompt injection vs. tools) obscures the harder engineering requirements: crash isolation, deterministic security sandboxing, rate limiting, credential delegation, and workspace tenant isolation.
- **(c) Most Likely False Assumption**:
  *The assumption that a generalist agent can autonomously discover, disambiguate, and safely execute arbitrary third-party capabilities from vague user prompts without deterministic orchestrator pre-routing.*
  In production systems, broad natural-language retrieval over hundreds of third-party capabilities yields high tool hallucination and parameter mismatch. High-reliability architectures rely on deterministic intent classification and composer UI pre-binding before delegating execution to the agent.

<<SWARM_END>>


---

# ===== PARTICIPANT 3 of 4: Codex GPT-5.6-sol (high) =====

I’m loading the repository’s mandatory bootstrap instructions first, then I’ll use the codebase-understanding skill to ground the architectural judgment. I’ll keep the repository read-only and won’t run tests or servers.

Codex(Consensus): The graph-generation skill would write analysis artifacts and pause for configuration, which conflicts with this packet’s explicit read-only/no-modification scope, so I’m not running it. I’ll instead ground the answer directly in the mandated architecture sections, project memory, and the bounded source files; the repository’s preferred graph MCP is not exposed in this session, so direct reads are the allowed fallback.

Codex(Consensus): The mandated `tovu-architecture.md`, `tovu/PROJECT_MEMORY.md`, and `tovu/src/INFO.md` are absent from this checkout, so I cannot consult them; I’ll mark conclusions that would depend on those documents as provisional. The source files named in the packet are present, and I’m validating the load-bearing contracts there now.

Codex(Consensus):

## Position

Choose **F: a unified capability discovery and policy plane over multiple execution adapters**. Model each capability as an extensible envelope with stable identity, searchable metadata, provenance, revisions, scope, policy requirements, and a list of typed operations; do not force every capability through one universal `invoke` mechanism. Reuse the existing FTS5 catalog and tool execution infrastructure, but generalize discovery beyond tools and keep tool calls, resource reads, prompt activation, background jobs, and rendering on purpose-built lanes.

## Why

The requirement is not “make every capability the same.” It is “let users and agents discover capabilities without knowing their kind, including kinds not invented yet.” Those are different problems.

A good core model is approximately:

```ts
interface CapabilityRecord {
  id: string;                 // stable logical identity
  revision: string;           // immutable source/version identity
  name: string;
  description: string;
  searchText?: string;
  provenance: CapabilitySource;
  scope: CapabilityScope;
  status: CapabilityStatus;
  operations: readonly CapabilityOperation[];
  extensions?: Record<string, unknown>;
}
```

Each operation should carry its own contract:

```ts
type CapabilityOperation =
  | { protocol: "tool-call"; operationId: string; inputSchema: JsonSchema }
  | { protocol: "resource-read"; uriTemplate: string; mediaTypes: string[] }
  | { protocol: "prompt-activate"; fragmentRef: string }
  | { protocol: "job-submit"; jobType: string; inputSchema: JsonSchema }
  | { protocol: "artifact-render"; mediaTypes: string[]; rendererHint?: string }
  | { protocol: string; contract: unknown };
```

The built-in protocols are conveniences, not a permanently closed taxonomy. Unknown protocols remain indexable and inspectable; they become executable only when a registered adapter and operator policy admit them. Adding a future protocol therefore adds one adapter and perhaps one policy module—not fields or migrations across every existing capability kind.

This yields one agent-facing discovery vocabulary:

- `capability_search(query, intent, scope)`
- `capability_get(id, revision?)`
- potentially `capability_activate(id, operationId, input)`

`activate` should be a router, not a universal executor. It resolves the operation, verifies the revision and scope, applies policy, and delegates to the proper adapter. Existing tools can continue through `ToolExecutor`; external MCP can continue through federation; readable plugin assets can use a bounded resource reader; jobs can return handles; prompt fragments can participate in explicit context assembly.

This distinction prevents the central registry from becoming a lowest-common-denominator union or a security bypass. Unification belongs in identity, discovery, provenance, lifecycle, and admission—not necessarily in transport, authorization, failure semantics, or output delivery.

The repository already supplies useful foundations:

- The FTS5/BM25 catalog provides disposable ranked discovery and already reaches spawned CLIs.
- The contribution-registry pattern is a suitable provider seam.
- `ToolExecutor` remains the correct execution authority for registered tools.
- External MCP already demonstrates why source-specific admission is necessary.
- Agent Plugin content-addressed revisions provide the beginning of stable revision identity.
- The existing three descriptors should become projections of one core record, not three competing sources of truth.

For the near-term image-generation MCP, the MCP tool remains callable through the existing lane. Its result should contain typed content or durable artifact references, such as `image/png`, and chat should select a renderer by media type. That does not require implementing MCP-UI now. It does require avoiding a tool-result contract that reduces every result to plain text; otherwise generative UI later will force a transport and persistence rework.

## Rejected

### A. Keep the current architecture

Reject.

It fails the core need:

- Agent Plugins and their individual skills remain undiscoverable unless users pin the right plugin.
- The hardcoded eponymous-skill convention makes valid third-party packages unreachable.
- Multi-skill plugins cannot identify individual skills.
- Prompt injection sends roughly 14,800 characters repeatedly without evidence of benefit.
- AG-UI drops pinned context entirely.
- Grouping by plugin ID exposes packaging structure rather than user capability.

This is cosmetic UI work around a missing agent-facing contract.

### B. One unified registry plus universal search/get/invoke

Reject **as literally stated**, but retain its unified discovery idea.

A single descriptor with a closed `kind` or `activate` union simply creates a fourth descriptor that must change whenever a new mechanism appears. A universal `capability_invoke` also risks erasing critical differences among synchronous calls, resource reads, prompt changes, jobs, and UI effects.

B becomes viable if “invoke” is a policy-enforced adapter router and operations use an open protocol namespace. At that point it is effectively the recommended F design.

### C. Add only Agent Plugin search/read tools

Take seriously as a tactical repair, but reject as the strategic endpoint.

It would cheaply fix the largest current reachability gap, and it should influence the first implementation slice. It does not solve:

- cross-kind discovery for vague user intent;
- duplicated descriptors and UI projection drift;
- lifecycle and saved-reference semantics;
- future capability kinds;
- consistent tenancy, policy, health, and revision handling.

It is appropriate only if the owner wants a deliberately temporary, low-risk bridge.

### D. Everything becomes MCP

Reject.

MCP is a useful interoperability protocol, not Tovu’s complete domain model. Wrapping everything in MCP does not remove Tovu’s obligations for tenant scope, installation state, revision pinning, operator admission, authorization, provenance, health, and UI projection.

It also creates artificial servers for local static content and prompt fragments, and risks treating untrusted remote descriptions and results like reviewed first-party definitions. MCP resources, prompts, and tools may be adapter inputs, but MCP should not own Tovu’s policy truth.

### E. Two-lane callable/readable split

Take seriously, but reject as the final abstraction.

It is materially better than A and C and safer than a universal executor. However, two lanes become three or five as soon as the system gains background jobs, subscriptions, context shapers, interactive UI, credentials, or composite workflows. “Callable versus readable” is not a stable future boundary.

It can be an internal implementation decomposition beneath the unified discovery plane.

## Failure modes and hidden costs

### Recommended F: unified discovery, typed adapters

Failure modes:

- The central envelope can become a “god schema” if source-specific fields leak into its core.
- Search may return capabilities the current transport cannot activate.
- Stable logical IDs may incorrectly resolve to incompatible upgraded revisions.
- Adapter authors may implement inconsistent error, timeout, and authorization semantics.
- Search relevance may deteriorate when tools, documents, workflows, and prompt fragments compete in one index.
- A generic activation router can become a confused deputy if it trusts capability-supplied policy metadata.

Hidden costs:

- A capability SDK and conformance tests are needed for third-party authors.
- The system needs projection compatibility for the agent, composer, administration, and storage layers.
- Search evaluation must become intent-aware; one global BM25 ranking may unfairly mix incomparable operations.
- Policy decisions must be independently authored and bound to source, operation, scope, and revision.
- Live invalidation, health state, and reference migration are real product features—not descriptor fields.

Wrong choice if Tovu only ever supports callable tools plus static documents, or if third-party extensibility is abandoned. In that narrower world, E is simpler.

### C: Agent Plugin search/read

Failure modes:

- Plugin search finds packages while the needed unit is an individual skill or resource.
- Arbitrary file reads expose secrets or oversized content unless package roots and limits are enforced.
- Search results can point at duplicate or removed digests.
- Retrieval may remain optional and be ignored by the model.

Hidden costs:

- The temporary API becomes public and hard to retire.
- A second search index and second relevance vocabulary can drift from tool search.
- The composer still needs a separate projection.

Wrong choice once the next non-tool/non-document capability appears or cross-kind vague-intent discovery is required.

### E: callable/readable lanes

Failure modes:

- Hybrid capabilities must be duplicated or arbitrarily assigned.
- Read operations may have side effects, billing, access control, or live network failure.
- “Callable” groups immediate actions with asynchronous jobs and delegation despite different guarantees.
- Rendering and prompt activation have no natural home.

Hidden costs:

- Two indexes require query routing or result merging.
- Policy, identity, lifecycle, and tenancy logic tends to be duplicated.
- Adding each new lane changes the agent’s discovery protocol.

Wrong choice when extensibility to unknown mechanisms is a hard requirement rather than a slogan.

## What we missed (§4 attack)

### Missing or wrongly covered capability classes

- **OBSERVE/SUBSCRIBE:** event streams, webhooks, filesystem watchers, database change feeds, and notification sources. These are neither ordinary calls nor reads.
- **WRITE/MUTATE:** content editors, patch producers, transaction APIs, and deployment actions. CALL hides their side effects and rollback requirements.
- **PRODUCE/TRANSFORM:** compilers, converters, generators, and pipelines that produce durable artifacts. Their important contract is inputs, outputs, provenance, and retention—not merely that they were called.
- **ORCHESTRATE:** workflows, plans, tool chains, agent graphs, and composites. These coordinate capabilities and may suspend, retry, compensate, or await approval.
- **DELEGATE:** sub-agents are principals with bounded authority, context, budget, and lifetime—not ordinary functions.
- **SCHEDULE/TRIGGER:** scheduled jobs are lifecycle-bearing declarations plus later executions, not simple calls.
- **TRANSACT:** capabilities requiring confirmation, staged preview, commit, compensation, or idempotency keys.
- **ACQUIRE INPUT:** forms, OAuth consent, secret selection, file picking, or human approval. These pause execution and require user interaction.
- **CONNECT/AUTHENTICATE:** credentials and external connections are enabling resources, not agent actions. They affect availability and scope.
- **QUERY:** structured search and live knowledge queries differ from static READ because they have schemas, cost, latency, and potentially hostile results.
- **STORE/REMEMBER:** durable memory writes, indexing, cache population, and preference persistence.
- **VALIDATE/GUARD:** policy checks, schema validators, linters, moderation, and security scanners may constrain other operations.
- **CONFIGURE:** model/provider selection and settings alter runtime composition but should not be mixed with immutable personas.
- **INTERCEPT:** hooks and middleware execute around other operations and have ordering/reentrancy semantics.
- **NEGOTIATE:** capability discovery, protocol negotiation, and dynamic tool-list changes are meta-capabilities.
- **COMPOSITE/HYBRID:** one installed package may expose tools, skills, resources, renderers, and hooks. Packaging is not capability identity.
- **PHYSICAL/DEVICE:** sensors and actuators add presence, locality, exclusivity, and safety constraints.
- **ECONOMIC:** paid APIs, procurement actions, quota grants, and market transactions require budget policy beyond generic invocation.

### The grouping axis is wrong

“What the agent does with it” is useful search metadata, but it is not a sound primary type system. A single capability may be read, invoked, subscribed to, and rendered; one operation may cross several verbs.

The primary axis should be the **operation contract**:

- protocol/adapter;
- input and output schema/media types;
- sync, streaming, or asynchronous completion;
- side-effect and reversibility semantics;
- trust and authorization requirements;
- scope and tenancy;
- lifecycle/revision behavior;
- delivery guarantee;
- interaction requirements.

User-intent verbs should remain searchable facets such as `design`, `publish`, `inspect`, or `deploy`, not structural kinds.

### False groupings

- **CALL is false:** an MCP tool call, shell command, delegated agent, and scheduled job do not share execution, identity, timeout, or authorization semantics.
- **READ is false:** immutable plugin markdown, workspace files, live knowledge bases, and project memory differ in freshness, trust, access control, query semantics, and cost.
- **SHAPE is especially false:** prompt fragments influence model context; hooks execute code; permission policies constrain authority; model selection changes runtime/provider; output styles constrain presentation. They should not share an activation mechanism.
- **RENDER is not an agent capability category:** images are output media; themes are UI configuration; embeds are renderers; content transforms are producers. Rendering should be negotiated from typed output and renderer availability.
- `source` is too weak: provenance must distinguish publisher, installation, connection, workspace, trust tier, and immutable revision.
- `kind` is dangerous if closed. Prefer namespaced operation protocols and extension metadata.
- `activate` is underspecified. Activation must identify a specific operation and return a typed result, job handle, context contribution, or interaction request.

## Structural dimensions

### 1. Lifecycle — load-bearing

Use a stable logical ID plus immutable revision:

```text
capability://publisher/package/capability
revision = package digest or provider version
```

Saved references should record both. Resolution rules:

- Same revision present: resolve exactly.
- Logical ID present but pinned revision absent: mark `upgrade-available` or `incompatible`; do not silently retarget execution.
- Source disabled: preserve the reference as disabled with an actionable reason.
- Source removed: preserve a tombstone sufficient to explain provenance and recovery.
- Upgrade declares compatibility: offer explicit migration or allow policy-defined automatic migration for non-executing references.

Installation state belongs in existing workspace storage. The FTS index should remain disposable.

### 2. Trust and admission — load-bearing

Unification makes trust easier to inspect but more dangerous if it implies equal trust.

There should be one policy decision interface, not one uniform policy:

```text
admit(principal, workspace, capability, revision, operation, requestedInput)
  -> allow | deny | require-confirmation | require-configuration
```

Its inputs include independent source classification and operator grants. Capability-authored hints may demote privileges, never promote them. The existing MCP federation rules point in the right direction; the browser allowlist should become another policy projection rather than an unrelated constant.

Discovery does not imply admission, and admission does not imply authority for every principal.

### 3. Failure modes — load-bearing

Normalize failure envelopes without hiding adapter detail:

- unavailable/disabled;
- authentication or configuration required;
- denied or confirmation required;
- timeout;
- rate limited;
- invalid input;
- malformed/untrusted output;
- remote failure;
- partial result;
- stale revision;
- unsupported protocol.

The agent receives structured retryability and remediation metadata. The user sees source, operation, plain-language status, whether anything may have changed, and safe next actions. Timeouts, cancellation, bounded retries, circuit breakers, and idempotency belong to operation policy.

### 4. Tenancy and scoping — load-bearing

Every listing, search, describe, and activation must be evaluated against authenticated workspace/site/user context. Never build one daemon-global catalog and filter only after retrieval if descriptions themselves may be sensitive.

Use either per-scope indexes or mandatory scope predicates in a shared persistent index. Provider registration can be process-global; capability instances and grants cannot be.

### 5. Freshness/invalidation — load-bearing

Boot-only seeding is acceptable for static first-party registrations. It is incorrect for installable plugins, remote MCP list changes, enable/disable actions, connection changes, or upgrades.

Providers should publish revisioned catalog events. The search projection can incrementally upsert/delete or rebuild atomically. Active runs may use a snapshot for determinism, while new searches see the latest generation.

### 6. Discovery cost and scale — important, not foundational

At 131 tools, ranked retrieval is already justified by the reported quality problems. There is no universal count where listing “breaks”; it depends on description length, model context, ambiguity, and task distribution.

For small catalogs, retrieval still works if there is a fallback that returns all eligible results when the query is empty or confidence is poor. Measure per-intent recall@k, exact-name recall, category recall, and activation success. Consider federated ranking by operation family followed by merged scoring rather than forcing all records into one undifferentiated BM25 competition.

### 7. Guaranteed versus optional delivery — load-bearing

Discovery alone cannot guarantee use. Capabilities need explicit delivery semantics:

- `available`: searchable, may be selected;
- `recommended`: surfaced strongly but not injected;
- `required-context`: resolved and delivered before execution;
- `required-policy`: must constrain every relevant operation;
- `user-pinned`: guaranteed for this turn/run;
- `on-demand`: fetched only after selection.

Required content should be resolved centrally, size-bounded, summarized where permitted, and acknowledged in run telemetry. Dumping file paths into a prompt is not delivery. The reported experiment suggests optional attachment is too weak and indiscriminate injection is too noisy; it does not prove skills are ineffective, because selection, wording, task match, and measurement may all be confounders.

MCP-UI itself is deferrable. Typed multimodal result envelopes, artifact persistence, and a renderer registry are not; omitting those now would couple tool execution to plain text and force later rework.

## What would change my mind

I would move toward E if evidence showed that all plausible capabilities reduce cleanly to only two stable contracts—tool invocation and bounded resource retrieval—and that hooks, jobs, prompts, subscriptions, and rendering will not be third-party extensibility points.

I would accept literal B if a prototype demonstrated:

- an open operation protocol rather than a closed `kind` union;
- no bypass of source-specific policy;
- correct workspace filtering;
- revision-safe saved references;
- consistent transport support across Local CLI, BYOK, and AG-UI;
- better cross-kind recall and task success than separate catalogs.

I would favor D if MCP formally covered Tovu’s needed lifecycle, tenant policy, immutable revision references, delivery guarantees, typed artifacts, and host authorization—and third-party clients interoperated with those features without Tovu-specific conventions.

I would favor C as the release plan if user evidence showed the only immediate failure is inaccessible individual Agent Plugin skills and the owner explicitly accepted later replacement.

My confidence is limited by the absence of the repository-mandated `tovu-architecture.md`, `tovu/PROJECT_MEMORY.md`, and `tovu/src/INFO.md` in this checkout. Discovering them elsewhere could change boundary or migration details, though not the central distinction between unified discovery and heterogeneous execution.

## Blind Spots

(a) **Capability broker with late-bound provider negotiation.** Instead of primarily cataloging installed capabilities, catalog abstract intents/contracts such as “generate an image” or “deploy a site”; providers bid or match at runtime based on availability, policy, cost, quality, locality, and user preference. Installed tools become implementations of contracts, enabling substitution and fallback without teaching the agent provider names.

(b) **Are we optimizing capability discovery when the real bottleneck is reliable task completion?** The system should ask which planner, selection, confirmation, execution, observation, retry, and evaluation loop produces successful outcomes—not merely whether the agent can retrieve the right descriptor. A perfect catalog can still yield zero value if the model ignores required context or cannot verify results.

(c) **The most questionable assumption is that the assistant should “figure out how to use” arbitrary capabilities mainly from authored descriptions.** Third-party descriptions are often incomplete, adversarial, stale, or written for humans rather than planning. Reliable use may require executable contracts, examples, conformance tests, policy metadata, observed success history, and postcondition checks; semantic search over prose alone may never provide the guarantee implied by the request.

<<SWARM_END>>

---

# ===== PARTICIPANT 4 of 4: Claude Sonnet 5 (in-host, Software Architect) =====

# Claude Sonnet 5 (in-host subagent, Software Architect persona) — Round 1

*Persisted by the Coordinator from the teammate message, verbatim. The agent went idle twice without
writing it itself; content is byte-faithful to what was received.*

## Coordinator's two specific asks, answered up front

**1. Factual correction, file+line.** Packet §2.5.6 states the composer menu is "six groups, five of which are hardcoded single-row stubs." Reading `apps/admin/src/features/plugins/composer-capabilities.ts:221-321` directly, `BUNDLED_CAPABILITIES` has exactly **five** entries across five distinct `groupId`s (`regular-plugins`, `agent-plugins`, `skills`, `mcp`, `tools`) — **four** stubs (word-count, the ui-ux-design agent-plugin chip, the ui-ux-design skill row, `/mcp` settings-nav) and **one** wired to a real backend tool (`tool:content-search` → `content_post_search` via `allowlisted-tool-call`). Off by one on both the group count and the stub count.

**2. Can `ToolRegistration`/`ToolDescriptor` already carry a non-callable catalog row without breaking `ToolExecutor`? Answer: partially, and the "no" half is load-bearing.**

I went outside the bounded 12-file set for this because the types live in the sibling Jini repo (`node_modules/@jini-ai/{core,daemon}` resolve via symlink to `/Users/la/Programming/Jini/packages/{core,daemon}` — read-only, no repo state touched). Source:

- `Jini/packages/core/src/tool-registry.ts:39-59` — `ToolDescriptor` is pure metadata (`id`, `description?`, `inputSchema?`, `requiresConfirmation?`, `timeoutMs?`, `maxOutputBytes?`). It carries no handler reference and no "callable" flag at all.
- `Jini/packages/core/src/tool-registry.ts:142-146` — `ToolRegistration` is `{ descriptor: ToolDescriptor; handler: ToolHandler; policy: ToolPolicy }`. **`handler` is not optional.** `ToolRegistry.register()` (line 151) takes this whole triple — there is no API to register a descriptor alone.
- `Jini/packages/daemon/src/tool-executor.ts:322-496` — `execute()` has no branch anywhere that checks "is this entry read-only, skip invocation." Once authorization (and confirmation, if required) passes, the resolved `handler` is unconditionally invoked (line 461). There's no inert/preview mode built into the executor.
- Confirmed in Tovu's own `src/assistant/tool-catalog-query.ts:56` — `buildToolCatalogQuery` only requires `Pick<ToolRegistry, "list">` and only ever reads `descriptor.id/description/inputSchema` (lines 68-79) to seed the FTS5 index. It never touches `handler` or `policy`.

So: **the FTS5 catalog layer itself doesn't care whether a real handler exists** — it's a plain projection of descriptors. But **the real `ToolRegistry` instance that `buildAssistantToolRegistrations` populates cannot hold a handler-less entry** — the type won't allow it. That means "seed a non-callable skill into the SAME registry Option B imagines" forces one of two paths: (a) write a trivial real handler that just returns the skill's markdown — which works with zero core changes, but then it's not actually "non-callable," it's just an ordinary read-only tool (indistinguishable from `content_post_search`), which quietly undercuts the premise that a distinct non-executable kind is needed; or (b) widen `ToolRegistration`/`ToolDescriptor` in the shared `@jini-ai/core` package to add an optional-handler variant — a real type change to a kernel shared by every consumer of that package, not a Tovu-local edit, and exactly the kind of per-kind schema growth the packet's own hard constraint says to avoid.

This is why my Position below builds the content lane as a **second, independent `buildToolCatalogQuery`-shaped index** (a lightweight object with just a `.list()`, never a real `ToolRegistration`) rather than trying to inject non-callable rows into the real `ToolRegistry`. It's mechanical confirmation, not inference, that a literal "one shared descriptor type for everything" reading of Option B either forces a type change to a published cross-repo package or collapses into "every capability is just an ordinary tool" — undermining unification's own justification.

---

## Position
Two lanes, not one: keep the CALL lane exactly as it is (`tool-registrations.ts` + `mcp-federation/trust.ts`'s two-tier native/federated split), and build the missing READ lane as a second FTS5/BM25 index — the same mechanism `tool-catalog-query.ts` already proved out for tools, but backed by its own lightweight `.list()`-only source rather than a real `ToolRegistry` — seeded from Agent Plugin skills (and later docs/KBs/project memory) with one `capability_content_search` / `capability_content_read` tool pair. This is Option E, sharpened: reuse of infrastructure that already exists and already works, not a third lane bolted on speculatively.

## Why
`mcp-federation/trust.ts`'s own header already answered the unification question once: native and federated tools differ in five structural properties (review status, self-declared-risk trustworthiness, permission model, destructive-default posture, and whether the description itself is attacker-controlled text), and the fix wasn't a shared schema — it was two separate admission pipelines, with the federated one demonstrably more defensive (8 explicit rules: namespaced ids, default-deny allowlist, hints-demote-only, frozen-at-connect, provenance-labeled, untrusted-data-wrapped results). That split is working, tested, and cited by name as the established shape for "something announces itself to a core-owned seam" in three other registries (`page-head.ts`, `routing.ts`, `tool-contribution-registry.ts`). A unified capability descriptor has to either carry that whole trust/execution discriminated-union inside one shape (the schema-migration-per-kind risk the packet's hard constraint rules out — and now mechanically confirmed above: `ToolRegistration.handler` is non-optional in the actual kernel type), or paper over it with one generic `capability_invoke` that just relocates the `kind`-switch into the invoke handler.

Agent Plugin skills, meanwhile, are not executable at all — `capability-projection.ts` models a Skill's entire contract as `{kind: "context-injection", markdown}`, explicitly "No trust model needed." That's structurally a READ, and today it has zero tool surface — the only path to the agent is the composer's `pluginRefId` chip → `resolve-agent-plugin-refs.ts`'s prompt-prefix injection. Standing up a second FTS5 index over installed-skill content (proven pattern, now confirmed to need no core-type changes since it only touches descriptor fields) is the smallest true fix that doesn't touch the CALL lane's trust model at all.

## Rejected
- **A (keep current architecture).** Doesn't address the need — Agent Plugins stay permanently unreachable except the one hardcoded eponymous-skill chip; a composer reshuffle is cosmetic. Rejected outright.
- **D (everything becomes an MCP server).** Erases the native/federated trust split `trust.ts` built on purpose (wrapping a first-party tool in MCP-server shape doesn't remove the need for `DerivedRiskByToolId`/`authorize()`, it just relabels it), and doesn't fit Agent Plugin skills structurally — modeling static markdown as a fake remote tool call is a protocol mismatch worse than a plain read tool, and still leaves the digest/lifecycle gap below untouched.
- **B (one unified registry/descriptor + one search/get/invoke tool), as literally scoped.** Now mechanically confirmed, not just argued: `ToolRegistration.handler` is required at the type level (`Jini/packages/core/src/tool-registry.ts:144`), so a truly non-callable row either needs a kernel type change or collapses into "just another ordinary tool." I'm not rejecting the *impulse* (one discovery surface is valuable — see Blind Spot (a)), only descriptor/execution unification specifically.

## Failure modes and hidden costs
- **E, sharpened (my pick).** Cost: two indexes to keep conceptually distinct — a new capability kind requires deciding which lane it belongs to, and SHAPE/RENDER items from §4 don't obviously belong to either. Failure mode: a genuinely bimodal future kind (readable AND callable) forces an arbitrary split between the two.
- **C (agent_plugin_search/read as a standalone terminal fix).** Not wrong, just under-scoped — fixes today's gap but the next READ-ish kind repeats the one-off work. Only preferable to E if there's real conviction no second READ kind is coming — the packet's own §1 says the opposite.
- **B, in its strongest form (a shared discovery facade over separately-executed lanes — see Blind Spot (a)).** Cost: extra indirection, and a real risk that "one search tool" quietly becomes "one trust tier" by convenience over time — exactly what `trust.ts` exists to prevent. Needs a standing rule (ADR) that the facade never becomes an execution facade.
- **D, if ever revisited.** Only becomes right if Tovu ever exposes its own tools TO external MCP clients (Tovu-as-server) — a different direction of federation than this packet, so off-topic here, not a live counterargument.

## What we missed (§4 attack)
- **CALL is a false grouping**, proven by `trust.ts`'s own header: first-party and external MCP tools share a verb but must never share an admission pipeline (five structurally different trust properties). Sub-agent delegation and scheduled/triggered jobs are filed under CALL with zero supporting design anywhere in the 12 files — entirely different concerns (recursive trust/context isolation; idempotency/backoff) that "invokes it" doesn't capture.
- **SHAPE doesn't belong in this taxonomy at all.** Personas, prompt fragments, permission policies, model selection *configure* the agent; they aren't capabilities it discovers and uses the way a tool or skill is. Different axis entirely — none of the 12 files touch it.
- **RENDER isn't a real fourth bucket** — it's a consequence of CALL (an inline image is a tool-call result shape) or a SHAPE item (a theme is site config, never something the agent invokes). Grouping "inline images" with "themes" groups by effect-on-screen, not mechanism.
- **The right axis is admission/trust pipeline, not verb.** Native-CALL, federated-CALL, and content-READ are the three buckets with distinct mechanisms *today* (three different files, three rule sets); SHAPE and scheduling are undesigned placeholders, not a fourth/fifth mechanism yet.

## Structural dimensions
- **(1) Lifecycle — load-bearing, not hypothetical.** `resolve-agent-plugin-refs.ts`'s own header: "There is no record anywhere... of which installed digest is 'the' current install," confirmed by its live zero/one/many-match handling (ambiguous ref fails loud today for lack of an activation table). Build this before or alongside the READ lane — more discoverable surfaces make an unresolved ambiguity more likely to surface, not less.
- **(2) Trust and admission — load-bearing, strongest argument against B/D.** The native/federated split in `trust.ts` is a considered answer already, and now mechanically confirmed as type-incompatible with naive unification (see the ToolRegistration answer above). Any design must preserve it.
- **(3) Failure modes — real, tractable, not novel.** `trust.ts` R5 (frozen-at-connect) and its refusal-reporting already handle "external thing is unreliable" for CALL. READ needs the equivalent (a stale/removed skill file reports readably) — a small extension, not new design.
- **(4) Tenancy/scoping — load-bearing, with a cited incident.** `install.ts`'s SECURITY note describes a real prior bug: a hand-stitched workspace layout from two `forWorkspace()` results type-checked and published cross-tenant. Any new content index must be workspace-scoped from day one.
- **(5) Freshness/invalidation — not load-bearing.** `tool-catalog-query.ts` is already boot-time-seeded and disposable by design. A content index following the identical pattern matches existing accepted behavior, not a new problem.
- **(6) Discovery cost/scale — load-bearing, with a measured number.** The naive scorer already tied at 18 tools; BM25 was needed and the gap "widens, not narrows" at 131 tools today. Direct evidence to reuse FTS5 for the content lane.
- **(7) Guaranteed vs optional delivery — the single most important number in the whole packet.** The measured 0-of-30 vs 4-of-4 read-rate swing (`resolve-agent-plugin-refs.ts` inline comment, ~lines 169-178) means a search tool is necessary but not sufficient: if framed as "optional," the same failure repeats regardless of architecture.

## What would change my mind
If a real, operator-authored admission record for federated/Agent-Plugin MCP servers ships (the deferred future work both `capability-projection.ts` and `trust.ts` name) such that the native/federated trust gap provably closes, full unification (B) becomes much stronger — my rejection is that the gap is real and current, not that unification is wrong in principle. Separately, if capability count grows an order of magnitude such that maintaining two-then-N retrieval tools becomes the actual bottleneck (not trust modeling), that pushes toward a shared discovery facade (Blind Spot (a)) sooner.

## Blind Spots
(a) **Unlisted option: a shared discovery facade over separately-executed lanes.** One `capability_search` tool fanning out to each lane's own index (existing tool catalog + new content index), returning lane-labeled results — most of B's UX win, none of its schema-unification or trust-collapse cost, since execution stays fully separate per lane. Nothing in the packet's six options names this directly.

(b) **The question we should be asking: not "what shape unifies capabilities" but "what happens to a saved reference when its source changes underneath it."** Every mechanism examined dodges this: `resolve-agent-plugin-refs.ts` fails loud on ambiguous digests instead of resolving them; `trust.ts` R5 freezes the federated set at connect specifically to avoid a live-update story; `tool-catalog-query.ts` accepts "reseeded wholesale at boot" as the whole staleness answer. A unified bucket doesn't make this go away — it means one failure-handling story now has to cover install/upgrade/uninstall for every kind at once.

(c) **The framing assumption most likely wrong: that this is a discoverability problem at all.** The packet is scoped around "the assistant must be able to *find* and use" a capability — but its own §2.7 evidence shows the Agent Plugin failure wasn't a discovery failure: the skill's full content was already unconditionally in the prompt (~14,800 characters, no search needed), and the agent still didn't act on 30 of 30 referenced files until the wrapper stopped hedging. That's instruction-following, not findability. `capability_search` may still help MCP-tool selection at 131+ tools, but treating "make it findable" as the fix for "the agent didn't use it" risks solving the wrong half of the §1 need statement.

<<SWARM_END>>


---

End of Round 1 responses. Now answer DP1-DP5 and produce your build outline.
No code. Reason through why every piece exists.
