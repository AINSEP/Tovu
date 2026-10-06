# General-tools proposal — Codex (gpt-6.1-sol, high), 2026-10-05

Independent second opinion; companion to `general-tools-proposal.md` (Claude Opus 5.5, commit 48361d8a7). Written read-only, not coordinated with the Claude proposal. Owner decisions recorded in `development/todos.md` ("LATER — Per-domain general tools").

**1. Verdict**

- **Per-domain general tools are a reasonable idea when they group coherent actions behind precise schemas.** A large bag of optional arguments would be a poor design.
- They can reduce tool names and repeated wiring. They **cannot remove the underlying action contracts**, permissions, validation, feature logic, or tests.
- I recommend **D: domain tools backed by a shared action catalog**, with cross-domain verbs for operations that genuinely share semantics. Generate admin-route and chat bindings from that catalog.
- **Do not replace everything immediately.** The current discovery path already loads schemas on demand; fewer registered tools alone does not establish lower token cost or better model performance.
- Keep the 31 proposed gap tools on hold as *new narrow registrations*, while verifying and implementing genuinely missing capabilities through the shared contracts.

**Evidence baseline.** I counted **316 route records: 234 covered, 36 gaps, 46 chatless** in the [parity file](/Users/la/Programming/Tovu/development/parity/route-tool-parity.json:2). A read-only catalog build using the [existing eval fixture](/Users/la/Programming/Tovu/development/evals/tool-search-eval-registry.ts:102) produced **252 registrations and 28 `content_read` cards**. That excludes separately registered installed-plugin tools, so it does not verify the reported 268; [production composition explicitly distinguishes those registrations](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/tool-catalog-manifest.ts:312).

**2. Option analysis**

**A. One general tool per domain**

Example: `content({action, input})`, `media({action, input})`, `deploy({action, input})`.

**What collapses:** registrations, descriptions, schema assembly, and transport adapters for related actions. Content already shares posts/pages through `kind`; separate create/update operations use the same command gateway and feature functions as HTTP routes. [Content contracts](/Users/la/Programming/Tovu/apps/website/src/features/post/agent-tools.ts:79)

**What stays:** separate action implementations and contracts. Reading content, editing HTML regions, scheduling publication, and performing deployment are different operations even if grouped under one domain. Pages’ HTML actions also have their own permission and structural inputs. [HTML authoring contracts](/Users/la/Programming/Tovu/apps/website/src/features/pages/agent-tools.ts:140)

**Schema precision:**

- A discriminated union gives each `action` its own required fields and rejects fields belonging to another action. This should reduce ambiguous arguments; actual model improvement remains unmeasured.
- Fetching the selected action’s schema avoids loading the whole domain, but adds discovery latency and requires action-aware describe support.
- Flat optional arguments weaken the published contract: requiredness becomes prose, contradictory combinations become representable, and argument mistakes emerge later.

**Permission/risk:** must resolve per action. A domain-wide permission would either overgrant or overrestrict. Mixed read/write domains also require changing the existing read-only gate, discussed below.

**Retrieval/token cost:** a single long domain description can dilute action-specific BM25 relevance. Describing the domain may load more schema than describing one narrow tool. Retain searchable action entries even when execution uses one domain tool.

**Audit/evals/migration:** log the selected action, evaluate action selection and arguments, and migrate one domain at a time. Cost is **moderate**, plus shared executor work; wrapping existing handlers first preserves behavior.

**Verdict:** useful selectively; “exactly one tool per domain” should be a preference, not an invariant.

**B. Cross-domain `list/get/create/update/delete({type,…})`**

This is strongest for uniform resource operations.

The shipped precedents need a distinction:

- `trash_item` genuinely dispatches across types. It preserves bespoke deletion handlers and uses the shared `moveToTrash` function for registry-backed kinds. Those paths preserve revisions, hooks, permissions, and version checks. [Delegation rationale](/Users/la/Programming/Tovu/apps/website/src/features/trash/trash-item-tool.ts:11), [generic path](/Users/la/Programming/Tovu/apps/website/src/features/trash/trash-item-tool.ts:338)
- `content_read` uses shared dispatch machinery but keeps **resource-specific tool IDs**, rather than exposing one unrestricted cross-resource tool. [Implementation](/Users/la/Programming/Tovu/apps/website/src/assistant/content-read-tool.ts:6)

**What collapses:** repetitive list/get, reversible trash, restore, and similar resource adapters.

**What stays:** deploy, publish, import subscribers, rotate credentials, assign permissions, and edit page regions. Calling these “update” obscures meaningful intent.

**Schema precision:** discriminate by **verb and type**, or fetch that combination’s schema. A global union grows quickly; `fields:{…}` without a type-specific contract is too weak. Existing `content_read` merges just get/list schemas and makes ID presence the dispatch signal—a limited convenience, not evidence that arbitrary writes should share optional fields. [Schema merge](/Users/la/Programming/Tovu/apps/website/src/assistant/content-read-tool.ts:370)

**Permission/risk:** resolve against the registered operation and actual resource. Trash already demonstrates why permissions differ by operation: restoring a comment and trashing it use different grants. [Permission distinction](/Users/la/Programming/Tovu/apps/website/src/features/trash/trash-item-tool.ts:18)

**Retrieval/token cost:** IDs such as `get` lose resource nouns that the current index weights heavily. Type-specific searchable entries remain valuable; global schemas can outweigh savings from fewer IDs.

**Audit/evals/migration:** record verb, type, and resource; test wrong-type IDs and retained hooks. Cost is **low for established uniform verbs, high for universal CRUD**.

**Verdict:** extend the successful resource operations; do not make CRUD the language for every capability.

**C. Route-derived catalog with one guarded `admin_action` tool**

**What collapses:** duplicate route/tool declarations, with parity enforced whenever a route declares a shared schema, policy, and handler.

**What stays:** action-specific contracts, transport exceptions, feature functions, and assistant-only capabilities. Content search already exists without a matching admin search screen. [Search capability](/Users/la/Programming/Tovu/apps/website/src/features/post/agent-tools.ts:68)

**Main limitation:** routes are currently imperative Express handlers, not complete declarative action definitions. Post update performs body coercion, ID/slug resolution, authorization through the command gateway, and HTTP-specific error mapping. A route scanner cannot reconstruct a reliable tool contract from that. [Route implementation](/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/posts/update.ts:33)

Use a declared action ID—not arbitrary method/path/body execution. Preserve explicit exclusions: login, streaming transports, and secret-returning routes should not become ordinary model tools. [Existing exclusions](/Users/la/Programming/Tovu/development/parity/route-tool-parity.json:4)

**Schema precision:** one fetched schema per action is precise and economical. A union of every admin action would be unwieldy; an untyped body would surrender precision.

**Permission/risk:** belongs in the declared action and shared feature boundary. Route session middleware cannot simply be reused as assistant authorization.

**Retrieval/token cost:** `admin_action` itself has little searchable meaning. Search must retrieve action records; selected-schema loading saves context but adds round trips.

**Audit/evals/migration:** log stable action IDs and schema versions; test route/chat equivalence and exclusions. Cost is **highest initially**, because route contracts need conversion.

**Verdict:** good destination for parity, poor shortcut through the existing routes.

**D. Recommended hybrid**

Define each action once, inside its owning feature or package. Derive:

1. The admin route binding.
2. The domain tool’s schema and dispatch.
3. Searchable action descriptions.
4. Permission/risk metadata and audit identity.

Keep existing generic trash/read machinery where appropriate. Retain focused category tools when their arguments or output are unusually specialized.

This reduces maintenance without requiring either universal CRUD or immediate conversion of every route. It builds on the existing domain contribution model. [Composition](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/tool-catalog-manifest.ts:332)

**3. Recommended shape**

