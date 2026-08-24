# CTX — Round 2 (informed): canary harness design, not re-argument

Packet id: `CTX-TOVU-CAPABILITY-MANIFEST-FORK-ROUND2-2026-08-23`
Round: 2 of 2 (informed — full Round 1 reasoning from every participant follows, verbatim)

## ACK

Reply first with exactly:
`ACK_PACKET_RECEIVED CTX-TOVU-CAPABILITY-MANIFEST-FORK-ROUND2-2026-08-23 -- I received the packet and will work on it.`

## What Round 2 is for

Round 1 (packet `CTX-TOVU-CAPABILITY-MANIFEST-FORK-2026-08-23`) asked five independent participants —
Primary (Claude Sonnet 5), Gemini 3.1 Pro (High), Gemini 3.7 Flash (High), Codex `gpt-5.6-sol`, and an
in-host Addition-case subagent (Claude Sonnet 5) — to resolve a fork about a capability-discovery
manifest for Tovu's AI assistant: is it fixed, derived, or something else, and does it survive a kind
of capability source that doesn't exist yet. All five answers are reproduced below in full.

**Round 2 is not a re-argument of that fork.** Enough of it converged that re-arguing would waste the
budget. Round 2's job is narrower and more concrete: settle the one disagreement that actually is
still live and testable, confirm or reject one specific design refinement, name one scope boundary
explicitly, and — the main deliverable — design the standing canary harness that will test whatever
gets built, synthesized from the ~15+ overlapping experiments the five Round 1 answers already
proposed.

## Round 1 — full responses, verbatim

### Primary, Round 1 (Claude Sonnet 5)

<!-- BEGIN VERBATIM: primary-round1-response-2026-08-23.md -->
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
<!-- END VERBATIM -->

### Gemini 3.1 Pro (High), Round 1

<!-- BEGIN VERBATIM: gemini31pro-output.txt (ACK line omitted, already shown above) -->
### 2. Frame
**Frame (B): Intent formation, achieved via a Discovery Manifest (A-like) that acts as an intent-expansion prompt.**
*(A)* is merely an implementation detail of *(B)*. The core issue isn't that we lack a taxonomy; it's that the agent suffers from "unknown unknowns." It doesn't know what it doesn't know, so it never searches. A category layer is only valuable if it successfully provokes intent. Therefore, the design must be evaluated on how well it injects awareness into the agent's planning phase, preventing it from confidently executing a generic, flawed fallback.

### 3. Verdict on Candidate 1
*Candidate 1: A short always-present manifest of capability categories, plus the existing search tools — with a loop.*
* **Steelman**: This is a highly token-efficient map of the territory. By providing a coarse map rather than the full terrain (which we know fails via injection limits), the agent uses its semantic reasoning to guess the right region, search it, and the loop handles minor misses.
* **Single biggest failure mode**: **The "Plausible Distraction" trap.** If the agent wants to "deploy," searches the "hosting" category, and finds nothing installed, it is highly likely to ignore the retry loop. Instead, it will pivot to a native tool it already knows (e.g., `write_file`, `run_bash`), and attempt to write a deployment script from scratch. It will fail confidently rather than realizing it lacks the specific Tovu capability.

### 4. Answers to Open Questions
1.  **Scope**: **All four kinds** (Native, Agent Plugins, Runtime Plugins, MCP). The discovery layer must represent a unified view of *what the system can achieve*. Even though Runtime Plugins extend the site and not the agent's tool surface directly, the agent needs to know they exist so it can answer "add a contact form" by configuring the runtime plugin rather than trying to code one from scratch.
2.  **Dead end**: If the agent consults the mechanism, searches, and finds nothing, it must **halt and ask the user**. Proceeding with a fallback generic tool when a specific capability was expected is the exact failure we are solving. The system prompt must strictly enforce: *"If you search a capability category and find no tools, do NOT attempt a generic workaround. Stop and ask the user if they wish to install a capability for this."*
3.  **Timing**: **Install-time / State-change time.** Derivation happens when the system's capabilities physically change (a plugin is installed, an MCP server is attached). A per-request derivation is a continuous, unnecessary tax. State-change derivation ensures the manifest is ready and cheap at runtime.
4.  **Invariance to a fifth kind**: **Yes.** The discovery layer describes *outcomes* (categories), not *mechanisms* (kinds). When a hypothetical fifth kind (e.g., "WASM-based workflows") is registered, the registry maps its specific capabilities into the existing category buckets. The agent continues to see only the categories, entirely ignorant of the new underlying architecture.

### 5. Fixed vs. Derived
**Derived, but mapped to a Fixed Ontology.**
A fixed list of categories that claims "Deployment" is available when nothing is installed is a lie that burns turns. A purely derived list where plugins self-declare arbitrary categories (e.g., "SuperDuperDeploy") fragments the manifest into useless noise.
**Reasoning**: Tovu must define a fixed, stable set of *allowed category buckets* (the ontology). At state-change time, the system derives the manifest by mapping all installed capabilities across all sources into these buckets. If a bucket is empty, it is omitted. The manifest is always truthful relative to the installation, but uses a predictable vocabulary the agent can actually learn and rely on.

### 6. Mini Design: The Category List
Categories describe intent and outcomes.
*   **System & File Ops**: Modifying the workspace, running generic commands. (Sources: Native Tools).
*   **Design & Theming**: Managing CSS, design tokens, layout guidance. (Sources: Native Tools, Agent Plugins).
*   **Site Functionality**: Components and features added to the published site. (Sources: Plugin-runtime plugins).
*   **Integrations & Services**: Databases, external APIs, Deployments. (Sources: MCP Servers, Agent Plugins).
*   **UI Rendering Protocols (MCP-UI, AG-UI, A2UI)**: **Category Error.** These are *not* capabilities. They are presentation layers. They dictate *how* a result is rendered, not *what* the capability does. Putting them in this list conflates "what I can do" with "how it looks."

### 7. Three Surprises (Technology Assumptions)
1.  **Assumption**: *Capabilities are discrete, synchronous RPC calls.*
    *   **Stub Source**: A "Long-running Watcher" that returns immediately upon invocation but emits asynchronous events hours later.
    *   **Handling**: Degrades ungracefully. The agent will discover and invoke the tool, but the discovery layer does not encode the required protocol for the agent to suspend, wait, and react to asynchronous pushes later.
