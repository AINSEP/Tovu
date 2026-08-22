I’m loading the mandatory workspace bootstrap and the codebase-understanding skill instructions first. I’ll keep this round read-only and produce only the requested decision analysis and build outline—no code or repository changes.

The understanding skill’s workflow would generate graph artifacts and pause for configuration, which conflicts with this packet’s read-only/no-modification constraint. I’m reading its instructions fully as required, but I will not execute the write-producing workflow; I’ll rely on the packet’s verified source findings and clearly separate recommendation from assumptions.

Codex(Consensus):

## DP1

**Position:** Build one logical discovery index over many registered metadata sources. Keep execution, admission, and content retrieval on separate typed lanes.

**Changed this round?** Refined, not reversed. Round 1 left room for federated ranking across multiple internal catalogs. The verified `.list()` contract makes a single FTS5 projection materially cheaper: discovery-only descriptors do not need handlers, do not need to enter the real `ToolRegistry`, and do not require a new datastore or shared-core type change.

**Why:** A user should not have to know whether “help me improve this interface” maps to a tool, skill, plugin resource, or future capability type. One eligible-result set supports that requirement while registered sources retain ownership of lifecycle and activation.

Trust must not be inferred from index membership. Before ranking, the discovery projection must apply workspace scope, installation state, visibility policy, and source admission. Results must retain provenance, trust status, and supported operations. Selecting a result never grants permission to activate it.

**Strongest counter to two indexes:** Separate callable/readable indexes protect a distinction that is not actually a complete trust boundary. A read can expose private data, incur network cost, contain hostile instructions, or require credentials; a call can be local, deterministic, and read-only. Trust belongs to source and operation admission, not to which search box contains the record. Two indexes also make hybrid packages duplicate identity and make the agent route its query before it knows what it needs.

Sonnet’s real objection is valid as an operational warning: teams may let one discovery surface become one trust tier by convenience. The answer is an invariant—discovery returns candidates; only operation-specific authorities admit activation—not a second agent-facing index.

**What would change my mind:** Evidence that mixed ranking materially reduces eligible recall or leaks sensitive metadata even with pre-ranking scope filters, and that lane-specific indexes eliminate those failures without introducing routing or identity drift.

## DP2

**Position:** The primary structural axis is the **operation contract**.

An operation contract distinguishes bounded content retrieval, tool execution, context contribution, asynchronous work, subscription, rendering, and any future protocol. It describes completion mode, inputs and outputs, side effects, reversibility, interaction requirements, and the adapter responsible for activation.

**Changed this round?** No, but the boundary is sharper: the capability record is not primarily an execution schema. It is stable identity plus one or more operation contracts. Modality, trust, and tenancy constrain those operations.

**Why:** Operation contracts determine what the host must actually do and which guarantees it can provide. A hybrid capability can expose both readable guidance and callable actions without being duplicated or forced into one “kind.”

**Strongest counter to modality + trust + tenancy:** Those are indispensable dimensions, but they do not tell the host whether activation returns content, invokes a handler, suspends for approval, starts a job, or installs context. They classify risk and availability without specifying behavior.

**Strongest counter to admission/trust pipeline:** Admission is too deployment-specific to be the primary domain axis. Native and federated tools may require different admission today, but both still expose tool-call operations. Conversely, two reads may require radically different admission. Making the current pipeline layout primary would fossilize today’s adapters into the capability model.

**What would change my mind:** Proof that operation contracts remain effectively identical while admission rules account for nearly all meaningful implementation variance, or that the supported system is permanently limited to bounded reads and synchronous tool calls.

## DP3

**Position:** Boot-only seeding is unacceptable for dynamic sources. It remains acceptable for immutable first-party sources whose membership cannot change during a process lifetime.

**Changed this round?** No.

**Why:** “Consistent with existing behavior” is evidence about implementation precedent, not correctness. The flagship workflow explicitly requires installing or enabling a capability and using it in the same conversation. A boot-only index deterministically violates that requirement.

The index can remain disposable and in-memory. What is required is invalidation or atomic rebuilding after install, uninstall, upgrade, enable/disable, workspace change, or provider refresh—not a new persistent datastore.