Illustrative domain tool, generated from existing contracts:

```ts
// Proposed helper; action inputs reuse the published schemas.
function branch(action, inputSchema) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["action", "input"],
    properties: {
      action: { const: action },
      input: inputSchema
    }
  };
}

const contentSchema = {
  type: "object",
  oneOf: [
    branch("read", schemaOf("content_read.content_post")),
    branch("update", schemaOf("content_post_update")),
    branch("trash", schemaOf("content_post_delete"))
  ]
};

// Example call:
{
  action: "update",
  input: {
    kind: "post",
    id: "post-123",
    title: "New title",
    expectedVersion: 7
  }
}
```

The schema generator must preserve/rebase `$defs` and references. Runtime validation remains mandatory: Jini’s descriptor schema is currently descriptive, not automatically enforced by the kernel. [Descriptor contract](/Users/la/Programming/Jini/packages/core/src/tool-registry.ts:39)

Each action has server-owned metadata:

| Action | Permission | Side effects | Permanent deletion | Confirmation |
|---|---|---|---|---|
| `content.read` | `content.read` | `none` | false | none |
| `content.update` | `content.write` | `mutates-durable-state` | false | none |
| `content.trash` | `content.write` | `deletes-durable-state` | false | none |
| shared `trash.purge` | resolve from stored item and policy | current purge classification | true | human card |

The content permissions are already declared in the [current catalog](/Users/la/Programming/Tovu/apps/website/src/features/post/agent-tools.ts:846). **Permanent deletion must be an independent property:** current permanent-delete tools are classified `mutates-durable-state`, while reversible trash can be `deletes-durable-state`. [Permanent-delete classifications](/Users/la/Programming/Tovu/apps/website/src/features/permanent-delete/tool-registrations.ts:41)

**Does the existing executor support this? Partly.**

Authorization policies receive input, but existing domain registrations deliberately use pass-through policies; the real permission gate sits in a feature function, command gateway, or handler. Preserve that shared enforcement boundary. [Registration behavior](/Users/la/Programming/Jini/packages/core/src/registration-kit.ts:420)

Read-only classification is currently static per descriptor. A mixed domain tool marked read-only would admit writes; marking it writable would block its reads through read-only gateways. Resolve and validate the action **before** checking its effective risk, across every dispatch surface. Retain the independent classification cross-check, now keyed by action. [Read-only determination](/Users/la/Programming/Jini/packages/core/src/tool-registry.ts:78), [classification check](/Users/la/Programming/Jini/packages/core/src/registration-kit.ts:381)

The executor’s built-in confirmation flag is also static. Tovu already implements permanent-delete cards inside handlers, using **authorize → prepare exact targets → card → reauthorize → execute**. Reuse that mechanism per permanent-delete action; never accept model-supplied confirmation. [Current implementation](/Users/la/Programming/Tovu/apps/website/src/features/permanent-delete/tool-registrations.ts:63)

**Search:** retain action-level documents mapping to `{domainTool, action}`. Current FTS5 searches ID/description, uses BM25 with ID weighted 6×, and has no stemming. Preserve everyday synonyms, singulars, plurals, and action nouns. [Ranking implementation](/Users/la/Programming/Jini/packages/registry/src/tool-catalog/sqlite.ts:117), [vocabulary policy](/Users/la/Programming/Tovu/apps/website/src/assistant/tool-search-keywords.ts:49)

**Tokens:** keep short domain summaries and fetch precise action schemas through the existing discovery flow. This is domain execution consolidation, not another proposal for the three meta tools. Search already omits schemas to protect context. [Search contract](/Users/la/Programming/Jini/packages/registry/src/tool-catalog/sqlite.ts:108)

**Audit:** for every option, record stable action ID, domain/type, schema version, resolved risk, actor, resource, outcome, and correlation ID. The durable audit currently records tool ID and input **keys**, so consolidating IDs would hide which action ran unless extended. Preserve its value-free treatment of secrets and content. [Audit implementation](/Users/la/Programming/Tovu/apps/website/src/assistant/tool-executor-audit.ts:159)

