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