**Strongest counter to Sonnet’s position:** Existing tool behavior was accepted under a different lifecycle. It cannot justify carrying a known stale-read defect into an installable capability system. Reusing the FTS5 implementation does not require reusing its freshness limitation.

**What would change my mind:** A product decision that installations and connection changes only take effect at session boundaries, paired with UI that states this clearly and automatically starts a fresh session.

## DP4

**Position:** The observed Agent Plugin failure is **not primarily a discovery problem**. The binding constraint is reliable instruction delivery and compliance: selecting the right material, framing it as mandatory when applicable, proving that the agent consumed it, and checking whether its required behavior affected the result.

This should be built before broad capability discovery.

**Changed this round?** Yes in priority, not in architecture. Round 1 treated unified discovery as the recommended system and instruction delivery as a required property. The empirical result reverses their build order: discovery is supporting infrastructure; delivery and compliance are the first product problem.

**Why:** The agent already had approximately 14,800 characters of skill content and still read none of 30 referenced files until the wrapper became explicit. Improving retrieval cannot fix material that was already retrieved. A larger catalog could make the failure worse by adding an optional search step the agent can also skip.

The first system therefore needs an explicit delivery contract:

- Decide whether a capability is optional, recommended, user-selected, or required.
- Resolve only the relevant instruction and bounded references.
- State the required action unambiguously.
- Require an observable consumption receipt.
- Verify the expected behavior or postcondition where feasible.
- Record failures separately as selection, resolution, delivery, compliance, or execution failures.

The capability bucket still earns a bounded cost because Tovu needs stable identity, workspace scope, installation state, provenance, revisions, and a common composer/search projection. It does **not** earn a universal invocation layer, a large taxonomy, or the claim that search will make agents comply.

**Strongest counter to discovery-first:** Discovery-first optimizes candidate retrieval before proving that a correctly selected candidate changes task behavior. That risks building a catalog around the wrong bottleneck.

**What would change my mind:** A controlled test showing that explicit, mandatory delivery of the correct skill still fails, while agent-initiated search and read reliably succeeds on the same tasks. That would imply active retrieval itself creates useful commitment or attention.

## DP5

**Position:** A narrow Agent Plugin search/read slice is acceptable only if it is implemented as the first source behind generic `capability_search` and bounded `capability_read` contracts—and only after the delivery/compliance slice. As a standalone feature or endpoint, it is a trap.

**Changed this round?** Slightly more favorable. The verified descriptor-only `.list()` seam means the tactical slice can reuse the existing index without changing the real tool registry or inventing another datastore.

**Why:** Naming it `capability_search` removes the most visible retirement cost, but naming alone is insufficient. The slice also needs stable item identity, source registration, workspace filtering, live invalidation, bounded reads, and operation/provenance labels. Without those, it is merely `agent_plugin_search` with a future-facing name.

**Strongest counter to rejecting it outright:** A generic first source provides immediate value, tests the source contract, and fixes individual-skill reachability without committing to a universal executor or speculative capability kinds.

**What would change my mind:** If those generic seams materially enlarge the slice or delay the instruction-delivery fix, ship an explicitly temporary Agent Plugin tool with a removal condition instead.

## Ranking criteria

I rank options by:

1. Whether they attack the empirically demonstrated failure.
2. Whether they support install-and-use in the same conversation.
3. Whether trust, tenancy, and execution boundaries remain enforceable.
4. Whether the first slice can be reused without speculative schema design.
5. Whether failures become observable and attributable.
6. Implementation and migration cost.
7. How much architecture is built before user value is demonstrated.

## Slate

### 1. Delivery-first, then unified discovery over typed operation lanes

Build reliable selection, instruction delivery, consumption evidence, and outcome checks first. Then add one capability discovery projection backed by registered sources, while existing execution authorities remain separate.

**Why ranked first:** It addresses the measured failure and still establishes the minimum durable platform needed for third-party capability growth.

**Genuine sacrifice:** Cross-kind autonomous discovery arrives later. It also creates two concepts that must stay aligned: the discovery record and the source-owned activation contract.

### 2. Generic Agent Plugin search/read first, followed immediately by delivery enforcement

Expose installed skills through `capability_search` and `capability_read`, then improve mandatory pointers and consumption telemetry.

