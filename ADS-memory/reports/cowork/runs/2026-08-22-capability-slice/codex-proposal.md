I’ll first load the repository’s governing instructions, then inspect the approved source and its immediate contracts read-only. I’ll keep the design strictly to the capability-source/catalog/tool slice.

Codex(Cowork): The governing file is loaded. Because this is a `<<PEER_DISPATCH>>`, its startup procedure is intentionally skipped; its evidence and response-label rules still apply. I’m now checking the mandatory architecture sections, Tovu memory/module map, and the exact source contracts that determine workspace scoping and tool registration.

Codex(Cowork):

## Cowork Scope Check

This is a read-only co-design for exactly:

- A generic capability-source registry.
- One source adapter exposing installed Agent Plugin skills.
- One disposable, workspace-scoped FTS5/BM25 catalog.
- Two executable agent tools: `capability_search` and `capability_get`.
- Composition-root registration in `src/server/tool-catalog-manifest.ts`.
- The three approved test modules.

I did not edit, create, delete, run tests, start services, or invoke Git.

Files actually inspected:

- `AI-Dev-Shop/AGENTS.md`
- `src/assistant/tool-contribution-registry.ts`
- `src/assistant/tool-catalog-query.ts`
- `src/assistant/tool-registrations.ts`
- `src/assistant/__tests__/tool-catalog-query.test.ts`
- `src/assistant/__tests__/tool-contribution-registry.test.ts`
- `src/features/agent-plugins/install.ts`
- `src/features/agent-plugins/layout.ts`
- `src/features/agent-plugins/package-paths.ts`
- `src/features/agent-plugins/capability-projection.ts`
- `src/features/agent-plugins/resolve-agent-plugin-refs.ts`
- `src/features/agent-plugins/__tests__/unit/capability-projection.unit.test.ts`
- `src/features/source-control/tool-registrations.ts`
- `src/features/plugin-runtime/tool-registrations.ts`
- `src/server/tool-catalog-manifest.ts`
- `../Jini/packages/core/src/tool-registry.ts`
- `../Jini/packages/sqlite/src/db/tool-catalog/tool-catalog.ts`

The repository instructions require `tovu-architecture.md` sections 13–14, `tovu/PROJECT_MEMORY.md`, and `tovu/src/INFO.md`, but none of those paths exists in this checkout. That is the only material evidence gap. The packet’s settled constraints are sufficiently explicit to design the slice, but implementation should confirm whether those documents moved before proceeding.

The configured codebase-memory graph tools were unavailable, so I used direct, targeted reads as the documented fallback.

## Design

### 1. Generic seam: `capability-source-registry.ts`

The core contract should contain metadata cards and source operations, with no feature-specific union:

```ts
export interface CapabilityScope {
  readonly workspaceId: string;
}

export interface CapabilityCard {
  readonly id: string;
  readonly source: string;
  readonly kind: string;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly revision?: string;
}

export interface CapabilityDetail extends CapabilityCard {
  readonly content: {
    readonly mediaType: string;
    readonly text: string;
  };
}

export interface CapabilitySource {
  readonly id: string;
  list(scope: CapabilityScope): Promise<readonly CapabilityCard[]>;
  get(scope: CapabilityScope, capabilityId: string): Promise<CapabilityDetail | null>;
}
```

Registry API:

- `registerCapabilitySource(source)`
- `listCapabilitySources()`
- `resetCapabilitySourcesForTests()`

It should clone `tool-contribution-registry.ts` semantics:

- Module-level ordered list.
- Duplicate `source.id` replaces in place.
- Registration order remains deterministic.
- No import-time registration.
- No switch on `kind`.
- No source-specific lookup logic in assistant core.

This preserves the acceptance property: a future source requires its adapter file and one composition-root registration call only.

`CapabilityDetail.content` is intentionally generic. Core knows that content has a media type and text; it does not know what a skill, prompt, template, or future capability kind means.

### 2. Agent Plugin adapter: `features/agent-plugins/capability-source.ts`

Expose an explicit installer such as:

```ts
export function contributeInstalledAgentPluginSkillCapabilitySource(): void
```

That function registers one source with ID such as `installed-agent-plugin-skills`.

For every request, the adapter must:

1. Resolve the instance layout.
2. Call `layout.forWorkspace(scope.workspaceId)` itself.
3. Enumerate only that workspace’s `packages/sha256/*`.
4. Accept only 64-character lowercase SHA-256 directory names.
5. Reconstruct each package through `indexInstalledRoot()`.
6. Emit every discovered `installed.skills` entry, not merely the eponymous skill.

This handles the three source facts:

- Multiple digests for one `pluginId` remain separate.
- Non-eponymous skills are catalogued.
- A seven-skill package produces seven cards.

The ID must include the digest:

```text
agent-plugin:<pluginId>:<archiveDigest>:skill:<skillName>
```

The existing projection’s digest-free ID at `capability-projection.ts:106` collides when two installed digests contain the same plugin and skill. It is unsuitable as the catalog’s primary key.

Suggested card mapping:

- `source`: `installed-agent-plugin-skills`
- `kind`: `agent-plugin-skill`
- `label`: humanized skill name
- `description`: identify the skill and owning plugin without reading its markdown
- `keywords`: `skill`, plugin ID, skill name, optional version
- `revision`: archive digest

`list()` should not read `SKILL.md`. Search must remain metadata-only and cheap.

`get()` should:

- Re-enumerate within the supplied workspace.
- Resolve the exact digest/plugin/skill card.
- Read only the indexed `skill.skillPath`.
- Call the existing `readInstalledSkillMarkdown()` or directly compose `assertContainedOnDisk()` with `readFile`.
- Return authored markdown as `{ mediaType: "text/markdown", text }`.
- Never expose `packageRoot`, an absolute path, sibling-file inventory, an execution binding, or an activation result.

A malformed/unindexable digest directory should be skipped during listing, matching `resolve-agent-plugin-refs.ts:100–119`. A card found during listing but unreadable during `get()` should fail with a stable, sanitized source error that names the capability ID, not the filesystem path.

There must be no use of `projectInstalledAgentPluginCapabilities()`: it eagerly reads markdown and carries the dead `execute` union. This source needs metadata during discovery and content only during get.

### 3. Catalog: `capability-catalog-query.ts`

Build a new local in-memory SQLite projection modeled on Jini’s tool catalog, because the existing helper cannot apply `kind` in SQL before BM25 ranking.

Recommended asynchronous API:

```ts
export async function buildCapabilityCatalogQuery(
  scope: CapabilityScope,
  sources: readonly CapabilitySource[] = listCapabilitySources(),
): Promise<CapabilityCatalogQuery>
```

Each build should first call every registered source’s `list(scope)`. Thus the only cards entering SQLite already belong to the requested workspace. Other tenants’ rows never reach the index.

The single canonical table should include:

- `id`
- `source`
- `kind`
- `label`
- `description`
- `keywords`
- `revision`
- `updated_at`

The external-content FTS5 table should index:

- `id`
- `label`
- `description`
- `keywords`

Search SQL should apply an optional kind predicate in the same candidate query:

```sql
WHERE capability_catalog_fts MATCH ?
  AND (? IS NULL OR cc.kind = ?)
ORDER BY bm25(...)
LIMIT ?
```

This matters in two ways:

- Workspace filtering happens before indexing and therefore before ranking.
- Kind/lane filtering happens in SQL before `ORDER BY bm25` and `LIMIT`, never by trimming an already-ranked result set.

The query tokenizer should clone Jini’s safe alphanumeric-token behavior so user input cannot inject FTS5 operators.

The returned query surface should be approximately:

```ts
search(query: string, options?: {
  readonly kind?: string;
  readonly limit?: number;
}): readonly CapabilitySearchHit[];

getCard(id: string): CapabilityCard | null;
get(id: string): Promise<CapabilityDetail | null>;
```

`get(id)` should use the indexed card’s `source`, find that registered source by ID, and delegate to `source.get(scope, id)`. It must additionally verify that a non-null detail has the same `id`, `source`, `kind`, and revision as the indexed card. A buggy adapter must not substitute different content after lookup.

Duplicate capability IDs across registered sources should fail catalog construction with exact text, for example:

```text
capability-catalog-query.ts: capability id '<id>' is declared by both '<first>' and '<second>'
```

Do not use last-source-wins for cards. Replacement is appropriate for duplicate source registration, but ambiguous globally-addressed capability IDs are a correctness and security defect.

Building this projection lazily per invocation is safer than a boot-only snapshot: Agent Plugin installation can change after daemon startup. If performance later warrants caching, cache by workspace and invalidate explicitly; do not introduce persistent state in this slice.

### 4. Agent tools: `capability-tool-registrations.ts`

This module should remain entirely generic and import no feature adapter.

It should export:

- `buildCapabilityToolRegistrations(deps)`
- risk metadata marking both tools `"none"`
- `contributeCapabilityTools()` to register the pair through `registerToolContributor`

The narrow dependency shape only needs fields already available structurally:

```ts
interface CapabilityToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
}
```

Both handlers should require `admin.plugins.read`, matching the existing plugin catalog at `features/plugin-runtime/tool-registrations.ts:83`. A new permission is outside this slice and would create unreviewed policy semantics.

Tool contracts:

`capability_search`

```json
{
  "query": "design accessibility",
  "kind": "agent-plugin-skill",
  "limit": 10
}
```