2.  **Assumption**: *A single installed package maps cleanly to one category.*
    *   **Stub Source**: A "Mega-Monolith" MCP server that provides both a database connector (Integrations) and a specialized log viewer (System Ops).
    *   **Handling**: Absorbed cleanly. The state-change derivation allows a single source to register capabilities into multiple category buckets. The agent can find it via either path.
3.  **Assumption**: *Capabilities execute in a uniform, pre-authorized trust environment.*
    *   **Stub Source**: A "Zero-Trust Sandboxed" tool that requires out-of-band interactive permission negotiation with the user mid-execution.
    *   **Handling**: Breaks. The agent discovers the tool based on intent, invokes it, and hangs/errors because the discovery layer only described *what* the tool does, not the unique interaction contract required to execute it.

### 8. Slate of Testable Experiments
1.  **The Positive Control (Baseline)**:
    *   *Prompt*: "Connect a Postgres database."
    *   *Setup*: No native DB tools, but a Postgres MCP server is installed.
    *   *Pass*: Agent reads manifest -> sees 'Integrations' -> searches 'Integrations' -> finds MCP tools -> succeeds.
    *   *Fail*: Agent ignores manifest, tries to `npm install pg` and write a custom connection script.
2.  **The Lie (Falsifying Candidate 1's fixed manifest)**:
    *   *Prompt*: "Deploy the site to Vercel."
    *   *Setup*: Fixed manifest lists 'Integrations & Services', but NO deployment tools/plugins are actually installed.
    *   *Pass*: Agent searches 'Integrations', gets empty results, *halts immediately* and tells the user it lacks deployment tools.
    *   *Fail*: Agent searches, gets nothing, then tries to write a custom bash script using a generic cURL command (falling into the Plausible Distraction trap).
3.  **The Edge of Ontology (Falsifying my own recommendation)**:
    *   *Prompt*: "Optimize my site's SEO."
    *   *Setup*: A new SEO Agent Plugin is installed. Because 'SEO' isn't in the fixed ontology, it was bucketed under 'Site Functionality'.
    *   *Pass*: Agent infers SEO might be under 'Site Functionality', searches it, finds the SEO tool.
    *   *Fail*: The agent looks at the rigid categories, fails to map "SEO" to any of them, assumes it lacks the capability, and ignores the tool entirely, proving the fixed ontology is too brittle for novel domains.

### 9. Ranked Options & Criterion
*Criterion*: Maximizes discovery of unconsidered capabilities while strictly minimizing hallucinations/distractions caused by false promises.
1.  **Candidate 4 (Derived manifest with fixed ontology)**: Balances truthfulness with reliable cognitive guidance.
2.  **Candidate 1 (Short fixed manifest + loop)**: Good guidance, but high risk of the Plausible Distraction trap when categories are empty.
3.  **Candidate 3 (Ask the user)**: Safe, but degrades the autonomous experience.
4.  **Candidate 2 (Intent classifier)**: Too rigid, expensive to maintain, and will constantly lag behind new, arbitrary plugin installations.
5.  **Candidate 5 (Accept the limit)**: Fails the core requirement of the prompt.

### 10. A Stronger Missing Option
**Yes: The "Capability Map" as an Active Tool, not System Prompt Text.**
Instead of perpetually injecting a manifest (fixed or derived) into the system prompt, provide a native tool: `list_available_capability_categories()`.
*   **Why it's stronger**: It forces the agent into an explicit action for intent formation. The system prompt simply states: *"If you are asked to do something and do not know how, your first step must be to call `list_available_capability_categories()`."* This guarantees the agent always reads the *current, derived state* of the system exactly when it hits an unknown unknown, solving token bloat, staleness, and the injection limit all at once, while explicitly blocking the "guess and use bash" fallback.
<!-- END VERBATIM -->

### Gemini 3.7 Flash (High), Round 1

<!-- BEGIN VERBATIM: gemini37flash-output.txt (ACK line omitted, already shown above) -->
### 2. Frame: (A), (B), or Own

**The Winning Frame: "Ontology Grounding for Intent Formation" (A as the substrate for B).**

Framing (A) and (B) are not competing architectures; (B) is the **cognitive failure mode** (the agent plans exclusively within the ontology it knows exists) and (A) is the **ontological stimulus** required to fix it.

The measured data proves that retrieval fails because the agent's intent formation resolves ambiguous requests (e.g., "design guidance") to known primitives ("theme tools") *before search happens*. The agent cannot form an intent to query a capability space it does not know exists. An always-on category layer solves (B) by acting as an **environmental ontology mask**—informing the agent's pre-planning step of what broad domains of capability exist in this specific workspace, enabling the agent to issue the correct pull query.

### 3. Verdict on Candidate 1

*Candidate 1: A short always-present manifest of capability categories + existing search tools + retry loop if initial search returns nothing.*

**Verdict: REJECT as formulated.**

- **Steelman:** It is token-cheap (~120 tokens) and directly addresses the 0/5 pull failure by planting the seed in the agent's initial prompt that unconsidered domains (e.g., "Deployment", "Design Guidelines") exist. By adding an explicit retry-loop rule, it counters the agent's natural tendency to immediately drop search and improvise.
- **Single Biggest Failure Mode (The Hallucinatory Death Spiral):** **The False-Promise Dead Loop.** If the manifest advertises a fixed category (e.g., `deployment_hosting`) in a workspace where no deployment plugins or MCP servers are installed, an agent instructed to "loop and retry from a different angle" will burn 3 to 5 fruitless search turns across FTS5. Convinced that the CMS must have deployment capabilities because the prompt promised the category, it will eventually abandon search and hallucinate an ad-hoc, destructive implementation (e.g., writing raw shell/FTP scripts or mangling workspace config) rather than reporting that the capability is absent.

### 4. Answers to the Four Open Questions

#### 1. Scope
**The category layer spans all four kinds, partitioned by execution semantics:**
- **Assistant Action Surfaces (Active Execution):** Native Tools (`tool-contribution-registry.ts`), Agent Plugins (`agent-plugin-skill`, `agent-plugin-mcp-server`), and External MCP Servers. These produce actionable tool pointers or executable skill files.
- **CMS Runtime State (Passive Inspection):** Plugin-Runtime Plugins (`tovu.plugin.json`). These do not add tools to the assistant; they extend the published site. However, they **must** register capability cards into the discovery index under a `site_runtime_features` category. If a user asks "Why is checkout failing?" or "Deploy my site with SEO", the agent searches the discovery index, retrieves the inspectable state/manifest of the site plugin, and avoids writing duplicate site code.

#### 2. Dead End
**The "One-and-Done" Fast-Fail Contract.**
When the agent queries `capability_search` or `search_tools` for an active category and receives zero hits:
1. The search tool returns an explicit status payload: `{ hits: [], domain_status: "no_active_capabilities_installed" }`.
2. The agent is strictly instructed: *If a search within a known category returns 0 hits, the workspace lacks this capability. Do not guess, loop, or attempt ad-hoc workarounds. State the capability is missing and ask the user if they wish to install or configure one.*

#### 3. Timing
**Event-Driven Cached Derivation at Daemon Boot & Lifecycle Mutation.**
- Categories are derived, never statically hardcoded.
- Computation occurs at daemon startup and is cached in-memory as an immutable ~100-byte string.
- Cache invalidation occurs via event hooks on:
  - Agent Plugin install/uninstall/toggle.
  - MCP server connect/disconnect.
  - Plugin-Runtime install/uninstall.
- **Cost:** Zero per-request compute tax (reads an in-memory string during composer prompt assembly). Filesystem-level additions outside the admin UI are caught via a directory mtime watcher.

#### 4. Invariance to a Fifth Kind
**Decoupling Functional Domain (`category`) from Source Kind (`kind`).**
The registry allows any future source (e.g., a background daemon, a remote workflow engine, or a multi-agent sidecar) to register cards via `registerCapabilitySource()`. The registration contract requires:
```typescript
interface CapabilityCard {
  id: string;
  name: string;
  description: string;
  domain: CapabilityDomain; // Extensible controlled vocabulary tag
  kind: string;             // Unconstrained source kind (e.g., 'workflow-sidecar')
  activation: 'tool' | 'skill_ref' | 'runtime_state' | 'mcp_ref' | 'custom';
}
```
A newly invented 5th, 6th, or 10th source kind simply maps its capabilities to existing or extended domain tags. The discovery manifest dynamically updates without requiring any changes to the core registry engine.

### 5. Fixed vs. Derived: Plain Statement and Reasoning

**Verdict: DERIVED FROM ACTIVE REGISTRATIONS OVER A CONTROLLED TAXONOMY.**

- **Why Not Pure Fixed:** Fixed lists are untruthful. Advertising "Deployment" when nothing is installed triggers the False-Promise Dead Loop. Omitting a newly created domain makes it permanently invisible.
- **Why Not Pure Unconstrained Derived:** Allowing 3rd-party plugin authors to freely invent category names produces fragmented, low-signal junk (e.g., `super_deploy`, `deployments`, `fast-hosting`) that ruins intent formation.
- **The Solution:** Tovu defines an extensible taxonomy of standard functional domains. The system prompt injects **only the subset of categories that currently have ≥1 registered, active capability in the workspace index**. If zero deployment tools are installed, `deployment_hosting` is omitted from the manifest. If an Agent Plugin or MCP server is installed, `deployment_hosting` instantly appears.

### 6. Mini Design: Concrete Category List

```markdown
<!-- INJECTED WORKSPACE CAPABILITY TAXONOMY -->
This workspace currently has active capabilities in the following domains.
Use `capability_search(query)` or `search_tools(query)` if the task touches these:
- [content_publishing] Core CMS content CRUD, taxonomy, pages, posts, media associations.
- [design_theme] Theme design tokens, typography, component layout rules, design guidelines.
- [deployment_hosting] Staging/production build pipelines, hosting environments, sync targets.
- [site_runtime_features] Active site plugins (worker sandboxes, checkout hooks, SSR filters).
- [media_assets] Asset transformation, CDN routing, generative media pipelines.
- [external_integrations] Third-party SaaS connectors, external databases, custom MCP bridges.
- [workspace_system] Native filesystem, CLI operations, environment diagnostics.
```

#### Placement of Specific Kinds:
- **Native Tools:** Live across `content_publishing`, `design_theme`, `media_assets`, and `workspace_system`.
- **Agent Plugins:** Live primarily in `design_theme` (guidelines/skills), `deployment_hosting`, or `external_integrations`.
- **Plugin-Runtime (Site) Plugins:** Live in `site_runtime_features` (as read-only inspectable state cards).
- **MCP Servers:** Live across `deployment_hosting`, `external_integrations`, or `media_assets`.

#### Placement of UI / Rendering Protocols (MCP-UI, AG-UI, A2UI):
- **Rendering protocols are NOT capability categories.**
- Treating MCP-UI, AG-UI, or A2UI as a capability category is a **strict category error**.
- Rendering protocols represent **Presentation Modality (HOW a tool's payload is rendered to the user)**, not **Functional Domain (WHAT problem is being solved)**.
- UI capabilities are declared as metadata flags on individual tool/card schemas (`ui_protocol: "a2ui" | "mcp-ui"`), consumed strictly by the client-side UI bridge when rendering tool execution results.

### 7. Three Surprises: Structural Assumptions & Stubs

#### Assumption 1: Discrete, Pre-Enumerable Inventory
*The design assumes all capabilities can be registered and indexed at daemon startup or install-time.*
- **Violating Stub (`JITSchemaDiscoverySource`):** A dynamic GraphQL/REST gateway or cloud proxy with 50,000 ephemeral endpoints generated on-the-fly per user session/tenant.
- **System Behavior:** **Degrades gracefully.** The source registers a single coarse domain card (`external_integrations` -> `cloud_gateway`) with a dedicated sub-query tool, deferring granular discovery to secondary search turns rather than overwhelming the FTS5 index.

#### Assumption 2: Synchronous, Single-Turn Execution
*The design assumes a capability is invoked via a standard synchronous tool call that yields a discrete result.*
- **Violating Stub (`AsyncHumanInTheLoopWorkflowSource`):** An escrow or long-running deployment pipeline that yields a persistent streaming task ID, requiring days of asynchronous external approvals and webhook callbacks.
- **System Behavior:** **Absorbed cleanly.** Discovery indexes the workflow trigger (`start_deployment_pipeline`). The tool returns an async Task Handle; the assistant transitions to reactive background scheduling without altering discovery mechanics.

#### Assumption 3: Globally Valid, Context-Free Availability
*The design assumes any indexed capability is globally valid and executable anywhere in the workspace.*
- **Violating Stub (`CanvasEphemeralBlockSource`):** A capability that only exists while the user is actively focusing on a specific interactive UI canvas node (e.g., editing a SVG block vector) and is completely invalid outside that transient state.
- **System Behavior:** **Breaks unless extended with context predicates.** If indexed globally, the agent will attempt to call vector-editing tools while in raw markdown mode, resulting in runtime execution failures. *Fix:* Capability cards must support an optional `active_context_filter` evaluated during category derivation.

### 8. Slate of Testable Experiments (Canary Harness Probes)

#### Experiment 1: The Unconsidered Pull Probe (Baseline Success)
- **Setup:** Clean workspace with an unpinned deployment Agent Plugin installed (`kind: agent-plugin-skill`, domain: `deployment_hosting`).
- **Prompt:** `"Deploy my site to staging."` (Zero mentions of plugins, skills, or specific tool names).
- **Pass Criteria:** Agent issues `capability_search` or `search_tools` in turn 1 or 2, discovers the plugin pointer, and activates it.
- **Falsification:** Agent issues 0 capability searches and attempts to improvise via bash scripts or direct file edits.

#### Experiment 2: The Negative Canary (Anti-Hallucination on Absent Capability)
- **Setup:** Workspace with NO deployment tools/plugins installed. `deployment_hosting` is excluded from the derived manifest.
- **Prompt:** `"Deploy my site to production."`
- **Pass Criteria:** Agent recognizes the domain is missing, states that no deployment capability is configured, and offers setup options in ≤2 turns.
- **Falsification:** Agent loops >2 times across search tools or hallucinates a fake deployment confirmation.

#### Experiment 3: Falsifying Top Recommendation (Novel Domain Divergence)
- **Setup:** A 3rd-party Agent Plugin registers with an unknown domain tag (`domain: "quantum_smart_contract_audit"`) outside the controlled taxonomy, forcing it into a fallback `workspace_system` or `other` category.
- **Prompt:** `"Audit our custom smart contracts."`
- **Pass Criteria:** Agent uses the general pointer, searches `capability_search("smart contract audit")`, finds the card, and executes it.
- **Falsification (Breaks Design):** The agent fails to search because the coarse fallback category obscured the existence of the specialized capability, proving that controlled vocabularies fail under extreme domain specialization.

#### Experiment 4: Cross-Cutting Multi-Source Synthesis
- **Setup:** Workspace has: Native tool (`content_post_create`), Agent Plugin (`design_theme`), and Plugin-Runtime site plugin (`site_runtime_features` for SEO schema).
- **Prompt:** `"Write and publish a new landing page post that follows our design guidelines and respects our site's SEO plugin rules."`
- **Pass Criteria:** Agent consults both the design guideline skill and site runtime state, then calls the native post creation tool with appropriate payload formatting.
- **Falsification:** Agent calls native tools but ignores either the design guideline or the site runtime plugin state.

### 9. Ranked List of Options

**Ranking Criterion:** *Empirical Task Completion Rate vs. Token Overhead and Zero-Hallucination Safety across Unknown Future Extensibility.*

1. **Rank 1 — Candidate 4 (Derived Category Layer over Controlled Taxonomy with Dynamic Masking):** Maximum truthfulness, zero dead-end hallucination, low token overhead (~100 tokens), 100% extensible across future source kinds.
2. **Rank 2 — Candidate 2 (Pre-flight Intent Classifier / Semantic Router):** Highly accurate at push-injecting exact pointers, but introduces per-turn LLM/embedding latency, inference cost, and failure modes on novel multi-intent user prompts.
3. **Rank 3 — Candidate 1 (Fixed Manifest + Loop):** Simple to author, but provably causes multi-turn dead loops and hallucinations when advertised tools are missing from the workspace.
4. **Rank 4 — Candidate 5 (Pure Operator Push / Pinning):** Zero token waste on unused tools, but completely breaks autonomous user experience when the user does not know what capabilities exist.
5. **Rank 5 — Candidate 3 (Ask User Confirmation on Every Search):** Degrades conversational UX to an unbearable degree ("Would you like me to check if I can deploy?"), failing naive users who expect the assistant to act autonomously.

### 10. Stronger Option / Shift Missed

**Two-Tier Discovery with Dynamic Search-Time Hydration.**

The framing treats prompt injection (Push) and search querying (Pull) as strictly separate stages. A superior pattern is **Search-Response Cross-Domain Surfacing**:
1. **Tier 1 (Prompt Mask):** The derived category manifest stays ultra-compact (~80 tokens).
2. **Tier 2 (Proactive Search Hydration):** When the agent searches for *any* native tool (e.g., `search_tools("create post")`), the search response includes a `related_capabilities` header containing 1-line pointers to active Agent Plugins or site plugins in adjacent categories (e.g., *"Note: Design guideline plugin 'brand-voice' is active; inspect via capability_get('brand-voice')"*).

This transforms standard, narrow agent searches into cross-domain discovery hooks dynamically at execution time, guaranteeing that an agent focused only on native CRUD is continuously made aware of relevant extensible skills without bloating the base system prompt.
<!-- END VERBATIM -->

### Codex `gpt-5.6-sol`, Round 1

<!-- BEGIN VERBATIM: codex-output.jsonl agent_message (ACK line omitted, already shown above) -->
## 2. Frame: B, supported by a truthful form of A

The primary problem is **intent formation**, not retrieval. The agent must pass a mandatory, pre-planning "capability consideration gate" that says:

> Before choosing an implementation path, check whether an installed capability may materially change how this request should be done. Use `capability_search`; use `search_tools` for native tools.

A category layer is useful only as compact evidence for that gate. Categories alone do not cause consultation—the 0/5 result proves optional pull is ineffective.

The manifest should be a **derived inventory of installed capability domains**, not a promise of everything Tovu might theoretically support. The gate is the behavior change; the manifest gives it truthful vocabulary.

## 3. Candidate 1 verdict

**Steelman:** A compact, always-injected inventory containing only populated categories, exact search pointers, and a bounded "return to inventory and reformulate once" loop would cheaply expose concepts the agent had not considered. It is source-neutral and much smaller than skill injection.

**Verdict:** Accept only when incorporated into the mandatory consideration gate. Reject as passive guidance.

Its single biggest failure mode is **non-consultation**: the agent may form a plausible plan before reading or applying the manifest, exactly as it resolved "design guidance" to "theme." A perfect inventory that does not interrupt planning remains inert.

The loop must be bounded. Repeatedly searching synonyms after no match wastes turns and encourages rationalization.

## 4. Four open questions

### Scope

Discovery should span all four:

- Native tools: add an adapter from `tool-contribution-registry` into the unified discovery inventory. Invocation remains through native tool calls.
- Agent Plugins: retain the existing capability source.
- Plugin-runtime plugins: add a source describing site functionality they provide. Their activation remains plugin-runtime-specific.
- MCP servers: add the previously agreed source when implemented.

This unifies discovery only. It does not create `capability_invoke`, merge activation models, or pretend that assistant plugins and site plugins are interchangeable.

### Dead end

After one direct search and at most one category-informed reformulation:

1. Record "no installed capability found."
2. Do not silently substitute an adjacent mechanism.
3. If the capability is necessary, ask the user whether to install/configure one or proceed with a clearly named manual alternative.
4. If merely beneficial, state the absence and offer the conventional path.
5. If neither path is safe, stop.

This is a terminal state, not another search loop.

### Timing

Derive on:

- source registration;
- install, uninstall, enable, disable, or package-change events;
- daemon boot as reconciliation.

Per request, read only a cached manifest plus revision/hash. Do not classify every card on every message.

Boot reconciliation repairs missed hooks and out-of-band edits. A stale indicator should force refresh before the gate relies on the inventory.

### Invariance to a fifth kind

A fifth source registers through the existing source contract and contributes capability cards without editing a source-kind list.

The discovery mechanism should require source-neutral fields such as purpose text, availability, activation mode, and result/display properties. Classification normalizes those cards into open-ended domain tags. Low-confidence cards remain discoverable under **Other installed capabilities** rather than disappearing.

A genuinely novel activation model may require a new activation adapter, but not a registry edit or discovery redesign. That cost is unavoidable and should remain outside discovery.

## 5. Fixed vs derived

**Derived, plainly.**

What is fixed:

- the card schema;
- the consideration-gate instruction;
- a small seed vocabulary used for stable display;
- the fallback bucket and confidence rules.

What is derived:

- which categories appear;
- counts and examples;
- category membership;
- search vocabulary;
- availability.

Self-declaration is evidence, not authority. Sources provide purpose descriptions and optional tags; a deterministic normalizer maps them, preserves original text, and assigns confidence. Unknowns remain visible.

This makes the fixed-versus-derived fork partly false: **fixed schema and governance, derived claims about installed capability.**

## 6. Mini design: category list

I would ship these initial task-domain categories, displaying only populated ones:

- **Publish, deploy, and operate** — hosting, environments, releases, domains, rollback.
- **Create and manage content** — posts, pages, structured content, editorial workflows.
- **Design and presentation** — themes, layout, styling, accessibility, design guidance.
- **Media generation and transformation** — images, audio, video, document conversion.
- **Extend site functionality** — plugin-runtime plugins and native site/CMS extensions.
- **Connect external services and data** — MCP servers, APIs, storage, analytics, commerce.
- **Automate workflows and agent behavior** — Agent Plugin skills, assistant procedures, orchestration.
- **Inspect, diagnose, and secure** — debugging, performance, audits, recovery, policy.
- **Other installed capabilities** — truthful fallback for unclassified or low-confidence cards.

Placement by mechanism:

- Native tools may appear in any task category.
- Agent Plugins usually appear under automation, but may appear elsewhere according to purpose.
- Plugin-runtime plugins belong primarily under extending site functionality, with additional purpose categories.
- MCP servers belong primarily under external services/data, again with purpose categories.
- Mechanism is retained as a facet: `native-tool`, `agent-plugin`, `site-plugin`, `mcp-server`, or an unknown future value. It is not the category taxonomy.

**MCP-UI, AG-UI, and A2UI are not capability categories.** They describe how interaction or results are rendered, not what the system can do. Putting them beside "deploy" or "generate media" is a category error.

Represent them through orthogonal properties such as:

- `presentation: text | structured | interactive-ui | streaming-ui`
- `presentation_protocol: mcp-ui | ag-ui | a2ui | <open string>`
- `interaction: one-shot | conversational | event-stream`

A renderer implementation can itself be discoverable under "Extend site functionality," but the protocol remains a presentation facet.

## 7. Three structural surprises

1. **Assumption: a capability is request/response and finishes once.**
   Stub: `PulseSource` exposes a capability that emits unsolicited events indefinitely and has no query-time result.
   Outcome: discovery absorbs it if cards declare `interaction: event-stream` and lifecycle requirements. The planner can explain it, but activation needs a separate subscription adapter. Graceful degradation, not silent invocation.

2. **Assumption: one installed item maps to flat, stable capabilities.**
   Stub: `FractalSource` exposes one root whose children materialize only after another child is selected, with no enumerable complete set.
   Outcome: register the root as a browsable capability with `enumeration: dynamic` and a source-specific describe continuation. Categories cover the root, not invented children. Graceful degradation; flat-only UI would break and is therefore a canary target.

3. **Assumption: every source has a persistent kind string.**
   Stub: `BlankSource` registers only an opaque source ID and valid purpose cards; its transport identity changes every boot.
   Outcome: discovery and classification use source ID only for provenance, never taxonomy. It lands in purpose categories and retains `mechanism: unknown`. Absorbed cleanly. Any switch statement on known `kind` values fails this test.

## 8. Experiment slate

### Experiment 1: Blind deployment probe

- **Prompt/setup:** Install one deployment capability under an Agent Plugin; ask only "deploy my site."
- **Working:** The agent consults discovery before proposing commands, finds the plugin, and uses its proper activation path.
- **Falsified:** It begins a generic deployment plan, asks for hosting details first, or never calls discovery.

### Experiment 2: Native-versus-site-plugin separation

- **Prompt/setup:** Provide a native inspection tool and a plugin-runtime deployment extension with similar text.
- **Working:** Unified discovery finds both, but the agent invokes the native tool normally and treats the site plugin through plugin-runtime activation.
- **Falsified:** It conflates activation, invents `capability_invoke`, or describes the site plugin as an Agent Plugin.

### Experiment 3: Empty-category truthfulness

- **Prompt/setup:** No deployment capability installed; ask "deploy my site."
- **Working:** Deployment is absent from the installed inventory; after bounded discovery the agent reports no installed provider and asks whether to configure one or use a named manual path.
- **Falsified:** The manifest claims deployment support, the agent loops searches, or confidently substitutes theme/publishing tooling.

### Experiment 4: Out-of-band removal

- **Prompt/setup:** Build the manifest, remove a package without firing the normal uninstall hook, restart the daemon, then issue its matching prompt.
- **Working:** Boot reconciliation removes the stale category/card before planning.
- **Falsified:** The agent is pointed to a nonexistent capability.

### Experiment 5: Fifth-kind source

- **Prompt/setup:** Register an arbitrary new source kind with purpose cards but no changes to registry, taxonomy code, or prompt.
- **Working:** It becomes searchable, contributes to a populated category or "Other," and reaches the consideration gate.
- **Falsified:** Adding it requires editing a kind union, prompt list, or source-specific classifier branch.

### Experiment 6: Falsify my top recommendation

- **Prompt/setup:** Run a broad canary set of ordinary requests where no special capability is relevant, comparing the mandatory gate against baseline.
- **Working:** Capability discovery materially improves hidden-capability recall while adding bounded latency/turn cost and without increasing irrelevant tool use.
- **Falsified:** The gate causes frequent unnecessary searches, measurable planning degradation, or prompt habituation that restores non-consultation. If so, replace universal gating with a high-recall classifier plus random universal-gate canaries.

### Experiment 7: Structural stubs

- **Prompt/setup:** Register `PulseSource`, `FractalSource`, and `BlankSource`.
- **Working:** All remain visible; none is forced into one-shot invocation, flattened dishonestly, or rejected for lacking a known kind.
- **Falsified:** Any disappears or causes invented activation behavior.

## 9. Ranked options

Criterion: **recall on unconsidered intents first**, then truthfulness, fifth-kind extensibility, activation correctness, and recurring token/latency cost.

1. **Mandatory consideration gate + cached derived installed inventory + unified source-neutral discovery.**
2. **High-recall intent classifier with a universal fallback gate for uncertain intents.** Cheaper, but classifier false negatives recreate invisibility.
3. **Candidate 1's manifest and bounded loop, if mandatory at pre-plan time.**
4. **Ask the user whether to check.** Truthful but transfers system ignorance to a user who cannot know the answer.
5. **Fixed category layer.** Stable but inevitably lies or omits.
6. **Push-only operator pointers.** Reliable when supplied, but abandons the stated user.
7. **Passive category layer or improved retrieval/ranking alone.** Already contradicted by the measurements.

## 10. Stronger missed decomposition

Yes: separate the problem into three ports:

1. **Inventory:** What is actually available now?
2. **Consideration policy:** When must planning consult that inventory?
3. **Activation handoff:** How does the selected source explain its own source-specific next step?

That decomposition is stronger than "manifest versus classifier." It makes truthfulness, intent formation, and activation independent and swappable. The manifest cannot guarantee consideration; the classifier cannot establish availability; unified discovery must not imply unified invocation.
<!-- END VERBATIM -->

### In-host Addition-case subagent (Claude Sonnet 5), Round 1

<!-- BEGIN VERBATIM: teammate message from debate-addition-voice -->
In-host participant (Claude Sonnet 5, Addition case)

## 1. Frame

Neither (A) nor (B) as stated. I take a refinement of (A) — call it **(A′) a concept-to-search-pointer manifest, not a capability inventory** — and reject (B) as an independent frame: every workable version of (B) either needs a target ontology to classify into (which is just (A) again, built later and worse) or degrades into "spend an extra LLM call generating query rephrasings," which is a costlier, less reliable version of just keeping the concept always in context. The load-bearing move in (A′): the manifest must never assert that a capability *exists* — it only asserts that a *search term* exists for a domain. That reframe is what dissolves the truthfulness fork below.

## 2. Verdict on candidate 1

**Steelman:** It's the right backbone. Cheap (a short fixed block, not per-item injection), targets the actual measured failure (query never formed) rather than ranking, needs no new infrastructure since `search_tools`/`capability_search` already work once queried, and is naturally invariant to new source kinds because it points at stable search entry points instead of enumerating sources.

**Biggest failure mode:** the loop has no termination condition. Given the packet's own finding — the agent "does not report being stuck… finds a plausible adjacent answer and proceeds" — an unbounded "search again from a different angle" either burns turns indefinitely or, more likely given observed behavior, gets abandoned early and reverts to exactly the original failure: confidently substituting a plausible adjacent capability instead of admitting absence. As stated, candidate 1 is incomplete, not wrong — it's missing a bounded retry count and an explicit "report absence, don't invent" terminal branch.

## 3. Four open questions

**Scope.** The manifest reaches whatever is *already* wired into `search_tools` or `capability_search` — today that's native tools and Agent Plugins. It does **not** by itself reach plugin-runtime plugins (not a `CapabilitySource` at all yet) or MCP servers (not built). This is a real, named gap, not something the manifest patches: those two need a `CapabilitySource` adapter each before any discovery-layer fix — including this one — can reach them. Once such an adapter exists, the manifest reaches it for free, because the manifest points at the search surface, never at named sources.

**Dead end.** Bounded retry (one reformulation, e.g. broader/synonym term) against both indices, then stop and state plainly to the user that nothing installed covers the ask. Never silently substitute an adjacent match for an absent one — that substitution is the exact failure this packet is about, and it can happen even when the "wrong" match is a real, correctly-found capability (see the design-guidance run: theme tools were real and correctly retrieved, but `capability_search` was still never checked).

**Timing.** The category *names* are static text, baked into context at effectively zero per-request cost — no derivation timing question applies to them. If an optional per-category "installed count" annotation is added later (e.g. "(2 installed)" as a hint), that piece should derive at capability-source registration/composer-boot time and invalidate on install/uninstall hooks — not per-request (avoids a tax on every message) and not baked-fixed (would silently go stale as installs change). I'd ship without this annotation initially; it's a refinement, not a requirement.

**Invariance to a fifth kind.** Holds, with one caveat. Because the manifest maps concept → *search term*, never concept → *source/kind*, a new source registers under the existing `capability_search` (open `kind: string` by design) and is reachable through category pointers with zero manifest edits — confirmed by the registry's own stated purpose (avoiding by-name coupling). The caveat: if the new kind of source needs a genuinely new top-level *concept* no existing category covers (not just a new instance under "deployment" or "media"), a human still edits the ~8-line list to add that concept name. That's a real, infrequent editorial cost — cheap relative to the alternative (an automatic categorizer, which the packet itself notes produces "inconsistent junk" via self-declaration) — but I'm naming it plainly rather than claiming full automation.

## 4. Fixed vs derived

**Fixed**, with a twist that resolves the packet's fork rather than picking a side of it: the list is fixed at the *label* level (domain names, rarely edited, authored by whoever ships a new top-level capability domain — infrequent, cheap) — but each entry is phrased as a **pointer claim, not an existence claim** ("for X, try `search_tools`/`capability_search` with these terms"), never "you can do X." A pointer is never a lie regardless of what's installed, because it promises vocabulary, not inventory. This is what dissolves "a category listed with nothing installed is a lie" — it was only ever a lie under the (A)-as-stated framing where the category asserts presence. Change what the category asserts, and fixed stops implying stale-truth risk. A derived list (compute categories from what's installed) buys nothing extra here and costs more: it still can't tell the agent "deployment" is a domain worth considering when *nothing* is installed under it yet, which is exactly the theme-vs-capability_search miss — the gap wasn't "nothing installed," it was "index never consulted."

## 5. Mini design — the actual category list

Fixed, ~8 lines, always in context, each phrased as pointer not inventory:

1. **Content authoring & publishing** (posts, pages, media) → `search_tools`: "post", "page", "media"
2. **Design & presentation** (theme, layout, styling) → `search_tools`: "theme"; `capability_search`: "design"
3. **Deployment & hosting** (publish, domains, environments) → both indices: "deploy", "host", "publish"
4. **Site functionality & extensions** (add behavior to the published site) → today: nothing wired (plugin-runtime gap, see Scope); once wired, `capability_search`: "plugin", "extension"
5. **External connections & integrations** (services outside Tovu) → `capability_search`: "connect", "integration"; MCP servers land here once built
6. **Media & content generation** (images/video/audio/AI assets) → `capability_search`: "generate", "media"
7. **Communication & notifications** (email, alerts, webhooks) → `capability_search`: "notify", "webhook"
8. **Workspace & account administration** (users, permissions, settings) → `search_tools`: "user", "permission", "settings"

Each line ends with the same contract: *if both indices return nothing relevant, say so — do not substitute.*

**Native tools:** covered directly (categories 1, 8, partially 2/3). **Agent Plugins:** covered via `capability_search` (today's only wired source — categories 2/3/5/6/7 as installed). **Plugin-runtime plugins:** category 4 exists as a placeholder pointer but is currently a dead end by design until a `CapabilitySource` adapter is written — named, not hidden. **MCP servers:** land under category 5 (and others) automatically once registered, no manifest edit needed.

**Rendering protocols (MCP-UI/AG-UI/A2UI): do not give them a category.** This would be a category error. The manifest answers "what job can this system do" (a noun — deploy, generate media, connect a service); rendering protocol is an orthogonal axis answering "how is this specific result displayed back" (an adjective on the *result* of any capability, from any category). A media-generation capability might render via MCP-UI; a deployment capability might not render any UI at all. That's metadata on the individual capability card the host/composer consumes to pick a display mode — it's not something the agent needs to "discover" as a capability domain, and putting it in the same list as "deployment" or "media generation" would make the agent search for "AG-UI" as if it were a job to be done, which it never is.

## 6. Three surprises (assumptions about SHAPE)

1. **Assumes a capability is invoked by query/request and answers once.** Stub: a source that's a standing ambient watcher (e.g. a "traffic-anomaly watcher") that never responds to a query — it unilaterally pushes an event into context when a condition trips, with no invocation step at all. **My design breaks here**, not gracefully — there's no query to seed a concept into, and no search call to make. This needs a subscription/event-registry mechanism, out of scope for a discovery-index fix; I'm not going to pretend the manifest covers it.

2. **Assumes one installed thing maps to one flat capability.** Stub: a source that's a pure compositional modifier — e.g. an "add watermark" install that has no standalone identity, only meaning as a post-step chained after "generate image." **Degrades, doesn't break**: `capability_search` can still index it as a card with a `requires:` field, and category 6 is still the right place to look, but the agent needs extra reasoning to realize two cards must be invoked together — the manifest gets it *found*, not *composed*.

3. **Assumes every source needs a stable string to hang a category mapping on**, despite the registry deliberately keeping `kind` open. Stub: a marketplace source that mints a unique one-off `kind` per vendor install, never reused. **Absorbed cleanly** — my category pointers map concept → FTS5/BM25 search terms over card title/description text, never to `kind` values, so `kind` churn doesn't touch the mechanism at all. Worth stating plainly since it's the one place the design is more robust than it might look, not less.

## 7. Experiment slate

- **E1 (primary):** "Deploy my site," with an Agent Plugin covering deployment and nothing native for it, manifest present. **Pass:** `capability_search` called with a deploy-related term within 2 turns, plugin card retrieved. **Fail:** still 0 calls — falsifies the core claim.
- **E2 (regression check on the actual observed failure):** "Use whatever design guidance this workspace has available," with both theme tools (native) AND an installed design-guidance Agent Plugin present. **Pass:** agent checks both `search_tools` and `capability_search`, synthesizes both. **Fail:** agent stops at theme tools again and never checks `capability_search` — this would show the manifest fixes "never considered" but not "stopped at first plausible match," which is the harder half of the original failure.
- **E3 (dead-end honesty):** ask for a category with nothing installed anywhere (e.g. SMS notifications). **Pass:** bounded retry, then explicit "not installed" statement. **Fail:** fabricated substitute or silent misroute.
- **E4 (cost/scale guard):** measure manifest token overhead across an ordinary session with no ambiguous asks; confirm it stays near a fixed ~200–400 token budget as categories/sources grow, rather than creeping toward the 15KB-per-item problem measured fact 4 already flagged.
- **E5 (falsifies my own top recommendation):** run E1 and E2 with **no manifest at all**, only a one-line instruction: "always check both `search_tools` and `capability_search` before answering, even if the first search succeeds." If this cheaper one-liner matches the full manifest's call rate on both E1 and E2, that falsifies my claim that seeding domain *concepts* (not just seeding the *dual-index-check habit*) is what's doing the work — and I'd retract the maintained category list in favor of the one-liner.
- **E6 (invariance, informational for Round 2):** register a stub fifth-kind source (per surprise #3) into `capability_search` only, with no manifest edit. **Pass:** a generic category pointer ("external connections") still surfaces it via search — confirms the no-hardcoded-list-edit claim.

## 8. Ranked options

Criterion: (i) fit to the measured root cause — query formation, not ranking; (ii) per-message cost; (iii) invariance to a new source kind without manual edits; (iv) truthfulness/no hallucination risk; (v) added latency/turns.

1. **(A′) fixed concept-pointer manifest + bounded retry + explicit absence** (my design / refined candidate 4)
2. **Candidate 1** — same backbone, ranks below only for the missing termination/absence spec
3. **Candidate 5 (push-only, accept the limit)** — cheapest, 100% reliable when something IS pinned, but leaves the packet's actual problem (unconsidered capability) unsolved by design; a floor, not a fix
4. **Candidate 3 (ask the user)** — I fold a version of this into my design's terminal branch, but as a *primary* mechanism it over-triggers "should I check X?" on every ambiguous ask
5. **Candidate 2 (intent classifier)** — most expensive, and collapses into needing a category ontology anyway or becomes unreliable open-ended query reformulation; weakest on cost and invariance

## 9. Stronger option not listed?

Yes — the pointer-not-inventory reframe of (A) itself (section 4) is the piece I think the packet's own framing under-names: it treats "fixed vs derived" as the only axis, when the sharper lever is *what the fixed list is allowed to claim*. A fixed list of pointers is never untruthful; a fixed list of promises always eventually is. That reframe is what I'd want carried into Round 2 rather than the raw fixed/derived dichotomy as posed.
<!-- END VERBATIM -->

## Primary's Round 2 rebuttal (formed after reading all four above, before this packet was sent)

<!-- BEGIN VERBATIM: primary-round2-response-2026-08-23.md -->
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

**The pointer-vs-inventory reframe (Addition voice) is the sharpest single idea across all five
answers, but I don't think it fully dissolves the fork — it relocates the open question rather than
closing it.** A category phrased as "for X, try searching these terms" is indeed never false regardless
of install state. But two things still need settling, and neither is answerable by more argument:

1. Whether an LLM agent, in practice, actually treats "for deployment, try `capability_search` with
   these terms" differently from "you can deploy your site" — or whether both phrasings get read the
   same way once "deployment" is merely present in context.
2. Whether ANY passive, always-injected text — pointer-phrased or not — is sufficient at all, given
   Codex's structural objection: the measured failure was the agent never checking, and inert context
   that never interrupts planning stays inert regardless of how it's worded. This is the actual live
   fork now, and it's testable, not arguable.

## The real Round 2 disagreement: delivery mechanism, not manifest content

Three different delivery shapes emerged for the same underlying content:

- **(i) Passive always-injected system-prompt text.** My Round 1 answer, Gemini 3.7 Flash's
  "environmental ontology mask," the Addition voice's pointer list.
- **(ii) A mandatory pre-planning consideration gate** layered on top of (i) — Codex's core argument:
  "a perfect inventory that does not interrupt planning remains inert."
- **(iii) The manifest as a callable tool the agent is instructed to invoke before answering an
  unfamiliar ask**, rather than context text at all — Gemini 3.1 Pro's `list_available_capability_
  categories()`. Arguably the most literal, enforceable version of (ii).

I'm proposing this become the headline Round 2 experiment: three arms — passive text only, passive
text plus explicit gate instruction, tool-call-required — run against the identical case-(b)-style
prompt. Whichever arm actually produces non-theme `capability_search` calls settles this empirically.

## Converged findings I'm carrying forward as settled (do not re-argue)

- **Rendering protocols are not a category, 5/5 unanimous.** Closed.
- **A genuinely new top-level concept always costs a small human edit, in every design proposed.**
  Stop framing this as a flaw to solve; name it as an accepted, bounded cost.
- **Push/streaming-shaped capability sources break or badly strain every proposal on the table,
  independently arrived at by all five answers.** The strongest cross-model finding from Round 1.
  Recommend explicitly scoping this out as a named v1 limitation rather than solving it here.
- **Hierarchical/compositional sources get a mixed but leaning-optimistic verdict** — I raised this as
  a full break in Round 1; updating toward Codex/Addition voice's "register the root, treat full
  child enumeration as describe-time" position, but flagging it as a canary to verify, not a full
  concession.

## What I want Round 2 to produce

1. A verdict on delivery-mechanism arms (i)/(ii)/(iii) — via a concrete experiment design.
2. Confirmation (or objection) on dropping the kind-keyed mapping table for FTS-text matching.
3. An explicit, named v1 scope boundary excluding push/streaming sources.
4. A synthesized, deduplicated canary set from the ~15+ overlapping experiments already proposed —
   what each canary asserts, what a pass looks like, how a regression surfaces.
<!-- END VERBATIM -->

## Required in your Round 2 answer

This round is scoped narrowly. Do not re-litigate frame (A) vs (B), fixed vs derived in general, or
whether rendering protocols belong in the category list — those are either settled 5/5 or narrowed to
the specific open items below.

1. **Delivery mechanism.** Take a position on (i) passive text / (ii) mandatory gate / (iii) required
   tool call. Design the experiment that would distinguish them empirically — be concrete: exact
   prompt(s), exact setup, exact pass/fail signal per arm. If you think one dominates without needing a
   three-arm test, say why, but still specify how someone would verify you're right.
2. **React to the FTS-text-matching proposal** (map card purpose/description text to category
   vocabulary, never `kind` strings) — endorse, refine, or reject with a concrete failure mode.
3. **React to scoping push/streaming sources out of v1 explicitly** — endorse, or argue it's cheap
   enough to handle now and show how.
4. **Synthesize the canary harness.** You have ~15+ experiments across five Round 1 answers with heavy
   overlap (case-(b) regression, empty-category honesty, fifth-kind stub, cost regression, falsify-own-
   recommendation, native-vs-plugin-runtime separation, structural-assumption stubs). Deduplicate into
   a concrete standing set: name each canary, what it asserts, what a pass looks like, and how a
   regression would surface later (e.g., in CI, in a scheduled probe, in a dashboard — be specific to
   this repo's actual tooling, e.g. `development/scripts/agent-run-probe.mjs`, if you know it well
   enough to reference it; if not, describe the harness shape without inventing repo-specific paths).
5. **Is there a stronger option, shift, or decomposition not covered by anything above that you believe
   is better or that the framing has missed?** ("No" is valid.)

Be concrete and brief. This is the last round — write as if your answer here is what actually gets
built next.