**Why ranked second:** It is the cheapest reusable reachability improvement and benefits from the verified `.list()` seam.

**Genuine sacrifice:** It knowingly attacks the secondary constraint first. A successful search feature may show no task-success improvement because the agent can ignore the result just as it ignored injected references.

### 3. Delivery-only repair; defer the capability bucket

Fix resolver ambiguity, explicit instruction framing, bounded context assembly, and compliance telemetry. Leave tools and plugin skills in separate discovery systems until measurements justify unification.

**Why it remains viable:** It is the smallest response to the strongest evidence.

**Genuine sacrifice:** Third-party skills remain difficult to discover without pinning, composer projections continue to drift, and the next capability source repeats integration work.

## BUILD OUTLINE

### 1. Define success and classify the observed failure

Establish representative tasks for explicit user-selected skills, implicit skill relevance, exact-name tool requests, vague cross-kind requests, and install-then-use behavior.

Separate metrics for selection, resolution, delivery, consumption, activation, and task outcome.

**Why this exists:** Without stage-specific measurements, a failure to follow instructions will continue to be mislabeled as poor search, while retrieval improvements can appear successful without improving completed work.

### 2. Define delivery semantics before catalog semantics

Give capability contributions explicit delivery levels: optional, recommended, user-selected, and required. Specify who may assign each level and whether it applies to a turn, run, workspace, or saved configuration.

**Why this exists:** The experiment shows that availability is not delivery. The host must know when it is promising merely to expose content and when it is promising that the agent will use it.

### 3. Build the required-instruction assembly path

For user-selected or policy-required capabilities, resolve the exact instruction unit, select only necessary references, impose content limits, and issue a direct requirement that names the expected action.

Preserve source, revision, and selected reference identities in run metadata.

**Why this exists:** It prevents bulk prompt injection, ambiguous “consider using” language, eponymous-skill assumptions, and silent resolution to the wrong installed digest.

### 4. Add consumption and compliance evidence

Record whether required instructions and references were acknowledged or read. Where a capability declares an observable postcondition, record whether it was satisfied. Do not treat acknowledgment alone as success.

**Why this exists:** It distinguishes “the agent never saw it,” “the agent saw but ignored it,” and “the agent followed it but the task still failed.” Those require different remedies.

### 5. Establish stable installed-capability identity

Model the installed package, its individually addressable capabilities, active revision, workspace ownership, enablement state, and tombstone or upgrade state for saved references.

**Why this exists:** Search increases exposure to existing zero/one/many digest ambiguity. Stable identity prevents a saved reference from silently retargeting or becoming inexplicably ambiguous after upgrade.

### 6. Define the minimal discovery record and source contract

The discovery record should contain only stable identity, name, summary, search terms, source/provenance, workspace scope, availability, revision, and advertised operation references.

Registered sources own listing and resolution. Source-specific payloads remain outside the common record.

**Why this exists:** This creates a reusable catalog without turning it into a god schema or changing `ToolRegistration`. It also lets Agent Plugin skills, existing tools, and future providers project metadata without sharing execution types.

### 7. Project eligible records into one disposable discovery index

Reuse the existing FTS5/BM25 pattern with a descriptor-list facade. Filter by authenticated workspace, installation state, and visibility before ranking. Preserve source, operation, and trust labels in every result.

For small eligible catalogs or low-confidence queries, include a complete-list fallback.

**Why this exists:** One query can answer user intent without requiring the agent to guess a lane first. Pre-ranking filtering prevents cross-tenant or disabled-capability metadata leakage; fallback avoids making weak retrieval the only route.

### 8. Add live generation and invalidation

Rebuild or incrementally update the disposable index after install, upgrade, uninstall, enable/disable, workspace switch, and provider refresh. Give active runs a defined catalog generation so mid-run changes behave deterministically.

**Why this exists:** It satisfies install-and-use in the same conversation while retaining the current index’s disposable nature.

### 9. Expose generic search, describe, and bounded-read behavior

Expose generic discovery from the first public slice. Description returns provenance, availability, operations, and configuration requirements. Bounded reading applies only to content-read operations and enforces package-root confinement, size limits, and supported media types.