- `query`: required non-empty string.
- `kind`: optional non-empty string, not an enum. Kinds are registered data.
- `limit`: optional bounded integer, e.g. 1–25.
- Result: compact cards with ID, source, kind, label, description, revision, and score.
- Never includes skill markdown.

`capability_get`

```json
{
  "id": "agent-plugin:ui-ux-design:<digest>:skill:accessibility"
}
```

- Exact ID only.
- Returns the card plus its text content.
- Unknown ID should return a structured `{ found: false, id }`, rather than making absence an exception.
- Adapter failures after a known card is selected should throw a stable sanitized error.
- It does not invoke, inject, pin, execute, or activate anything.

Both registrations need real handlers and ordinary policies because they are genuine tools. Capability cards themselves must never be inserted into `ToolRegistry`.

### 5. Composition root

`installFirstPartyToolContributors()` should explicitly call:

```ts
contributeCapabilityTools();
contributeInstalledAgentPluginSkillCapabilitySource();
```

The exact order should be documented and tested. I recommend registering the source before the generic tools for conceptual clarity, although handlers resolve sources at invocation time, not during registration building.

This yields:

```text
server manifest
  ├─> Agent Plugin adapter -> capability-source registry
  └─> generic capability tools -> real ToolRegistry
                                -> runtime catalog over registered sources
```

No `assistant/**` file imports `features/agent-plugins/**`.

## Defects and traps you predict

1. **Digest-free IDs collide.**  
   `capability-projection.ts:106` uses plugin ID and skill name only. Two installed versions will generate the same ID and cannot coexist in SQLite.

2. **The existing resolver deliberately handles only the eponymous skill.**  
   `resolve-agent-plugin-refs.ts:153` hardcodes `skills/${pluginRefId}/SKILL.md`. Reusing it would silently omit six skills from the real seven-skill package.

3. **Installed-package enumeration is private and will otherwise be duplicated.**  
   `resolve-agent-plugin-refs.ts:100` contains a private `listInstalledPlugins()`. The approved edit scope forbids extracting it. The new adapter must carefully mirror digest validation, ENOENT behavior, and invalid-package skipping using exported `indexInstalledRoot()`. This is constrained duplication worth naming in the header.

4. **Filtering ordinary search results afterward leaks and underfills.**  
   Jini’s `searchToolCatalog()` applies only FTS match and limit (`tool-catalog.ts:127–143`). Calling it with limit 10 and then filtering `kind` can return fewer results and reveals foreign-lane competition. A local SQL query is required.

5. **A process-global catalog is a tenant leak.**  
   Source registration may be global; source results and catalog instances must not be. Never store cards from multiple workspaces in the module registry.

6. **Boot-only seeding becomes stale after installation.**  
   Unlike static tool registrations, installed packages are mutable runtime state. Seed on invocation or implement explicit invalidation; silent boot snapshots will miss newly installed skills.

7. **Reading markdown during search wastes I/O and increases exposure.**  
   The current projection eagerly reads markdown. The new adapter must split metadata listing from content retrieval.

8. **Absolute-path leakage.**  
   `InstalledAgentPlugin.packageRoot` is absolute. Neither search nor get results should return it, and filesystem errors should not leak it.

9. **Source/detail substitution.**  
   A generic adapter could return a different detail than the selected card. Core should verify identity/source/kind/revision consistency.

10. **Kind accidentally becomes a closed union.**  
    Copying `AgentPluginCapabilityKind` into assistant core or using a JSON Schema enum would violate the settled “kind is data” rule.

11. **Capability cards placed in `ToolRegistry` with fake handlers.**  
    `ToolRegistration.handler` is required at `Jini/packages/core/src/tool-registry.ts:142–146`. Fake handlers would misrepresent activation and violate the descriptor-only projection requirement.

12. **Contributor risk metadata omission.**  
    The generic tool contributor must declare both tool IDs as `"none"` or `assertRiskMetadataIsWirable` will reject the assembled surface.

13. **Current test-file allocation omits a dedicated registration test file.**  
    The approved test scope names only registry, catalog, and adapter tests. Tool schemas, authorization, handler outputs, and risk wiring still need tests; place those cases in `capability-catalog-query.test.ts` or `capability-source-registry.test.ts` rather than expanding file scope.

## Test plan

Every listed implementation test must be added and run against missing/incomplete production code first. Record the command and expected failure before implementation, using only:

```text
node --import tsx --test <specific-file>
```

### `capability-source-registry.test.ts`

First red run should prove the module/API is missing.

Then assert:

- Reset produces exactly `[]`.
- Registration preserves call order.
- Registering the same source ID replaces in place.
- Replacement does not reorder sources.
- Reset removes all prior process-global state.
- Two differently named kinds require no core changes.
- Duplicate card IDs from two sources throw the exact catalog error.
- `installFirstPartyToolContributors()` installs the generic tool contributor and Agent Plugin source exactly once.
- Assistant source files contain no feature-named runtime import if the repository’s existing architecture-test idiom supports a source inspection here.
- Registration/tool contributor risk metadata covers exactly `capability_search` and `capability_get`.

