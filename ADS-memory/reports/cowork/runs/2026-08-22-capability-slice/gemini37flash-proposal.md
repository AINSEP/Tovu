## Cowork Scope Check

### Task Understanding
The objective of this slice is to build the discovery and retrieval tool-side capability seam for Tovu:
1. **Generic Capability Source Seam** (`src/assistant/capability-source-registry.ts`): In-module registry pattern modeled directly on `tool-contribution-registry.ts`.
2. **First-Party Capability Source** (`src/features/agent-plugins/capability-source.ts`): Adapts installed Agent Plugin skills into capability descriptors without hardcoding eponymous-skill assumptions and with lazy disk reading.
3. **Searchable Capability Catalog Query** (`src/assistant/capability-catalog-query.ts`): In-memory SQLite FTS5 + BM25 catalog with mandatory **pre-ranking workspace isolation** and `kind` filtering.
4. **Agent-Facing Tools** (`src/assistant/capability-tool-registrations.ts`): Real `ToolRegistration`s for `capability_search` and `capability_get` wired into the standard `ToolRegistry`.
5. **Composition Root Wiring** (`src/server/tool-catalog-manifest.ts`): Boot-time registration of the Agent Plugin capability source.
6. **Test Suites**: TDD-proven unit and integration tests across the new modules.

