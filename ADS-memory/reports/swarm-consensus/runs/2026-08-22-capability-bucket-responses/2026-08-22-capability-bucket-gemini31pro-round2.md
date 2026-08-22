ACK_PACKET_RECEIVED CTX-TOVU-CAPABILITY-BUCKET-R2-2026-08-22 -- I received the packet and will work on it.

## DP1 / DP2 / DP3 / DP4 / DP5

**DP1 — One discovery index over many registered sources, or two separate indexes (callable vs readable)?**
*   **Position:** One unified discovery index (a Facade) pointing to separate execution/admission lanes.
*   **Changed this round?** Yes. The Coordinator’s verification that `buildToolCatalogQuery` only requires a `.list()` of pure metadata `ToolDescriptor`s proves that a unified index is mechanically trivial and does not require polluting the real `ToolRegistry` with handler-less dummy entries.
*   **Why:** A unified index provides a single surface for the agent to resolve ambiguous user intent without fragmenting its search strategy. Because the index only stores and returns metadata (including a `modality` tag), it does not execute anything, completely dodging the kernel type-change risk.
*   **Strongest counter to the leading opposing view (Sonnet's "two indexes prevent trust drift"):** Trust drift is a policy and execution problem, not a discovery problem. Returning a unified list of results does not collapse trust boundaries if the agent is required to pass the discovered ID to strictly segregated, modality-specific adapters (`call_tool` vs `read_skill`) to actually use them.
*   **What would change my mind:** Telemetry demonstrating that the agent consistently ignores the `modality` tag in search results and hallucinates tool calls against read-only skills, proving it cannot safely route its own execution from a unified list.

**DP2 — What is the primary structural axis?**
*   **Position:** The Operation Contract (encompassing protocol, trust boundary, side-effects, and schema).
*   **Changed this round?** No, but solidifying around Codex's definition as the most robust.
*   **Why:** A capability's essence is strictly defined by how the system interacts with it. "Modality + trust" is an informal grouping; an operation contract formalizes these constraints into a verifiable interface. It correctly separates a synchronous internal read from an async external mutation, ensuring the correct adapter handles the invocation.
*   **Strongest counter to the leading opposing view (Sonnet's "admission/trust pipeline"):** While trust is a critical prerequisite for execution, it does not define the *shape* of the execution. Two capabilities might share an identical native admission pipeline, yet one is a read-only context injection and the other is a stateful background job. The axis must govern execution semantics, not just gatekeeping.
*   **What would change my mind:** If Tovu's architecture evolves such that all execution is outsourced to a federated orchestrator, leaving Tovu strictly as an admission and authorization gatekeeper.

**DP3 — Is boot-only index seeding acceptable?**
*   **Position:** No. Boot-only seeding is entirely unacceptable.
*   **Changed this round?** No.
*   **Why:** The core product workflow is "install a capability mid-conversation and immediately use it." If the index only seeds at boot, a newly installed Agent Plugin remains invisible to the agent until a daemon restart. This breaks the fundamental UX promise of the platform.
*   **Strongest counter to the leading opposing view (Sonnet's "it matches existing accepted behavior"):** Existing behavior is not a defense when that behavior actively prevents the flagship use case. The FTS5 index was disposable for static, first-party tools, but that model fundamentally fails when dynamic, user-driven plugin installations are introduced.
*   **What would change my mind:** If installing any capability required a mandatory host daemon restart for security sandboxing or dependency resolution, making dynamic runtime discovery structurally impossible anyway.

**DP4 — THE CENTRAL QUESTION. Is this a discovery problem at all?**
*   **Position:** No. Findability is a secondary bottleneck; the binding constraint is instruction-following and delivery mechanics.
*   **Changed this round?** Yes, shifting the primary focus from "how to search" to "how to enforce usage."
*   **Why:** Sonnet’s empirical evidence is irrefutable: 14.8k characters were already in the prompt unconditionally, requiring zero search, and the agent still ignored 30 of 30 files until the wrapper stopped hedging. If the agent ignores what is handed to it, making it easier to search for changes nothing. We must build explicit context pinning and strict behavioral guards that force the agent to consume the capability.
*   **Does the capability bucket still earn its cost?** Yes, but exclusively as a host-side multi-tenant registry for lifecycle management, isolation, and UI Composer projection—not as a magic bullet for agent discovery.
*   **Strongest counter to the leading opposing view (The assumption that search fixes the gap):** You cannot solve an agent behavioral failure (ignoring context) with an information retrieval tool.
*   **What would change my mind:** A/B test telemetry showing that, even with strict hedging removed, the agent begins proactively searching for and successfully utilizing un-pinned skills on its own initiative to solve vague user requests.

**DP5 — Is the tactical option (add only Agent-Plugin search/read tools) an acceptable first slice or a trap?**
*   **Position:** It is an acceptable first slice ONLY if the tool is named and typed as the end-state `capability_search` from the first commit.
*   **Changed this round?** Yes.
*   **Why:** The primary risk of the tactical option is per-kind naming debt. If we name it `capability_search` and return results with explicit `modality` tags, we establish the correct agent-facing API contract immediately. The fact that it initially only proxies Agent Plugins is just an implementation detail that can be transparently expanded later.
*   **Strongest counter to the leading opposing view (Gemini's "reject outright"):** Rejecting it outright demands a "big bang" rewrite of the entire backend catalog before delivering any user value. A correctly named facade provides immediate reachability for skills while laying the exact architectural groundwork for future unification.
*   **What would change my mind:** If establishing the `capability_search` facade signature requires massive refactoring of the existing agent CLI prompt logic, making it far too expensive for a tactical first slice.

---

## Ranking criteria
1. **Instruction Compliance & Delivery:** Does the architecture directly solve the DP4 empirical failure (the agent ignoring provided context)?
2. **Host-Side Unity:** Does it centralize multi-tenant scoping, installation lifecycle, and UI projection?
3. **Trust & Execution Isolation:** Does it preserve the strict separation between read-only skills and mutating/external tools?
4. **Agent-Side Ergonomics:** Does it prevent context window bloat and avoid confusing the agent with merged execution paths?

---

## Slate
1. **Unified Host Registry + Discovery Facade with Strict Delivery Guards (Recommended)**
   *   *Sacrifice:* High initial backend complexity. Requires building a unified metadata sync layer and teaching the agent to interpret search result modalities to select the correct execution tool, increasing multi-step latency.
2. **Tactical Facade (`capability_search` querying only Plugins initially)**
   *   *Sacrifice:* Defers host-side multi-tenant registry unification. Leaves existing tools in their current discovery lane temporarily, meaning the agent must juggle two search tools (`search_tools`, `capability_search`) until the backend catches up.
3. **Two-Lane Split (Callable vs Readable Indexes)**
   *   *Sacrifice:* Fractures host-side UI and lifecycle logic. Hardcodes a binary split that will require a painful database schema migration the moment a third modality (e.g., interactive UI widgets or event subscriptions) is introduced.
4. **Universal `capability_invoke` Router (Option B literal)**
   *   *Sacrifice:* Catastrophic security and context degradation. Forces read-only skills to pass through the same central executor as mutating tools, risking a confused deputy problem and bloating the context window with massive markdown dumps masquerading as tool outputs.

---

## BUILD OUTLINE

1. **Unified Metadata Descriptor Schema**
   *   **What:** A shared metadata data structure defining a capability's identity (`id`, `name`, `description`, `workspace_id`, `modality`, `status`). It contains absolutely no execution handlers or policies.
   *   **Why:** To decouple *what a capability is* (for the UI and search index) from *how it runs*. As verified, FTS5 only needs descriptors. This allows us to unify indexing and Composer UI projection without breaking the `@jini-ai/core` type contract or forcing read-only skills to implement dummy execution handlers.

2. **Dynamic Host-Side Capability Registry**
   *   **What:** A central, persistent data store that tracks the installation lifecycle, tenancy (workspace scoping), and active state of all capabilities across all modalities.
   *   **Why:** To solve the critical lifecycle and isolation failures identified in Round 1 (e.g., cross-tenant leakage, unresolved digests). It ensures that when a user uninstalls an Agent Plugin, all associated skills instantly vanish from the active context, the Composer, and the search index, rather than silently persisting until the next daemon boot.

3. **The Discovery Facade (`capability_search`)**
   *   **What:** A single, agent-facing FTS5 search index dynamically populated from the Host Registry's descriptors. It accepts a text query and returns ranked capability cards containing the `id`, `description`, and, crucially, the `modality`.
   *   **Why:** To solve the agent-side UX gap. The agent needs one place to query when user intent is vague. By returning *pointers* rather than executing anything, we achieve discovery unification without collapsing trust boundaries.

4. **Isolated Modality Adapters (The Execution Lanes)**
   *   **What:** Distinct, purpose-built agent tools for interacting with specific modalities (e.g., the existing `call_tool` routed to `ToolExecutor`, and a new `read_resource` bounded reader for skills).
   *   **Why:** To strictly preserve security and trust pipelines. A read-only skill should never touch the complex admission and confirmation logic required for a federated MCP tool. Segregated adapters ensure the agent uses the right tool for the right job based on the `modality` tag it found in the Discovery Facade.

5. **Mandatory Context Pinning and Behavioral Guards**
   *   **What:** A mechanism in the run assembler that injects explicit, non-optional directives (e.g., "You MUST read and apply skill X before proceeding") into the system prompt when a capability is pinned in the Composer or resolved via search.
   *   **Why:** To directly address the DP4 empirical failure. Discovery is useless if the agent ignores the results. This turns optional context into a mandatory behavioral constraint, ensuring the capability is actually utilized.

---

## What I would NOT build, and why

*   **I would NOT build a universal `capability_invoke` router.**
    *   **Why:** It introduces a central "god function" that must understand the security, tenancy, and execution semantics of every current and future capability. It destroys the native/federated trust split established in `trust.ts` and risks massive context bloat by treating a 15KB procedural document read the same as a JSON RPC response.
*   **I would NOT build a new FTS5 index for every new capability kind.**
    *   **Why:** It forces the agent to guess which index to search when a user asks a vague question. The Coordinator verified we only need metadata to seed the index; fragmenting the search surface is unnecessary and degrades the agent's ability to find the right tool.

---

## Cheapest test that falsifies my own recommendation

**The Modality Disambiguation Test:**
Deploy the Discovery Facade (`capability_search`) returning a mixed list of Callable Tools and Readable Skills. Provide the agent with a vague user prompt that requires reading a skill. 

**Falsification condition:** If the agent successfully finds the skill in the search results but repeatedly attempts to execute it via `call_tool` instead of `read_resource` (ignoring the `modality` tag), the recommendation is falsified. It would prove the agent cannot safely route its own execution based on a unified search result, forcing us to build a host-side `capability_invoke` router despite its severe architectural risks.

<<SWARM_END>>
