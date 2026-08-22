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
