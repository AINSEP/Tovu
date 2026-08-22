## DP1 / DP2 / DP3 / DP4 / DP5

### DP1 — One discovery index over many registered sources, or two separate indexes (callable vs readable)?
*   **Position:** One unified discovery index (a shared FTS5/BM25 projection) over multiple registered descriptor sources, strictly decoupled from execution lanes.
*   **Changed this round?:** Refined. Round 1 advocated a unified host registry with dual agent projection; Coordinator Finding #2 verified that `buildToolCatalogQuery` only requires `Pick<ToolRegistry, "list">` over `ToolDescriptor`. This confirms discovery can unify cleanly without touching kernel execution types.
*   **Why:** Discovery is functionally uniform across all capabilities: matching natural language intent to ranked capability identifiers. Execution is heterogeneous: tools require argument schemas and permission gates; skills require bounded text reads; hooks require event listeners. Coordinator Finding #2 proves that any source exposing a `.list()` method returning metadata descriptors can feed the existing FTS5 index. We achieve single-query discovery across tools, skills, and plugins without altering `@jini-ai/core` or registering dummy handlers.
*   **Strongest counter to the leading opposing view (Sonnet's separate indexes):** Sonnet argues that a single discovery surface creates an organizational gravity that inevitably collapses distinct execution trust tiers into one convenience tier. However, this conflates discovery projection with execution dispatch. As long as `capability_search` returns typed identifiers/handles that must be consumed via explicit, separate agent tools (`ToolExecutor` for tools, a bounded reader for skills), the execution trust boundary is mechanically isolated. Splitting the index forces the LLM to decide *which search tool* to query before it even knows what capability exists, degrading vague-intent discovery.
*   **What would change my mind:** Concrete benchmark evidence showing that multi-modality indexing under BM25 causes severe relevance crosstalk (e.g., verbose markdown skill descriptions systematically crowding out short, critical tool descriptions in top-3 recall).

---

### DP2 — What is the primary structural axis?
*   **Position:** The primary structural axis is the **Operation Execution Contract & Trust Boundary** (Modality + Admission/Trust Tier + Tenancy Scope).
*   **Changed this round?:** Refined. Synthesizes Round 1's Modality/Trust/Tenancy axis with Codex's Operation Contract.
*   **Why:** "What the agent does with it" (the verb axis) fails because a single capability package (like an Agent Plugin) often contains multiple modalities (a procedural skill doc and an executable MCP server). Sonnet's admission pipeline axis (Native-CALL, Federated-CALL, Content-READ) is too coarse to accommodate background jobs, interactive UI widgets, or client-side event hooks. Codex's operation contract is structurally sound but incomplete if host-side tenant boundaries and admission gates are treated as secondary metadata. The primary axis must define how the host isolates, admits, authorizes, and executes the capability.
*   **Strongest counter to opposing views:** 
    *   *Against Sonnet's Admission Pipeline:* A static 3-pipeline model cannot represent composite packages without tearing them across unrelated host subsystems.
    *   *Against Codex's Operation Contract:* Focusing purely on protocol shapes without making multi-tenant workspace isolation and host-side trust invariants first-class risks building an extensible engine that leaks cross-tenant state.
*   **What would change my mind:** If Tovu were redesigned strictly as a single-tenant, local-only developer CLI where workspace isolation and multi-user privilege levels do not exist.

---

### DP3 — Is boot-only index seeding acceptable?
*   **Position:** Boot-only index seeding is **unacceptable**.
*   **Changed this round?:** No.
*   **Why:** "Consistent with existing behavior" is an argument for preserving technical debt, not correctness. Tovu's flagship CMS workflow is installing an Agent Plugin or connecting an MCP integration and immediately leveraging it within the active session. Because the SQLite FTS5 catalog is in-memory and disposable, adding an invalidation event on plugin install/update to re-seed or incrementally upsert descriptors is computationally trivial and eliminates broken session states.
*   **Strongest counter to Sonnet's view:** Sonnet treats boot-seeding as acceptable because it mirrors `tool-catalog-query.ts`. However, `tool-catalog-query.ts` was built when tools were static, bundled source files. In a dynamic plugin ecosystem, requiring a server reboot to use an installed skill is a severe user-facing defect.
*   **What would change my mind:** If product architecture explicitly mandated that plugin installation triggers an automatic, seamless background process restart before resuming the chat session.

---

### DP4 — THE CENTRAL QUESTION. Is this a discovery problem at all?
*   **Position:** **Findability is NOT the primary binding constraint.** The primary binding constraint is **Instruction Authority, Context Economics, and Framing**. The capability bucket earns its cost only as an **On-Demand Delivery and Context Assembly Pipeline**, not merely as a search engine.
*   **Changed this round?:** Sharpened. Grounded directly in the empirical 0-of-30 vs 4-of-4 read-rate anomaly.
*   **Why:** The empirical finding is decisive: dumping 14,800 characters of skill text unconditionally into the prompt resulted in the model reading 0 of 30 referenced files because hedging language in the system prompt diluted instruction authority. Replacing that dump with a concise, authoritative framing directive produced 100% compliance. This proves that dumping raw text causes prompt dilution, while relying purely on agent-initiated search fails if the agent is not steered to search.
*   **What should be built instead/first:** A **Two-Tier Capability Delivery Pipeline**:
    1.  *Tier 0 (Active Context Assembler):* Generates compact (~100-byte), authoritative execution pointers in the prompt for pinned/explicit capabilities (e.g., "MANDATORY: Use `read_skill` to follow UI guidelines before generating forms").
    2.  *Tier 1 (On-Demand Retrieval):* Exposes `capability_search` and `read_skill` for autonomous discovery and procedural consumption when intent is unpinned.
*   **Strongest counter to pure discovery focus:** Treating this as purely an information retrieval problem guarantees failure. Even a perfect BM25 search tool will sit idle if the agent's prompt framing does not instruct it when and how to retrieve procedural guidance.
*   **What would change my mind:** If benchmark runs show an unprompted LLM autonomously issuing search queries and strictly adhering to retrieved procedural guidelines without any explicit steering directives.

---

### DP5 — Is the tactical option (add only Agent-Plugin search/read tools) an acceptable first slice or a trap?
*   **Position:** It is an **acceptable and recommended first slice IF AND ONLY IF** the agent-facing tools and host provider interfaces use the generic capability contracts (`capability_search` and `capability_read`) from day one.
*   **Changed this round?:** Yes (pivoted from outright rejection to conditional adoption as Phase 1).
*   **Why:** Naming the tool `capability_search` and backing it with an extensible `CapabilitySource` provider seam allows us to immediately wire Agent Plugins as the first provider. This delivers the immediate tactical fix for unreachable skills while writing zero throwaway code, establishing the exact production contract for subsequent MCP and tool providers.
*   **Strongest counter to the opposing view (Gemini Flash R1 / Sonnet R1 rejection):** Outright rejection of the tactical slice demands an all-or-nothing refactor, delaying the fix for broken Agent Plugins. Generic tool naming and provider abstraction allow an incremental rollout with zero migration debt.
*   **What would change my mind:** If implementing the generic provider seam requires substantial core architectural modifications compared to a hardcoded `agent_plugin_search` script (Coordinator Finding #2 proves it does not).

---

## Ranking criteria

1.  **Instruction Execution Reliability:** Maximizes the probability that the agent discovers, retrieves, and strictly obeys procedural and tool instructions without prompt dilution or hallucination.
2.  **Zero-Core-Churn Extensibility:** Adding a new capability provider or modality requires authoring a localized adapter, touching zero core search, catalog, or routing files.
3.  **Security & Tenancy Isolation:** Preserves strict authorization, confirmation gates, and workspace boundary enforcement across all execution lanes.
4.  **Context Budget Optimization:** Eliminates unconditional multi-kilobyte prompt injection, reserving context tokens for conversation history and active generation.
5.  **Incremental Shippability:** Allows immediate delivery of reachability for Agent Plugins without accumulating disposable technical debt.

---

## Slate

### Rank 1: Unified Discovery Facade over Typed Execution Adapters (The Two-Tier Architecture)
*   **Description:** A single workspace-scoped FTS5/BM25 index over registered `CapabilitySource` providers, paired with an Authoritative Directive Assembler (Tier 0) for pinned capabilities and distinct, typed execution lanes (Tier 1: `ToolExecutor` for tools, bounded `read_skill` for procedural docs).
*   **Genuine Sacrifice:** Introduces an indirection seam between discovery metadata and runtime execution. For unpinned capabilities, the agent must perform a two-step turn (`search` $\rightarrow$ `read`/`execute`), introducing slight latency compared to static prompt injection.

### Rank 2: Partitioned Multi-Lane Discovery & Execution (Strict Silos)
*   **Description:** Independent discovery indices, separate search tools (`tool_search`, `skill_search`), and separate host registries for each capability kind.
*   **Genuine Sacrifice:** Fractures composite packages (e.g., an Agent Plugin containing both skills and MCP tools); doubles agent tool-choice cognitive load; forces the composer UI to query disparate backends; fails on cross-modality vague intent queries.

### Rank 3: Universal Registry with Universal `capability_invoke` Router
*   **Description:** Fully unified descriptor schema, single discovery tool, and single universal execution gateway `capability_invoke(id, payload)`.
*   **Genuine Sacrifice:** Severe security degradation by funneling safe reads and destructive mutations through one gateway; massive context pollution when markdown instructions return as tool outputs; bloated union-of-optionals schemas that rot across releases.

---

## BUILD OUTLINE

### Phase 1: Host Provider Seam & Unified Metadata Catalog
*Build the foundational host-side registration and search infrastructure.*

1.  **`CapabilitySource` Provider Seam (`src/capabilities/source-registry`)**
    *   *What:* A host-side registration interface where capability domains (First-Party Tools, Agent Plugins, Federated MCP) register as descriptor providers exposing `.list(): CapabilityDescriptor[]`.
    *   *Why it exists:* Eliminates the three fragmented descriptor models (`ToolDescriptor`, `AgentPluginCapabilityDescriptor`, `ComposerCapability`). Allows new capability kinds to register without modifying core catalog files.

2.  **Dynamic Workspace-Filtered Catalog Indexer (`src/capabilities/catalog-index`)**
    *   *What:* Generalizes `buildToolCatalogQuery` into an in-memory SQLite FTS5 index that indexes descriptors from all registered `CapabilitySource` providers. Adds an invalidation event listener to rebuild/upsert on plugin installation.
    *   *Why it exists:* Delivers DP1 and DP3. Provides single-surface BM25 ranked discovery across all capabilities while enforcing workspace tenancy boundaries and eliminating boot-time staleness.

3.  **Agent Discovery Tool (`capability_search`)**
    *   *What:* An agent-facing search tool accepting natural language queries and optional modality/scope filters, returning compact metadata cards (URN, modality, name, description, keywords).
    *   *Why it exists:* Resolves the reachability gap for Agent Plugins and multi-skill plugins, allowing autonomous discovery without leaking execution logic or bulk content into search results.

---

### Phase 2: Execution Lanes & Instruction Framing Engine
*Build the reliable context delivery and execution mechanisms.*

4.  **Authoritative Directive Assembler (`src/capabilities/directive-assembler`)**
    *   *What:* A context assembly module that translates pinned composer chips, `@` mentions, or mandatory workspace configurations into compact (~100-byte), authoritative prompt directives (e.g., "MANDATORY: Execute `read_skill` for `tovu:skill:ui-ux-design:tables` before emitting table markup").
    *   *Why it exists:* Directly solves the central problem in DP4. Eliminates the 0-of-30 file read failure by providing explicit, authoritative execution steering while ending the 14.8k-character unconditional prompt dump.

5.  **Procedural Skill Reader Adapter (`src/capabilities/adapters/skill-reader`)**
    *   *What:* A bounded, sandboxed file-reading adapter exposed to the agent as `read_skill(urn)`. Validates workspace tenancy, checks package digests, and returns markdown instructions.
    *   *Why it exists:* Provides a safe, dedicated execution lane for procedural instructions without forcing them into `@jini-ai/core`'s `ToolRegistry` (which requires non-optional handlers and execution policies).

6.  **Tool Execution Bridge (`src/capabilities/adapters/tool-bridge`)**
    *   *What:* An adapter routing discovered callable tools directly into the existing `ToolExecutor` and `mcp-federation/trust.ts` pipelines.
    *   *Why it exists:* Enforces Sonnet's load-bearing trust boundary. Ensures unified search cannot bypass the 8 federated MCP admission rules, permission confirmation prompts, or destructive action guards.

---

### Phase 3: Lifecycle Integrity & UI Convergence
*Connect packaging lifecycle and user interface surfaces.*

7.  **Plugin Lifecycle & Digest Pinning Resolver (`src/capabilities/plugin-lifecycle`)**
    *   *What:* A resolver that maps package URNs to active installed content digests in workspace storage, replacing the ambiguous digest matching and eponymous skill hardcoding in `resolve-agent-plugin-refs.ts`.
    *   *Why it exists:* Prevents silent runtime failures during plugin upgrades, enables individual indexing of multi-skill plugins, and ensures saved references in conversation history remain auditably pinned or report actionable upgrade notices.

8.  **Composer Capability Adapter (`apps/admin/src/features/plugins/composer-adapter`)**
    *   *What:* Dynamically populates the composer slash-menu from the `CapabilitySource` registry, replacing hardcoded single-row stubs with live workspace capabilities.
    *   *Why it exists:* Aligns user-facing intent gestures with backend discovery, enabling users to explicitly pin any installed tool, skill, or plugin into the active context.

---

## What I would NOT build, and why

1.  **A Universal `capability_invoke` Tool:** 
    *   *Why:* Treating read-only procedural instructions and destructive RPC calls as the same primitive destroys security privilege separation, creates confused deputy vulnerabilities, and pollutes conversation history with large markdown payloads.
2.  **A Bespoke `agent_plugin_search` Tool:** 
    *   *Why:* Hardcodes a temporary, kind-specific silo that must be deprecated when the next capability kind is introduced.
3.  **MCP Daemon Wrappers for Local Markdown Files:** 
    *   *Why:* Running stdio/SSE sub-processes for static text files introduces extreme IPC latency, process lifecycle fragility, and unnecessary memory overhead.
4.  **Unconditional Bulk Skill Prompt Injection:** 
    *   *Why:* Empirically proven to degrade instruction compliance through prompt dilution while wasting thousands of context tokens per turn.
5.  **Global Indexing Without Workspace Tenant Predicates:** 
    *   *Why:* Multi-tenant security violation; leaks the existence, names, and descriptions of private workspace capabilities across tenants.

---

## Cheapest test that falsifies my own recommendation

**The 20-Task Multi-Skill Execution Benchmark:**
1.  Take the multi-skill `ui-ux-design` plugin (containing 7 distinct sub-skills and reference files).
2.  Run 20 complex frontend design tasks across two test arms:
    *   **Arm A (My Recommendation):** Two-Tier model — compact prompt directive (~100 bytes) pointing to `capability_search` and `read_skill`.
    *   **Arm B (Status Quo / Option A):** Unconditional prompt injection of the entire plugin contents (~35,000 characters).
3.  Measure: (a) Rule compliance rate against specific design tokens, (b) Total token cost per task, and (c) Task completion latency.
4.  **Falsification Condition:** If Arm A yields a statistically significant lower rule compliance rate or higher total cost/latency than Arm B, the recommendation that *on-demand retrieval with authoritative framing beats bulk prompt injection* is **falsified**.

<<SWARM_END>>