**4. The 31 held gap tools**

Treat them as **31 capability candidates**, not 31 inevitable new tools.

First reconcile stale evidence. The eval fixture omits the trash registry; adding it changed the accepted enum from six kinds to eleven, including forms, submissions, menus, terms, and taxonomies. The dispatcher explicitly tolerates a missing registry by excluding generic kinds. [Fixture](/Users/la/Programming/Tovu/development/evals/tool-search-eval-registry.ts:49), [dispatcher](/Users/la/Programming/Tovu/apps/website/src/features/trash/trash-item-tool.ts:444)

The [gap inventory](/Users/la/Programming/Tovu/development/assistant-prompts/capability-prompts.md:369) also contains capabilities now present in source. Do not implement duplicates.

For genuine gaps, add shared action definitions and thin domain bindings. Keep deliberate chatless exclusions explicit. Secret-entry forms collect credentials privately; they need not introduce approval cards for non-delete operations.

**5. Phased migration**

1. **Establish the contract and baseline.** Record the ADR, action metadata, validation rules, and acceptance tests before implementation, following the [workspace delivery constraints](/Users/la/Programming/Tovu/ADS-memory/docs/architecture/sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md:9). Correct fixture completeness and gap records.
2. **Prototype a small content slice:** existing read, search, update, and reversible trash. Wrap existing handlers; preserve version conflicts, revisions, hooks, and events. Make the admin and chat adapters converge on the same action function.
3. **Compare existing narrow tools against the domain tool** on:
   - Held-out action retrieval and selection.
   - First-call argument validity and repair attempts.
   - Verified resulting state.
   - Wrong-kind IDs, denied permissions, read-only writes, and version conflicts.
   - Total tokens, tool round trips, latency, and maintenance work.
4. **Add one permanent-delete path** using the existing prepared-target card mechanism; test cancellation, changed targets, and permission revocation.
5. **Expand only where results justify it.** Keep compatibility aliases temporarily, generated from the same contracts. Convert routes gradually and enforce action coverage/exclusions in CI.

Existing parent-tool evals measure retrieval; their synthetic cards even use placeholder schemas, so they do not prove argument correctness or successful task execution. [Eval construction](/Users/la/Programming/Tovu/development/evals/tool-search-parent-tool-read.eval.ts:435)

**6. Questions for the owner**

- Is the main priority less maintenance, fewer tool names, or faster/cheaper chat?
- Should ordinary posts and page records share one content tool, with HTML authoring separate?
- Which everyday tasks must the prototype demonstrate before broader migration?
- Which chat/model modes should determine the performance comparison?

**7. What belongs in Jini**

Build the reusable machinery in Jini first:

- **`@jini-ai/core` / `registry`:** action contracts, contribution registry, schema generation, classification checks, searchable action records.
- **`@jini-ai/daemon`:** action resolution before execution gates, effective read-only policy, audit correlation.
- **`@jini-ai/http-kit` / `mcp`:** generated route/domain-tool bindings and action-specific describe support.
- **`@jini-ai/ui`:** reusable human confirmation transport.
- Existing domain packages, including **CMS and user management**, own reusable feature contracts.

Tovu keeps CMS-specific composition, routing, resource adapters, and vocabulary. Inject validators, permission evaluators, audit sinks, and adapters as ports; public factories/functions use `(requiredArgs, optionalArgs)`.

Keep vendor implementations in self-contained agent plugins and expose category actions. Deployment already demonstrates category tools with a platform argument and trusted plugin-loaded adapters. [Category catalog](/Users/la/Programming/Tovu/apps/website/src/features/deployments/deploy-ops/agent-tools.ts:20), [plugin loader](/Users/la/Programming/Tovu/apps/website/src/features/deployments/deploy-ops/registry.ts:39)