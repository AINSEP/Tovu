# CTX-TOVU-CAPABILITY-BUCKET-2026-08-22

**Packet ID:** `CTX-TOVU-CAPABILITY-BUCKET-2026-08-22`
**Mode:** Swarm Consensus — debate, Round 1 (blind)
**Project type:** brownfield, but the owner has explicitly lifted the "no rewrite" constraint for
this subsystem. Assume nothing in the current structure is load-bearing unless you argue that it is.

---

## ACK FIRST

Before doing any substantive work, emit exactly this line and nothing else if you are in the
handshake/probe call:

```
ACK_PACKET_RECEIVED CTX-TOVU-CAPABILITY-BUCKET-2026-08-22 -- I received the packet and will work on it.
```

End your full substantive response with the literal marker `<<SWARM_END>>` on its own line.
A response without that marker will be discarded as truncated and excluded from synthesis.

---

## 1. The need (neutral statement)

Tovu is a CMS with an embedded AI assistant. A user chats with an agent; the agent can call tools,
and the user can attach things to the conversation from a composer UI.

The owner wants one thing: **a user should be able to throw any kind of capability into the system
and have the assistant figure out how to use it** — without the system needing structural change
each time a new kind of capability appears.

Concretely, the assistant must be able to find and use:

- capabilities the user names explicitly ("use the shadcn skill", "deploy to Vercel"), and
- capabilities matching a broad category the user gestures at ("make this look better", "publish
  this somewhere"), where the user does not know what is installed.

The kinds that exist or are wanted today: **first-party tools, external MCP servers, Agent Plugins
(bundled skills + reference files + an optional mcp.json), regular plugins, and skills.** The owner
expects more kinds to appear that nobody has named yet. That expectation — not today's kind list —
is the design pressure.

The question this debate exists to answer is **what shape best satisfies that need**, and what the
strongest reasons are against each candidate shape.

---

## 2. What exists today (factual inventory — no verdict attached)

These are direct observations from source. They are stated so all participants reason from the same
picture, not to imply any of them is right or wrong.

### 2.1 There are currently three unrelated "capability descriptor" types

| # | Type | File | Consumed by |
|---|---|---|---|
| 1 | `ToolRegistration` / `ToolDescriptor` | `src/assistant/tool-registrations.ts` (605 ln) | the agent, at runtime |
| 2 | `AgentPluginCapabilityDescriptor` | `src/features/agent-plugins/capability-projection.ts` (164 ln) | nothing in production |
| 3 | `TovuComposerCapability` / `ComposerHostBinding` | `apps/admin/src/features/plugins/composer-capabilities.ts` (333 ln) | the composer UI |

Type 2's own module header states it is a "CANDIDATE contract", and its adapter
(`toTovuComposerCapability`) has zero production callers — only its own unit test.

Type 3 defines exactly two execution shapes: `compose-text` (write instruction text into the user's
draft) and `allowlisted-tool-call` (POST to an allowlisted route). Its header states no third kind
exists.

Type 2's `execute` union is `{kind: "context-injection", markdown}` or `{kind: "unavailable", reason}`.
Agent-Plugin-declared MCP servers are **unconditionally** `unavailable` by an explicit prior decision
("a plugin's own mcp.json has no independent author... the operator is that author"), with a unit
test asserting no promotion path exists.

### 2.2 A tool search index already exists and is already wired

`src/assistant/tool-catalog-query.ts` (95 ln) seeds an **in-memory SQLite FTS5 index with `bm25()`
ranking** from `registry.list()` at daemon boot, and backs `GET /api/tools/search` and
`GET /api/tools/:id`. `@jini-ai/mcp`'s `search_tools` / `describe_tool` proxy those routes, so a
spawned agent CLI already has a searchable tool catalog.

- Catalog size: 18 tools when the FTS5 swap was benchmarked (2026-07-30); **131 tools** as of
  2026-08-05.
- Query expansion helpers exist: `tool-search-keywords.ts` (operator vocabulary folded into indexed
  descriptions) and `tool-search-doc2query.ts`.
- The index is `:memory:`, disposable, and **seeded once at boot** — the registry is rebuilt from
  static code on every daemon boot.
- A prior retrieval measurement on this catalog put baseline top-3 accuracy near 25%; a doc2query
  expansion improved it; a vector-search approach was evaluated and rejected. (Reported from project
  memory, not re-verified for this packet — treat as indicative, not proven.)

### 2.3 How each kind currently reaches the agent

| Kind | Path to the agent | Agent-callable without user action? |
|---|---|---|
| First-party tools | registered into `ToolRegistry`, indexed, executed via `ToolExecutor` | yes |
| External MCP servers | `mcp-federation/` (`bootstrap`, `presets`, `trust`, `registrations`, `adapter.stdio`) + `external-mcp-store.ts`; federated tools appear as `mcp__<connectionId>__<tool>` | yes |
| Regular plugins | `plugins_list` is a registered tool | yes |
| **Agent Plugins** | **no tool exists.** Content reaches the agent only by being injected into the prompt when the user pins a "chip" in the composer | **no** |
| Skills (inside an Agent Plugin) | same prompt-injection path | no |

`src/features/agent-plugins/resolve-agent-plugin-refs.ts` (187 ln) builds the injected block. Measured
behaviour on a real install: the injected block was ~14,800 characters per message and contained one
SKILL.md plus 30 reference files listed by absolute path.

### 2.4 Registry pattern already in use

`src/assistant/tool-contribution-registry.ts` is a module-level ordered list with a
`register* / list* / reset*ForTests` trio and replace-by-key semantics. Its header states this is the
established shape in this codebase for "a plugin announces itself to a core-owned seam", citing three
other instances (`mcp-federation/presets.ts`, `page-head.ts`, `routing.ts`). A contributor is
`{ domain, build(deps, surfaces) => ToolRegistration[], risk }`.

### 2.5 Observed constraints in the current Agent Plugin implementation

Each verified against source in a prior session:

1. `resolve-agent-plugin-refs.ts:153` hardcodes `skills/${pluginRefId}/SKILL.md` — the resolver always
   loads the skill whose folder name equals the plugin id, regardless of which item the user picked.
2. That "eponymous skill" is a **convention with zero enforcement**. The Agent Plugin manifest schema
   requires only `name`. A third-party plugin shipping no `skills/<pluginId>/SKILL.md` installs
   successfully and is then permanently unreachable.
3. One real installed plugin (`ui-ux-design`) contains **7 skill folders**. There is no way to
   reference an individual skill.
4. `listInstalledPlugins` walks every content digest under `packages/sha256/*`, so two installed
   versions of the same plugin id both appear.
5. Three assistant transports exist, not two: Local CLI, BYOK, and AG-UI. The AG-UI transport
   hardcodes `context: []`, so pinned context does not reach the agent on that path at all.
6. The composer's capability menu is six groups, five of which are hardcoded single-row stubs. The
   slash typeahead already searches the merged catalog.

### 2.6 Deployment / runtime facts that bound the design

- The assistant spawns **agent CLIs as subprocesses** (PATH detection); it is not calling a vendor
  HTTP API with a key in the common path. A spawned CLI reaches Tovu tools through a local MCP
  bridge (`mcp-injection.ts`) that proxies back into the daemon.
- Tovu is **multi-workspace / multi-tenant** by design; a single content database serves multiple
  workspaces.
- The tool catalog is seeded at daemon boot and is not refreshed while the daemon runs.
- Storage today is SQLite, with an in-flight migration toward Postgres.

---

## 3. Constraints

**Hard:**
- The user must not have to know a capability's kind in order to use it.
- Whatever ships must work for a capability authored by a third party who never read Tovu's source.
- The system must tolerate a new kind of capability being added later without a schema migration of
  every existing kind.

**Soft (state explicitly if you propose violating one):**
- Prefer not to add a new persistent datastore if an existing one suffices.
- The MCP-UI / A2UI / generative-UI rendering surface is currently considered deferrable by the
  owner. If you believe deferring it forces a rework later, say so and show the specific coupling.
- The owner's own near-term use case: an external image-generation MCP returning images that render
  inline in the chat.

---

## 4. A working coverage inventory — attack this, do not accept it

The Coordinator drafted the taxonomy below while scoping the problem. **It is included specifically
so you can attack it.** It has not been validated, it is not a proposal, and agreeing with it is not
the goal. The owner's literal request is: *"ask them what did we miss from this list."*

Proposed grouping — by what the agent does with the capability:

| Group | Agent's verb | Examples given |
|---|---|---|
| CALL | invokes it | MCP tools, CLI commands, HTTP/OpenAPI-derived tools, sub-agent delegation, scheduled/triggered jobs |
| READ | fetches text | Agent Plugin skills, docs, knowledge bases, project memory, workspace files |
| SHAPE | alters how the agent behaves | personas / system-prompt fragments, output styles, hooks, permission policies, model selection |
| RENDER | produces something visible | inline images, MCP-UI panels, themes, embeds, content transforms |

Draft descriptor fields floated alongside it: `id`, `kind`, `name`, `description`, `activate`, `source`.

**Required of you:**
1. Name every capability class this taxonomy fails to cover, or covers wrongly.
2. Say whether "what the agent does with it" is even the right axis to group on, and if not, what is.
3. Identify any group above that is a false grouping — items placed together that do not actually
   share a mechanism.

---

## 5. Structural dimensions the framing does not currently address

The Coordinator's scoping did not cover these. They are listed as open questions, not as a checklist
to tick. Address the ones you judge load-bearing and say which you judge irrelevant and why.

1. **Lifecycle** — install, upgrade, disable, uninstall. What happens to a user's saved reference to a
   capability whose source was removed or upgraded to a different content digest?
2. **Trust and admission** — a third-party capability that wants to *execute* something. The existing
   code has two separate partial answers (`mcp-federation/trust.ts`, and a hardcoded allowlist
   `MCP_UI_REDEEMABLE_TOOL_IDS`). What is the right single answer, and does a unified bucket make the
   trust problem better or worse?
3. **Failure modes** — an external MCP that is down, slow, non-deterministic, or returns malformed
   output. What does the agent see, and what does the user see?
4. **Tenancy and scoping** — which capabilities are visible to which workspace, site, or user, given
   one daemon and one database serve several.
5. **Freshness / invalidation** — the catalog is seeded once at boot. Installing a capability
   mid-session currently does not appear. Is a live-updating catalog required, or is boot-time seeding
   acceptable, and what breaks either way?
6. **Discovery cost and scale** — 131 tools today. At what catalog size does listing stop working and
   ranked retrieval become mandatory? What happens to a small catalog if retrieval is used anyway?
7. **Guaranteed vs optional delivery** — a tool the agent *may* call versus content the system
   *guarantees* the agent sees. A measured A/B on this repo: when an injected block described its own
   attached files as optional, the agent read 0 of 30 of them; when the wording said to read them, it
   read exactly the 4 the skill named. Neither run changed the final output relative to a no-plugin
   control. Draw your own conclusion from that; none is asserted here.

---

## 6. Candidate shapes to evaluate

These are options, not a shortlist, and not ranked. At least one must be rejected in your answer, and
you are expected to reject any that deserve it.

**A. Keep the current architecture.** Agent Plugins stay prompt-injected; add a composer menu that
groups by plugin id. Nothing else changes.

**B. One unified capability registry + one agent-facing search tool.** Every kind projects into a
single descriptor type, seeded into the existing FTS5/BM25 catalog. The agent gets one
`capability_search` and one `capability_get` / `capability_invoke`.

**C. Keep kinds separate; add only the missing tool.** Leave tools, MCP, and plugins exactly as they
are; add `agent_plugin_search` / `agent_plugin_read_skill` so Agent Plugins have the tool surface the
other kinds already have. No unification.

**D. Everything becomes an MCP server.** Agent Plugins, skills, and first-party tools are all exposed
through MCP — one protocol, one discovery mechanism, capabilities as MCP resources/prompts/tools.
Tovu stops having a private capability concept.

**E. Two-lane split.** Callable things go in the tool registry (as today). Readable things go in a
separate content index with its own retrieval tool. No single unified type; a deliberate,
documented seam between the two.

**F. Something else.** Is there a strong option, shift, or decomposition not listed above that you
believe is better, or that this framing has missed entirely? If yes, describe it and explain why it
is stronger than the presented options.

---

## 7. Your adversarial task

1. Identify the best design for the stated need, and justify it against the alternatives.
2. Explicitly reject the options that deserve rejection, with the specific reason each fails.
3. For each option you take seriously, name its failure modes, its hidden costs, and the concrete
   conditions under which it would be the wrong choice. If an option looks all-upside, find the cost
   being hidden.
4. State what evidence, repo fact, or assumption change would move you off your answer.

---

## 8. Blind Spots (REQUIRED — a response without this section is incomplete)

Return a dedicated `Blind Spots` section naming:

- **(a)** a viable option this packet failed to list;
- **(b)** a question we should be asking but are not — a reframe of the problem, not another answer to
  the questions already posed;
- **(c)** the single assumption baked into this framing that is most likely to be wrong, and why.

Do not skip this because the option set looks complete. Its purpose is to surface the question the
Coordinator did not think to ask.

---

## 9. Bias Risk note

§4 and §6 were authored by the Coordinator. §4 in particular is a draft taxonomy the owner explicitly
asked peers to find holes in. Treat both sections as material to attack, not as the expected answer.
No Coordinator position, leaning, finding, or verdict appears anywhere in this packet, and the
Coordinator's own first-pass answer has been frozen and withheld from you by design.

---

## 10. Repo file access

You may read repo files for grounding. A bounded set relevant to this question:

```
src/assistant/tool-catalog-query.ts
src/assistant/tool-contribution-registry.ts
src/assistant/tool-registrations.ts
src/assistant/mcp-injection.ts
src/assistant/mcp-federation/trust.ts
src/assistant/mcp-federation/presets.ts
src/assistant/external-mcp-store.ts
src/features/agent-plugins/capability-projection.ts
src/features/agent-plugins/resolve-agent-plugin-refs.ts
src/features/agent-plugins/manifest.ts
src/features/agent-plugins/install.ts
apps/admin/src/features/plugins/composer-capabilities.ts
```

Do not run tests, do not start servers, do not modify any file. Read-only.

---

## 11. Output format

```
## Position
<your recommended shape, in 3 sentences or fewer>

## Why
<full reasoning>

## Rejected
<each option you reject, with the specific reason>

## Failure modes and hidden costs
<per option you took seriously>

## What we missed (§4 attack)
<capability classes absent or miscategorised; whether the grouping axis itself is wrong>

## Structural dimensions
<your take on §5 items 1-7: which are load-bearing, which are not, and why>

## What would change my mind
<specific evidence or repo fact>

## Blind Spots
(a) <unlisted option>
(b) <question we should be asking but aren't>
(c) <framing assumption most likely to be wrong, and why>

<<SWARM_END>>
```