### `capability-catalog-query.test.ts`

First red run should fail because the query builder does not exist.

Then assert:

- Search finds terms in ID, label, description, and keywords.
- More relevant cards rank first.
- Empty/no-token query returns `[]`.
- Limit is honored.
- Empty source registry is non-throwing.
- Search results omit content.
- `getCard` returns metadata only.
- `get` delegates to the owning source and returns text.
- Unknown ID returns `null` at query level.
- A source returning mismatched ID/source/kind/revision throws exact text.
- Invalid limit, empty query input, empty kind, and malformed get ID throw exact validation messages.
- Kind filtering occurs before limit/ranking: create a higher-ranked wrong-kind card plus enough matching-kind cards and prove the requested limit is fully populated.
- Workspace filtering occurs before ranking: use a source double that records the requested workspace and returns disjoint cards for A and B; prove catalog A cannot search or get B’s IDs.
- No result count or hit changes when a different workspace has additional high-scoring cards.
- One source may emit arbitrary future kinds without core changes.
- Tool handlers enforce `admin.plugins.read`.
- `capability_search` returns compact hits.
- `capability_get` returns `{ found: false }` for absence and content for an exact hit.
- Neither tool exposes or performs activation.

### `capability-source.unit.test.ts`

First red run should fail because the adapter module does not exist.

Use temporary workspace layouts and real package fixtures. Assert:

- Missing workspace package directory lists `[]`.
- A one-skill package produces the exact card.
- A seven-skill package produces all seven cards.
- Non-eponymous skill folders are included.
- Two digests with the same plugin ID and skill generate two distinct IDs.
- IDs include the exact digest.
- Non-digest directories are ignored.
- Invalid/unindexable digest directories do not suppress valid siblings.
- `list()` does not read skill markdown.
- `get()` returns exact authored markdown for an exact card.
- `get()` invokes the containment-protected reader.
- A traversal-shaped skill path is rejected with exact `PackagePathViolation` text.
- `get()` cannot retrieve a card belonging to another workspace.
- Unknown digest/plugin/skill returns `null`.
- Search/get results never contain `packageRoot`, absolute paths, `preview`, or `execute`.
- Registering the adapter twice replaces the same source rather than duplicating it.

TDD sequencing should be per behavior cluster, not one ceremonial failure for the entire module: registry tests red before registry implementation, catalog tests red before catalog implementation, adapter tests red before adapter implementation, and tool-handler tests red before handler wiring.

## Blind spots the other participants will likely miss

- “Workspace before ranking” is most robustly satisfied by constructing the entire disposable index from one workspace, not by adding a workspace SQL predicate to a multi-tenant table.
- The catalog ID needs the digest even if the user-facing label does not. There is currently no activation record selecting one digest.
- The adapter must enumerate `installed.skills`, not derive `skills/<pluginId>/SKILL.md`.
- Search should not read markdown; otherwise every discovery call becomes a multi-file content read.
- A source replacement rule and a capability-card collision rule should differ: replace duplicate source IDs, reject duplicate capability IDs.
- Optional `kind` must remain an unrestricted string in both TypeScript and JSON Schema.
- Catalog freshness differs from the existing static tool catalog. Installed capabilities can change while the daemon remains alive.
- `capability_get` is retrieval, not activation. Returning an existing `execute: context-injection` union would blur the settled boundary.
- The approved tests must still cover real tool registration despite lacking a fourth dedicated test file.

## Strengths to preserve

- `ToolRegistration.handler` remains mandatory and unchanged.
- `ToolDescriptor` remains handler/policy-free metadata.
- The real `ToolRegistry` contains only executable tools.
- FTS5/BM25 remains the discovery backend.
- SQLite remains `:memory:` and disposable.
- Agent Plugin package reads continue through the existing filesystem containment primitive.
- Workspace layout continues to be derived atomically from instance layout plus authenticated `workspaceId`.
- Invalid installed digest directories remain isolated failures rather than breaking all valid packages.
- Explicit composition-root registration replaces import side effects.
- Registry replacement is idempotent and order-preserving.
- Assistant core never imports a feature module by name.
- No `capability_invoke` exists now or later.
- Existing activation gates and composer behavior remain untouched.

## Risk tier recommendation

**Medium.**

The implementation is mechanically small, but tenant scoping, digest ambiguity, filesystem containment, stale runtime discovery, and the discovery-versus-activation boundary create meaningful security and correctness risk. The verifier floor of 8.5 is appropriate; approval should require explicit tests proving pre-ranking workspace isolation and two-digest identity behavior.

<<COWORK_END>>