**Why this exists:** Search results alone are too shallow for reliable planning, while arbitrary plugin file reads create traversal, secret exposure, and context-size risks.

### 10. Preserve existing execution authorities

Existing native tools continue through `ToolExecutor`; federated MCP tools retain their defensive admission path; Agent Plugin content uses bounded retrieval and instruction assembly. Future jobs, subscriptions, or renderers receive their own adapters only when a real use case appears.

No discovery component executes an operation directly.

**Why this exists:** A shared index must not become a confused deputy or erase source-specific trust. This is the hard boundary that answers Sonnet’s one-surface/one-tier concern.

### 11. Add an activation-resolution boundary

When a selected record advertises an operation, resolve it through the owning source, confirm the requested revision and scope, then delegate to the correct existing authority.

Normalize only common failure categories—unavailable, stale, configuration required, denied, confirmation required, timeout, partial result—while retaining adapter-specific detail.

**Why this exists:** It prevents stale search handles, keeps policy outside capability-authored metadata, and gives the agent actionable failures without pretending all operations have identical semantics.

### 12. Integrate composer selection with the same identities

Replace packaging-based or hardcoded rows incrementally with discovery records. A composer selection should create a user-selected delivery reference, not inject a package-shaped blob.

**Why this exists:** The composer and agent otherwise continue describing different capability universes. User selection must feed the reliable delivery path, not bypass it.

### 13. Evaluate before adding further capability sources

Compare the baseline, delivery-only system, and delivery-plus-discovery system on the task set from step 1. Require improvements in completed-task success, not merely search recall or reference-read count.

Only after that result should additional sources such as knowledge bases, project memory, prompts, or workflows enter the index.

**Why this exists:** It prevents the bucket from expanding by architectural enthusiasm before its incremental value is established.

### 14. Add third-party author conformance only after the internal contract stabilizes

Provide validation for unique identities, resolvable operations, bounded content, lifecycle events, workspace behavior, and truthful provenance. Test that every advertised operation either resolves or reports a defined unavailable state.

**Why this exists:** Third-party extensibility fails if catalog records and activation drift. Delaying the public contract avoids freezing assumptions learned from only one plugin.

## What I would NOT build, and why

- **No universal `capability_invoke`.** It would conceal different authorization, completion, interaction, and failure semantics behind one privileged router.
- **No second agent-facing callable/readable search surface.** It forces premature query routing and treats modality as a complete trust boundary.
- **No new persistent capability datastore for the search index.** Installation state should remain authoritative; FTS5 is a disposable projection.
- **No change to Jini’s `ToolRegistration` to allow handler-less rows.** The descriptor-list seam already supports discovery without weakening a shared kernel type.
- **No closed capability-kind taxonomy.** CALL, READ, SHAPE, and RENDER are neither exhaustive nor stable activation contracts.
- **No speculative adapters for jobs, subscriptions, hooks, renderers, credentials, or sub-agents.** Preserve space for them in the operation namespace, but build an adapter only with a real capability and test case.
- **No unconditional bulk skill injection.** It spends context without guaranteeing compliance.
- **No claim that acknowledgments prove task success.** They are diagnostic evidence, not the postcondition.
- **No MCP-UI implementation in this slice.** Typed multimodal outputs may need preservation, but interactive rendering is not implicated in the demonstrated failure.

## Cheapest test that falsifies my own recommendation

Use the existing reference-reading scenario with no new index:

1. Select four known reference files from the already resolved skill.
2. Deliver a short, explicit requirement naming those four files and requiring a one-line consumption receipt before task execution.
3. Run the same small task set against the current optional/bulk framing.
4. Compare actual reference consumption and task-level compliance.

My delivery-first recommendation is falsified if explicit required delivery still produces no meaningful improvement, while a minimal `capability_search` → bounded read flow on the same content reliably improves task outcomes. That result would show that active self-retrieval—not delivery framing—is the binding mechanism, and the discovery slice should move to the front.

The missing mandated architecture and project-memory documents remain a limitation: `tovu-architecture.md`, `tovu/PROJECT_MEMORY.md`, and `tovu/src/INFO.md` are absent, so boundary details that depended on them remain provisional.

<<SWARM_END>>