### Scope Boundaries & Exclusions (Deliberately Omitted)
- **NO** composer chip / prompt-pointer changes (`slots.ts` / `composer-discovery.ts`).
- **NO** `capability_invoke` (settled consensus: discovery unifies; activation stays on each domain's existing execution gate).
- **NO** fake handlers in `ToolRegistry` for individual capabilities (`ToolRegistration.handler` remains strictly non-optional; capabilities live in the capability catalog projection).
- **NO** persistent datastore or database migrations (the catalog is a disposable `:memory:` SQLite projection).
- **NO** UI or `check:architecture` rule modifications.

### Verified Files & Local Context
- `src/assistant/tool-contribution-registry.ts` (registry seam pattern, idempotent replacement, module-level state).
- `src/assistant/tool-catalog-query.ts` (FTS5 + BM25 SQLite `:memory:` projection, keyword expansion & stripping).
- `src/features/agent-plugins/capability-projection.ts` (existing candidate descriptor, `readInstalledSkillMarkdown`, `assertContainedOnDisk`).
- `src/server/tool-catalog-manifest.ts` (boot composition root).
- `src/features/agent-plugins/install.ts` (`InstalledAgentPlugin`, multi-digest walking, security invariant).

---

## Design

### 1. Architectural Model & Data Flow

```
+-------------------------------------------------------------------------------+
| Feature Layer (e.g. src/features/agent-plugins/)                              |
|                                                                               |
|  InstalledAgentPlugin                                                         |
|  (skills: name, skillPath)                                                    |
|           |                                                                   |
|           v                                                                   |
|  agentPluginCapabilitySource (implements CapabilitySource)                    |
|    - listCapabilities(ctx) -> CapabilityDescriptor[] (metadata only)          |
|    - getCapability(id, ctx) -> reads markdown via assertContainedOnDisk       |
+-----------|-------------------------------------------------------------------+
            | calls registerCapabilitySource() at boot
            v
+-------------------------------------------------------------------------------+
| Assistant Domain (src/assistant/)                                             |
|                                                                               |
|  capability-source-registry.ts                                                |
|    - sources: CapabilitySource[]                                              |
|    - registerCapabilitySource / listCapabilitySources / resetForTests         |
|           |                                                                   |
|           v                                                                   |
|  capability-catalog-query.ts (reseeded / built from registered sources)       |
|    - in-memory SQLite FTS5 (capabilities + capabilities_fts)                  |
|    - search(query, { workspaceId, kind, limit }) -> WHERE pre-filter + BM25   |
|    - get(id, { workspaceId }) -> delegates to source.getCapability            |
|           ^                                                                   |
|           | queries                                                           |
|  capability-tool-registrations.ts                                             |
|    - capability_search (real ToolRegistration with handler)                   |
|    - capability_get    (real ToolRegistration with handler)                   |
+-------------------------------------------------------------------------------+
```

### 2. Module Responsibilities & Contracts

#### A. Generic Seam: `src/assistant/capability-source-registry.ts`
- **Role**: Pure in-module registry inside `assistant/`. Contains no runtime dependencies on feature modules.
- **Key Types**:
  ```ts
  export interface CapabilityContext {
    readonly workspaceId?: string;
  }

  export interface CapabilityDescriptor {
    readonly id: string;
    readonly kind: string;       // e.g. "agent-plugin-skill" — treated strictly as data
    readonly source: string;     // e.g. "agent-plugins"
    readonly label: string;
    readonly description: string;
    readonly keywords?: readonly string[];
    readonly workspaceId?: string; // null/undefined for global capabilities
    readonly metadata?: Readonly<Record<string, unknown>>;
  }

  export interface CapabilityContent {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly description: string;
    readonly format: "markdown" | "text" | "json";
    readonly content: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }

  export interface CapabilitySource {
    readonly id: string;
    readonly listCapabilities: (context: CapabilityContext) => Promise<readonly CapabilityDescriptor[]>;
    readonly getCapability: (id: string, context: CapabilityContext) => Promise<CapabilityContent | null>;
  }
  ```
- **Registry API**:
  - `registerCapabilitySource(source: CapabilitySource): void`: Replaces existing entry matching `source.id` in place (idempotent, registration-order preserving).
  - `listCapabilitySources(): readonly CapabilitySource[]`.
  - `resetCapabilitySourcesForTests(): void`.

#### B. First Source Adapter: `src/features/agent-plugins/capability-source.ts`
- **Role**: Feature-side adapter for Agent Plugins. Reaches into `src/assistant/capability-source-registry.js`.
- **Handling Multi-Skill & Multi-Digest Plugins**:
  - Does NOT assume eponymous skills (`skills/${pluginId}/SKILL.md`). Iterates over `plugin.skills: readonly InstalledAgentPluginSkill[]` to project every declared skill (e.g. all 7 skills in `ui-ux-design`).
  - Deduplicates installed plugins by `pluginId` for the target `workspaceId` so multiple historical archive digests under `packages/sha256/*` do not generate duplicate collision IDs.
  - Generates stable, namespaced IDs: `agent-plugin:${pluginId}:skill:${skill.name}`.
- **Lazy Content Retrieval**:
  - `listCapabilities`: Projects metadata ONLY (id, kind, label, description, keywords). Zero disk reads at index time.
  - `getCapability(id, ctx)`: Parses `pluginId` and `skill.name`, verifies workspace membership, looks up `packageRoot` and `skillPath`, and calls `assertContainedOnDisk(packageRoot, skillPath)` + `readFile(..., "utf8")`.

#### C. Searchable Projection: `src/assistant/capability-catalog-query.ts`
- **Role**: Disposable in-memory SQLite database providing FTS5 search and single-item retrieval.
- **Schema**:
  ```sql
  CREATE TABLE capabilities (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    source TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    workspace_id TEXT,
    keywords TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE capabilities_fts USING fts5(
    label,
    description,
    keywords,
    content=capabilities,
    content_rowid=rowid,
    tokenize='porter unicode61'
  );
  ```
- **Pre-Ranking Workspace & Kind Filtering**:
  ```sql
  SELECT
    c.id,
    c.kind,
    c.source,
    c.label,
    c.description,
    bm25(capabilities_fts) AS rank
  FROM capabilities c
  JOIN capabilities_fts f ON c.rowid = f.rowid
  WHERE (c.workspace_id = :workspaceId OR c.workspace_id IS NULL)
    AND (:kind IS NULL OR c.kind = :kind)
    AND capabilities_fts MATCH :query
  ORDER BY rank ASC
  LIMIT :limit;
  ```
  *(Applying the `workspace_id` predicate inside the SQL query ensures ranking and pagination operate solely on the permitted subset, completely preventing tenant leakage).*
- **Search vs Describe/Get**:
  - `search(query, options)`: Returns stripped descriptions (clean authored text without synthetic synonyms).
  - `get(id, options)`: First validates workspace access in the index/source, then delegates to `source.getCapability(id, context)`.

#### D. Agent-Facing Tools: `src/assistant/capability-tool-registrations.ts`
- **Role**: Exports `buildCapabilityToolRegistrations(catalogQuery)` returning `ToolRegistration[]`:
  1. `capability_search`:
     - Parameters: `query: string`, `kind?: string`, `limit?: number`.
     - Output: `readonly { id: string; kind: string; source: string; label: string; description: string }[]`.
  2. `capability_get`:
     - Parameters: `id: string`.
     - Output: `{ id: string; kind: string; label: string; description: string; format: string; content: string }`.
     - Error handling: Throws clear `CapabilityNotFoundError` if the ID is nonexistent or belongs to another workspace.

#### E. Composition Root: `src/server/tool-catalog-manifest.ts`
- Exports `contributeAgentPluginCapabilities()` which calls `registerCapabilitySource(...)`.
- Added to `installFirstPartyToolContributors()` or alongside daemon startup.

---

## Defects and Traps Predicted

1. **Multi-Digest Plugin Collision in `listInstalledPlugins`**
   - *Trap*: `listInstalledPlugins` scans every hash directory in `packages/sha256/*`. If a plugin was reinstalled or bumped, multiple instances of the same `pluginId` exist on disk.
   - *Failure*: Reseeding the catalog will attempt to insert duplicate primary keys (`agent-plugin:${pluginId}:skill:${skillName}`) into SQLite, throwing `SQLITE_CONSTRAINT_PRIMARYKEY` during boot.
   - *Prevention*: The source adapter must group installed plugins by `pluginId` and select the active/latest version before yielding descriptors.

2. **Epomymous Skill Assumption / Hardcoded Paths**
   - *Trap*: `resolve-agent-plugin-refs.ts:153` hardcodes `skills/${pluginRefId}/SKILL.md`.
   - *Failure*: Real multi-skill plugins like `ui-ux-design` have 7 skill subfolders. Hardcoding the eponymous path causes 6 skills to be missed and 1 to throw `ENOENT` if the directory structure uses nested skill names.
   - *Prevention*: The adapter must iterate over `InstalledAgentPlugin.skills` array directly and use `skill.skillPath` resolved through `assertContainedOnDisk`.

3. **Post-Ranking Filtering (Cross-Tenant Existence & Count Leak)**
   - *Trap*: Calling `searchToolCatalog(db, query, limit)` and filtering `hit.workspaceId === callerWorkspaceId` in JavaScript after BM25 ranking.
   - *Failure*: If Tenant A has 10 matching skills and Tenant B has 2, Tenant B's search with `limit=10` can return 0 results if Tenant A's items consumed all 10 slots before the JS filter ran.
   - *Prevention*: `WHERE (c.workspace_id = :workspaceId OR c.workspace_id IS NULL)` must be in the SQLite query before `ORDER BY rank LIMIT :limit`.

4. **Synchronous Full-Disk Read at Index Time**
   - *Trap*: Reading markdown files during `listCapabilities()` using `readSkillMarkdown` (as candidate `capability-projection.ts` did).
   - *Failure*: Reseeding the index on every boot will perform blocking disk I/O for hundreds of skill files.
   - *Prevention*: Indexing must only touch metadata. Markdown I/O must be deferred strictly to `getCapability(id)`.

5. **Import Boundary Violations (`assistant` -> `features`)**
   - *Trap*: Importing `src/features/agent-plugins/capability-source.ts` from `src/assistant/capability-source-registry.ts`.
   - *Failure*: Breaks the unidirectional dependency rule and causes `check:architecture` cycle failures.
   - *Prevention*: `assistant/` only defines and exports `registerCapabilitySource`. `features/agent-plugins/` imports `registerCapabilitySource` and registers itself.

6. **Dummy Handler Pollution in `ToolRegistry`**
   - *Trap*: Creating fake `ToolRegistration` entries for individual skills in `ToolRegistry` to make them discoverable.
   - *Failure*: `ToolRegistration.handler` is non-optional in `@jini-ai/core`. A fake handler bypasses execution validation.
   - *Prevention*: Skills exist solely in the `CapabilityCatalogQuery` projection; only `capability_search` and `capability_get` enter `ToolRegistry`.

---

## Test Plan

### TDD Requirements & Execution Strategy
- Run tests via `node --import tsx --test <path-to-test>`.
- Every test must be proven to fail first for the expected reason before writing implementation.
- All error assertions must verify exact error messages / classes.

### Test Suites to Implement

#### 1. `src/assistant/__tests__/capability-source-registry.test.ts`
- **Test 1: Registration and Listing**
  - Asserts `registerCapabilitySource` stores sources in registration order.
- **Test 2: Idempotent Replacement (Last-Registration-Wins)**
  - Register source with `id: "source-a"`, re-register updated `"source-a"`.
  - Asserts length is 1 and the newer instance replaced the older one in-place.
- **Test 3: Isolation with `resetCapabilitySourcesForTests`**
  - Asserts `resetCapabilitySourcesForTests()` restores an empty array.

#### 2. `src/assistant/__tests__/capability-catalog-query.test.ts`
- **Test 1: Pre-Ranking Workspace Isolation (Adversarial Security Test)**
  - Seed catalog with 10 skills for `workspace-1` and 2 skills for `workspace-2`, all matching query `"deploy"`.
  - Execute `search("deploy", { workspaceId: "workspace-2", limit: 5 })`.
  - *Must fail if post-filtered*: Asserts returned array contains exactly the 2 skills of `workspace-2`, never empty.
- **Test 2: Kind Filtering**
  - Query with `kind: "agent-plugin-skill"`. Asserts items of other kinds matching the query are excluded.
- **Test 3: Keyword Stripping**
  - Asserts returned `description` is clean authored text, while search successfully ranks on indexed synonyms.
- **Test 4: Capability Get Delegation & Not Found**
  - Asserts `get(id, { workspaceId })` retrieves full content for permitted tenant and throws exact `CapabilityNotFoundError: "Capability 'xyz' not found in workspace 'ws-2'"` for cross-tenant ID.

#### 3. `src/features/agent-plugins/__tests__/unit/capability-source.unit.test.ts`
- **Test 1: Multi-Skill Plugin Enumeration (e.g. `ui-ux-design`)**
  - Mock plugin with 7 skills in `skills` array.
  - Asserts `listCapabilities()` returns 7 distinct `CapabilityDescriptor` items with matching names and paths.
- **Test 2: Digest Deduplication**
  - Provide two `InstalledAgentPlugin` entries with same `pluginId` but different `archiveDigest`.
  - Asserts descriptors are emitted once per skill without ID collisions.
- **Test 3: Lazy Disk Read on `getCapability`**
  - Verify `listCapabilities` does not invoke `readFile`.
  - Verify `getCapability` calls `readInstalledSkillMarkdown` using `assertContainedOnDisk`.
- **Test 4: Path Traversal Defense**
  - Attempt `getCapability` with manipulated path escaping `packageRoot`.
  - Asserts exact thrown error `PackagePathViolation`.

---

## Blind Spots the Other Participants Will Likely Miss

1. **Eponymous Skill Bias**: Many implementations will copy the pattern from `resolve-agent-plugin-refs.ts:153` (`skills/${pluginId}/SKILL.md`) and assume one skill per plugin. This will immediately break on `ui-ux-design` and any multi-skill plugin.
2. **Digest Clones on Disk**: `listInstalledPlugins` returns every digest in `packages/sha256/*`. Without deduplication, SQLite will throw primary key collisions or search will return duplicate identical skills.
3. **BM25 Keyword Bleed**: If search keywords are appended to descriptions for FTS5 scoring and not stripped on output, the LLM will receive poisoned prompts containing raw synthetic search tokens.
4. **Tenant Starvation via Limit**: Filtering in JS after SQL `LIMIT` causes tenant isolation failures under high item counts. The SQLite query must filter `workspace_id` in SQL before applying the ranking window.
5. **Disk I/O Explosion on Startup**: Eagerly reading markdown during catalog initialization turns catalog seeding from an $O(N)$ memory operation into an $O(N)$ disk I/O bottleneck.

---

## Strengths to Preserve

1. **Pure Metadata in Catalog**: Preserving `ToolDescriptor` as pure metadata and keeping `ToolRegistration.handler` non-optional in `@jini-ai/core`.
2. **Path Containment Guarantees**: Reusing `package-paths.ts`'s `assertContainedOnDisk` rather than writing ad-hoc path resolution.
3. **Disposable In-Memory Projection**: Using `:memory:` SQLite FTS5 index rebuilt from source registries rather than creating persistent database tables.
4. **Decoupled Architecture**: Strictly enforcing that `src/assistant/**` never imports feature directories.
5. **No Execution Surface in Catalog**: Keeping `capability_search` and `capability_get` purely informational with no backdoor `capability_invoke`.

---

## Risk Tier Recommendation

**Recommendation: Medium**

### Rationale
- **Security Invariant**: Multi-tenant workspace isolation requires strict pre-ranking SQL filtering to prevent information leakage.
- **File System Safety**: Reading skill content requires path containment verification via `assertContainedOnDisk` to prevent traversal.
- **Low Complexity in Engine**: By leveraging the existing `@jini-ai/sqlite` FTS5 pattern and in-memory lifecycle from `tool-catalog-query.ts`, the implementation footprint is small, deterministic, and requires no schema migrations or kernel type changes.

<<COWORK_END>>
