# COWORK-TOVU-CAPABILITY-SLICE-2026-08-22

**Packet ID:** `COWORK-TOVU-CAPABILITY-SLICE-2026-08-22`
**Phase:** Independent co-design. READ-ONLY. **Do not edit, create, or delete any file in this phase.**
**Risk tier:** medium. **Verifier score floor: 8.5.**

## ACK — only if this is the probe call
If this call asks only for an acknowledgement, reply with exactly:
`ACK_PACKET_RECEIVED COWORK-TOVU-CAPABILITY-SLICE-2026-08-22 -- I received the packet and will work on it.`
Otherwise this is the FULL task call: do NOT send an ACK, produce the complete response.
End every full response with `<<COWORK_END>>` on its own line.

## THE TASK

Build the tool side of a capability bucket for Tovu: a generic capability-source seam, one
registered source (installed Agent Plugin skills), a searchable catalog over registered sources, and
two agent-facing tools — `capability_search` and `capability_get`.

This slice deliberately EXCLUDES: the composer chip / prompt-pointer change, the
`check:architecture` boundary rule, and any UI. Each is a separate slice. Do not design them here
and do not propose expanding scope into them.

## WHY THIS SHAPE (settled by a 5-model debate, do not re-litigate)

A two-round Swarm Consensus debate (Claude Opus 5, Gemini 3.7 Flash, Gemini 3.1 Pro, Codex
gpt-5.6-sol, Claude Sonnet 5) reached 5/5 agreement on the following. These are inputs, not open
questions:

1. **One discovery index over many registered sources**, with a `kind`/`lane` column so a caller who
   already knows what it wants can scope the query. Splitting the physical index protects nothing —
   an FTS5 row is inert regardless of which table holds it.
2. **Discovery unifies; activation does not.** The agent surface is search + get. **There is no
   `capability_invoke` and must never be one.** Activation stays on each lane's existing gate.
3. **The extension point is a registered SOURCE, not a new KIND.** Adding a capability kind must mean
   "register a source, write its adapter" — the new source's own files plus one registration call at
   a composition root, and nothing else. That two-file property is the acceptance criterion.
4. **`kind` is data, never switched on in core.** `slots.ts:77-80` already states this law for the
   composer; it extends here.
5. **No new persistent datastore.** The catalog is a disposable in-memory projection.
6. **Workspace scope must be applied BEFORE ranking, never after.** Filtering after ranking leaks the
   existence of other tenants' capabilities through result counts. `install.ts` carries a SECURITY
   note about a real prior cross-tenant bug that type-checked.

## THE VERIFIED SOURCE FACT THAT MAKES THIS CHEAP

- `Jini/packages/core/src/tool-registry.ts`: `ToolRegistration.handler` is **non-optional**. A
  handler-less row **cannot** enter the real `ToolRegistry`. Do not propose changing that shared
  kernel type — it is a published cross-repo package and out of scope.
- BUT `ToolDescriptor` is pure metadata (its own doc: "Never carries the handler or policy"), and
  `ToolRegistry.list()` returns `readonly ToolDescriptor[]`, and `buildToolCatalogQuery` takes
  `Pick<ToolRegistry, "list">`. **Therefore any object exposing a `.list()` can back the existing
  FTS5/BM25 catalog machinery — no core type change, no new datastore.**
- Consequence for this slice: a readable skill must NOT be registered into the real `ToolRegistry`
  with a fake handler. It lives in the capability catalog, which is a separate, descriptor-only
  projection.

## FILE SCOPE (approved by the owner; do not expand)

NEW:
- `src/assistant/capability-source-registry.ts` — the generic seam
- `src/features/agent-plugins/capability-source.ts` — first source: Agent Plugin skills
- `src/assistant/capability-catalog-query.ts` — searchable catalog over registered sources
- `src/assistant/capability-tool-registrations.ts` — `capability_search` + `capability_get`

EDIT:
- `src/server/tool-catalog-manifest.ts` — register the one source at the composition root

NEW TESTS:
- `src/assistant/__tests__/capability-source-registry.test.ts`
- `src/assistant/__tests__/capability-catalog-query.test.ts`
- `src/features/agent-plugins/__tests__/unit/capability-source.unit.test.ts`

## HOUSE RULES (violating any of these fails verification)

- **TDD: every test must be proven to FAIL first**, for the right reason, before the implementation
  that makes it pass. A test that never failed is not evidence.
- **Assert exact thrown error text.** A bare "it throws" is not a real test in this repo.
- **Never run `npm test` or `npm run test:cov`** — 35 minutes, and it OOMs this machine. Scoped runs
  only: `node --import tsx --test <specific file>`.
- Do not start Docker, do not kill processes, do not start servers, do not run git commands.
- Match the surrounding code's comment density and idiom. This codebase writes substantial `@file`
  headers explaining WHY a shape was chosen; match that, do not pad.
- Every new module must state its architectural role in its header, as neighbouring files do.
- `src/assistant/**` must NOT import a feature module by name. That edge is what the whole
  contribution-registry pattern exists to avoid. The source ADAPTER lives in the feature
  (`src/features/agent-plugins/`) and reaches INTO the assistant registry, never the reverse.

## WHAT TO RETURN

```
## Cowork Scope Check
<what you believe the task is, which files you actually read, any mismatch or uncertainty>

## Design
<the whole slice: module responsibilities, the card/descriptor shape, the registry API, how the
catalog is seeded and queried, how workspace scope is applied before ranking, how capability_get
returns skill content safely, and how the composition root wires it>

## Defects and traps you predict
<concrete failure modes in THIS repo, with file/line references where possible>

## Test plan
<what proves this works, including what each test asserts and which must fail first>

## Blind spots the other participants will likely miss

## Strengths to preserve
<what in the existing code must NOT change>

## Risk tier recommendation
<low | medium | high, with reason>

<<COWORK_END>>
```

---

# EXISTING SOURCE — the patterns to follow


## FILE: src/assistant/tool-contribution-registry.ts (THE SEAM PATTERN TO CLONE)

```ts
import type { DerivedRiskByToolId, ToolRegistration } from "@jini-ai/cms/core";

import type { AssistantSurfaceDeps } from "../core/tool-surface-exchanges.js";
import type { AssistantToolRegistryDeps } from "./tool-registrations.js";

/**
 * @file The boot-installed registry a first-party (or, eventually, policy-checked third-party)
 * feature contributes its AI tools into, instead of `assistant/tool-registrations.ts` importing
 * that feature's `build*Registrations`/`*DerivedRisk` by name.
 *
 * Modeled directly on `mcp-federation/presets.ts` — same module-level ordered list, same
 * `register*`/`list*`/`reset*ForTests` trio, same "last registration wins, replacing by key rather
 * than appending" semantics for accidental double-registration. That file's own doc explains why
 * this shape (not a class, not a DI container): it is the shape this codebase already uses for
 * "a plugin announces itself to a core-owned seam" (see also `page-head.ts`'s
 * `registerPageHeadContributor` and `routing.ts`'s `registerResolvePhase`). Per ADR-006/ADR-009 §3,
 * hooks and registries are exempt from the rule-of-two.
 *
 * NOT "register on import" side-effect magic: nothing in this file, or in any feature's own
 * `contribute<Domain>Tools()` function, runs merely because that feature's module was imported.
 * Every registration is an explicit call, made by a composition root (today:
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors`, and the two real boot
 * paths that call it — `server/agent-daemon/agent-daemon-server.ts` and
 * `server/modules/assistant-byok.ts`) — the same posture `supabase-mcp-plugin.ts`'s own
 * `registerSupabaseMcpPreset()` already established for MCP federation.
 *
 * Why `assistant/` owns this file rather than `server/`: `AssistantToolRegistryDeps` (the deps bag
 * every contributor's `build` reads) is assembled here from every domain's own `*ToolDeps`
 * interface via TYPE-ONLY imports in `tool-registrations.ts` — erased at compile time, so they
 * never register as runtime module edges (`check:architecture`'s "module cycles"/"largest SCC"
 * metrics are computed on the runtime-only graph). Moving that type assembly into `server/` would
 * force `assistant` to import it back at runtime to type `buildAssistantToolRegistrations`'s own
 * parameter, reopening the `assistant <-> server` edge Candidate 1 of the 2026-08-17 back-edges plan
 * deliberately closed. Keeping the registry (and the wide deps type it's typed against) inside
 * `assistant/` while feature modules reach INTO it one-directionally (`comments -> assistant`,
 * never the reverse) is what actually breaks the `assistant <-> {comments,newsletter}` cycle: this
 * module never imports a feature by name, so nothing here closes a cycle no matter how many
 * features register into it.
 *
 * Architectural role: in-module registry. No I/O; assembly is delegated to whatever a contributor
 * registered, and duplicate-tool-id / risk-classification invariants stay owned by
 * `tool-registrations.ts`'s `buildAssistantToolRegistrations`/`assertRiskMetadataIsWirable`, same as
 * before — only the "reach into every feature by name" import shape moved, not the quality gates.
 */

/** One feature's AI-tool contribution: its builder and the risk classification its own wiring file
 * maintains — structurally identical to `tool-registrations.ts`'s (legacy, still-in-use for
 * not-yet-converted domains) `DomainSlice`, so a domain's `build`/`risk` pair means the same thing
 * whichever seam registered it. */
export interface ToolContributor {
  readonly domain: string;
  readonly build: (routeDeps: AssistantToolRegistryDeps, surfaces: AssistantSurfaceDeps) => ToolRegistration[];
  readonly risk: DerivedRiskByToolId;
}

let contributors: ToolContributor[] = [];

/**
 * Registers one feature's tool contribution, called once by a composition root during the ordinary
 * boot sequence (see this file's own header for the two real callers).
 *
 * Re-registering the same `domain` REPLACES the earlier entry rather than appending — mirrors
 * `registerFederatedMcpPreset`'s identical reasoning: a double import of the same feature module
 * should not silently double that domain's tools in the final catalog, and replacing-in-place
 * (rather than throwing) keeps this call idempotent per catalog instance, which both real callers
 * and every contract test that calls it more than once rely on. Registration order is otherwise
 * preserved so a replacement does not silently reorder the catalog.
 */
export function registerToolContributor(contributor: ToolContributor): void {
  const existing = contributors.findIndex((candidate) => candidate.domain === contributor.domain);
  if (existing >= 0) {
    contributors[existing] = contributor;
    return;
  }
  contributors.push(contributor);
}

/** Every contributor registered so far, in registration order — `buildAssistantToolRegistrations`
 * folds this together with the not-yet-converted `DOMAIN_SLICES` list. */
export function listToolContributors(): readonly ToolContributor[] {
  return contributors;
}

/** Test-only reset of the module-level registry (mirrors `resetFederatedMcpPresetsForTests`). A
 * test that builds a catalog from a clean slate must call this before registering just the
 * contributors it wants present — otherwise contributors registered by an earlier test in the same
 * process persist, since this is ordinary module-level state. */
export function resetToolContributorsForTests(): void {
  contributors = [];
}
```

## FILE: src/assistant/tool-catalog-query.ts (THE INDEX PATTERN TO CLONE)

```ts
import Database from "better-sqlite3";
import type { ToolRegistry } from "@jini-ai/core";
import type { ToolCatalogQuery } from "@jini-ai/http-kit";
import { ensureToolCatalogTables, getToolCatalogEntry, reseedToolCatalog, searchToolCatalog } from "@jini-ai/sqlite";

import { indexedDescriptionFor, stripSearchKeywords } from "./tool-search-keywords.js";

/**
 * @file Backs `@jini-ai/http-kit`'s `GET /api/tools/search` / `GET /api/tools/:id` with Tovu's own
 * `ToolRegistry` — the same registry `buildAssistantToolRegistrations` populates and
 * `ToolExecutor` already executes against, so search/describe can never drift from what
 * `execute_delegated_tool` can actually run.
 *
 * Missing until 2026-07-30: `agent-daemon-server.ts` built the registry and the executor but never
 * mounted `registerToolCatalogRoutes`, so `@jini-ai/mcp`'s `search_tools`/`describe_tool` (which
 * proxy these two routes) 404'd for every spawned CLI — confirmed live via a direct curl against
 * the daemon. This is the other half of that fix, alongside `mcp-injection.ts`'s missing bearer
 * credential.
 *
 * Ranking backend, 2026-07-30: swapped from a hand-rolled in-memory term-count scorer to
 * `@jini-ai/sqlite`'s FTS5 + `bm25()` implementation, after benchmarking both against the real
 * registered catalog. Timing is a wash either way (both sub-millisecond; a network/LLM round-trip
 * dwarfs the difference), but BM25's quality is meaningfully better: the in-memory scorer produced
 * frequent score ties on ambiguous queries (e.g. "notification email" scored
 * `forms_update_definition` and `identity_user_update_email` identically), while BM25 correctly
 * separates them by term-frequency/length-normalized relevance. That gap widens, not narrows, as
 * the catalog grows. (That 2026-07-30 benchmark ran against an 18-tool registry; the wired catalog
 * is 131 tools as of 2026-08-05, so the quality gap the swap was made for is wider now than the
 * numbers in that note imply, not narrower.)
 */

/** The tool id's own naming convention (`forms_create_definition` -> `forms`) doubles as its
 * catalog `source` — Tovu's `ToolDescriptor` carries no separate domain field, and every wired id
 * already follows `<domain>_<verb...>`, so deriving it is free rather than a new field to keep in
 * sync. */
function sourceForToolId(id: string): string {
  const [prefix] = id.split("_");
  return prefix && prefix.length > 0 ? prefix : "tovu";
}

/**
 * Seeds an in-memory SQLite FTS5 index from `registry.list()` and returns a `ToolCatalogQuery`
 * backed by it.
 *
 * `:memory:`, not a file, and seeded once at call time rather than kept live: the source of truth
 * is `registry` itself (a `ToolRegistry` rebuilt fresh from static code on every daemon boot), so
 * this index is a disposable snapshot, not durable state — matching `@jini-ai/sqlite`'s own module
 * doc ("this table only makes that id discoverable... reseeded wholesale"). Called once at daemon
 * startup (`agent-daemon-server.ts`), after every domain's registrations are wired in.
 *
 * @complexity O(r) to seed (r = registered tools, ~tens today); search/describe are SQLite's own
 * FTS5/index cost, not this function's.
 * @overallScore 100
 */
export function buildToolCatalogQuery(
  registry: Pick<ToolRegistry, "list">,
  /** Test seam. `false` seeds the raw descriptions with no operator vocabulary folded in — the ONLY
   *  caller is `tool-search-quality.eval.ts`, which needs a true before/after on the same case set to
   *  make its improvement attributable rather than asserted. Production always wants the default. */
  options: { readonly includeSearchKeywords?: boolean; readonly includeDoc2query?: boolean } = {},
): ToolCatalogQuery {
  const includeSearchKeywords = options.includeSearchKeywords ?? true;
  const includeDoc2query = options.includeDoc2query ?? true;
  const db = new Database(":memory:");
  ensureToolCatalogTables(db);
  reseedToolCatalog(
    db,
    registry.list().map((descriptor) => ({
      id: descriptor.id,
      // Indexed text, not the raw description — see `tool-search-keywords.ts` for why. Short
      // version: BM25 can only rank words that are in the index, and this catalog's descriptions
      // are written in the codebase's nouns while operators search in theirs. Measured at 40%
      // top-1 before this.
      description: includeSearchKeywords
        ? indexedDescriptionFor(descriptor.id, descriptor.description ?? "", { includeDoc2query })
        : (descriptor.description ?? ""),
      inputSchema: descriptor.inputSchema,
      source: sourceForToolId(descriptor.id),
    })),
  );

  // Both accessors strip the folded search vocabulary back off. The keywords exist to be RANKED on,
  // never to be read: a tool's description is a contract the model reasons about, and padding it
  // with synonyms to game the index would degrade that in order to fix search. Stripping here keeps
  // the two concerns separate — the index sees the vocabulary, every caller sees the authored text.
  return {
    search(query, limit = 10) {
      return searchToolCatalog(db, query, limit).map((hit) => ({ ...hit, description: stripSearchKeywords(hit.description) }));
    },
    describe(id) {
      const entry = getToolCatalogEntry(db, id);
      return entry === null ? null : { ...entry, description: stripSearchKeywords(entry.description) };
    },
  };
}
```

## FILE: src/features/agent-plugins/capability-projection.ts (EXISTING descriptor; note its dead `execute` union)

```ts
/**
 * @file The adapter between an installed Agent Plugin (`install.ts`'s `InstalledAgentPlugin`) and
 * whatever the composer's capability projection ultimately consumes.
 *
 * ---------------------------------------------------------------------------
 * Interface boundary — read this before changing the shape below
 * ---------------------------------------------------------------------------
 * The FINAL debate decision (`2026-08-12-tovu-six-debates-FINAL.md`, "3 — Agent Plugins → commands")
 * is explicit: "Agent Plugins are one adapter feeding the composer's capability projection — not a
 * parallel command system." Building that projection (the layer that turns a heterogeneous set of
 * capability sources — Agent Plugins among them — into what the composer actually renders and
 * dispatches) is a SEPARATE agent's deliverable, dispatched from the same debate's decision on
 * composer slash commands. This module is the OTHER side of that boundary: it does not touch the
 * composer, `apps/admin/src/components/AssistantDock/**`, or Jini's `slots.ts`/`composer-discovery.ts`
 * (verified real shape: `ComposerDiscoveryItem` is `{ id, label, description?, kind?, keywords?,
 * insertText? }` — data-only, no execute/preview fields at all today; `TOVU_COMPOSER_DISCOVERY_GROUPS`
 * in `apps/admin/src/features/plugins/agent-plugin-catalog.ts` is the CURRENT hardcoded catalog the
 * projection agent's own work explicitly plans to replace — this module does not edit that file).
 *
 * `AgentPluginCapabilityDescriptor` below is therefore a CANDIDATE contract, owned and tested by this
 * module, not a promise about what the real projection's input type will be named or shaped like.
 * What is NOT negotiable — because it is the debate's own decided rule, not an implementation detail
 * — is the RELATIONSHIP it encodes: a Skill gets a real, executable binding; an MCP server's `execute`
 * is unconditionally `{ kind: "unavailable", reason }`. See the rule stated at length below.
 *
 * ---------------------------------------------------------------------------
 * Why MCP execute is unconditional, not merely "the current default"
 * ---------------------------------------------------------------------------
 * "MCP servers → previewable but structurally inert in v1" (FINAL decision). This is not a
 * placeholder waiting for an admission flag to flip it on — there is deliberately no parameter to
 * this module's projector that CAN promote an MCP descriptor to runnable (see the adversarial test
 * "no promotion path exists" in this module's own unit test). The debate's trust argument is that a
 * plugin's own `mcp.json` "has no independent author... the operator is that author," and until a
 * real operator-authored, workspace-scoped admission record exists (the debate's own deferred future
 * work — see this feature's handoff REMAINING section), there is no admission to consult, which is a
 * feature of this slice, not a gap: an adapter that accepted an "admitted" boolean from its caller
 * would just move the unauthenticated-classification problem one layer up rather than solving it.
 *
 * Architectural role:
 * Pure projection (`projectInstalledAgentPluginCapabilities`) plus one disk-reading helper
 * (`readInstalledSkillMarkdown`) that composes `package-paths.ts`'s containment guarantee with a real
 * file read — the same split `install.ts` and `package-paths.ts` already keep between "pure logic"
 * and "the one place bytes are actually read".
 */
import { readFile } from "node:fs/promises";

import type { InstalledAgentPlugin } from "./install.js";
import { assertContainedOnDisk } from "./package-paths.js";

export type AgentPluginCapabilityKind = "agent-plugin-skill" | "agent-plugin-mcp-server";

export type AgentPluginCapabilityPreview =
  | { readonly kind: "markdown"; readonly path: string; readonly content: string }
  | { readonly kind: "none" };

export type AgentPluginCapabilityExecute =
  | { readonly kind: "context-injection"; readonly markdown: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/** One capability an installed Agent Plugin contributes. See this module's header for what is and
 * is not a stable contract about this shape. */
export interface AgentPluginCapabilityDescriptor {
  readonly id: string;
  readonly kind: AgentPluginCapabilityKind;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly pluginId: string;
  /** The installed package's content digest — a projection consumer's natural cache/invalidation
   * key, mirroring `AdmittedFederatedTool`'s own audit-carrying fields in `mcp-federation/trust.ts`. */
  readonly revision: string;
  readonly preview: AgentPluginCapabilityPreview;
  readonly execute: AgentPluginCapabilityExecute;
}

export interface ProjectInstalledAgentPluginCapabilitiesRequired {
  readonly installed: InstalledAgentPlugin;
  /** Reads one skill's markdown by its package-relative `skillPath`. Injected rather than reading
   * disk directly, so this projection function stays pure and unit-testable without a real
   * filesystem — `readInstalledSkillMarkdown` below is the real implementation a caller supplies. */
  readonly readSkillMarkdown: (skillPath: string) => Promise<string>;
  /** Server ids declared in the package's `mcp.json` (`manifest.ts`'s `parseAgentPluginMcpConfig`
   * result) — empty when the package declares no `mcp.json` at all, which the spec makes optional. */
  readonly mcpServerIds: readonly string[];
}

export type ProjectInstalledAgentPluginCapabilitiesOptional = {};

/**
 * Projects one installed Agent Plugin's Skills and MCP servers into capability descriptors.
 *
 * @throws Propagates whatever `readSkillMarkdown` throws for a skill it cannot read; does not itself
 * perform I/O.
 * @complexity O(s + m) in the plugin's own skill and MCP-server counts.
 */
export async function projectInstalledAgentPluginCapabilities(
  required: ProjectInstalledAgentPluginCapabilitiesRequired,
  _optional: ProjectInstalledAgentPluginCapabilitiesOptional = {}
): Promise<readonly AgentPluginCapabilityDescriptor[]> {
  const { installed, readSkillMarkdown, mcpServerIds } = required;
  const descriptors: AgentPluginCapabilityDescriptor[] = [];

  for (const skill of installed.skills) {
    const markdown = await readSkillMarkdown(skill.skillPath);
    descriptors.push({
      id: `agent-plugin:${installed.pluginId}:skill:${skill.name}`,
      kind: "agent-plugin-skill",
      label: humanize(skill.name),
      description: `Context-only skill from the '${installed.pluginId}' Agent Plugin`,
      keywords: ["skill", installed.pluginId, skill.name],
      pluginId: installed.pluginId,
      revision: installed.archiveDigest,
      preview: { kind: "markdown", path: skill.skillPath, content: markdown },
      // A Skill's whole contract (Agent Plugins spec) is markdown with no arguments, return value,
      // or side effects — "context injection" is the entire execution model, not a stand-in for one
      // this module has not built yet (FINAL decision: "No trust model needed").
      execute: { kind: "context-injection", markdown },
    });
  }

  for (const serverId of mcpServerIds) {
    descriptors.push({
      id: `agent-plugin:${installed.pluginId}:mcp:${serverId}`,
      kind: "agent-plugin-mcp-server",
      label: serverId,
      description: `MCP server declared by the '${installed.pluginId}' Agent Plugin`,
      keywords: ["mcp", installed.pluginId, serverId],
      pluginId: installed.pluginId,
      revision: installed.archiveDigest,
      preview: { kind: "none" },
      execute: {
        kind: "unavailable",
        reason:
          "Agent Plugin MCP servers are not executable in this release — a plugin's own mcp.json has no independent " +
          "author, and no operator-reviewed admission record exists yet for this server.",
      },
    });
  }

  return descriptors;
}

/**
 * Reads one installed skill's markdown from disk, through the same containment guarantee
 * (`package-paths.ts`'s `assertContainedOnDisk`) `install.ts` uses at extraction time — one
 * implementation of "stay inside the package root," not two.
 *
 * @throws {PackagePathViolation} If `skillPath` resolves outside `packageRoot` (should be
 * unreachable for a `skillPath` sourced from `InstalledAgentPlugin.skills`, which `install.ts` only
 * ever populates from paths it already walked inside an already-contained tree — defense in depth
 * for a caller that constructs one by hand).
 */
export async function readInstalledSkillMarkdown(packageRoot: string, skillPath: string): Promise<string> {
  const absolute = await assertContainedOnDisk(packageRoot, skillPath);
  return readFile(absolute, "utf8");
}

function humanize(value: string): string {
  return value
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
```

## FILE: src/server/tool-catalog-manifest.ts (COMPOSITION ROOT — function body only; its header is ~90 lines of rollout history, omitted)

```ts
import { contributeCommentsTools } from "../comments/tool-registrations.js";
import { contributeContentTypesTools } from "../features/content-types/tool-registrations.js";
import { contributeDatabaseTools } from "../features/database/tool-registrations.js";
import { contributeDeploymentsTools } from "../features/deployments/tool-registrations.js";
import { contributeEntriesTools } from "../features/entries/tool-registrations.js";
import { contributePagesTools } from "../features/pages/tool-registrations.js";
import { contributePluginsTools } from "../features/plugin-runtime/tool-registrations.js";
import { contributePostTools } from "../features/post/tool-registrations.js";
import { contributeRecoveryTools } from "../features/recovery/tool-registrations.js";
import { contributeTaxonomyTools } from "../features/taxonomy/tool-registrations.js";
import { contributeThemesTools } from "../features/theme/tool-registrations.js";
import { contributeWorkspaceTools } from "../features/workspace/tool-registrations.js";
import { contributeFormsTools } from "../forms/tool-registrations.js";
import { contributeIdentityTools } from "../identity/tool-registrations.js";
import { contributeWebhooksTools } from "../webhooks/tool-registrations.js";
import { contributeMediaTools } from "../media/tool-registrations.js";
import { contributeMembersTools } from "../members/tool-registrations.js";
import { contributeMenusTools } from "../navigation/tool-registrations.js";
import { contributeNewsletterTools } from "../newsletter/tool-registrations.js";
import { contributeRedirectsTools } from "../redirects/tool-registrations.js";
import { contributeSeoTools } from "../seo/tool-registrations.js";
import { contributeSettingsTools } from "../features/settings/tool-registrations.js";
import { contributeSourceControlTools } from "../features/source-control/tool-registrations.js";
import { contributeStaticPublishTools } from "../features/deployments/publish-agent-tools.js";
import { contributeWidgetsTools } from "../widgets/tool-registrations.js";

// ... ~90-line @file header omitted for packet size ...

export function installFirstPartyToolContributors(): void {
  contributeCommentsTools();
  contributeContentTypesTools();
  contributeDatabaseTools();
  contributeDeploymentsTools();
  contributeEntriesTools();
  contributeFormsTools();
  contributeIdentityTools();
  contributeWebhooksTools();
  contributeMediaTools();
  contributeMembersTools();
  contributeMenusTools();
  contributeNewsletterTools();
  contributePagesTools();
  contributePluginsTools();
  contributePostTools();
  contributeRecoveryTools();
  contributeRedirectsTools();
  contributeSeoTools();
  contributeSettingsTools();
  contributeSourceControlTools();
  contributeStaticPublishTools();
  contributeTaxonomyTools();
  contributeThemesTools();
  contributeWidgetsTools();
  contributeWorkspaceTools();
}
```

## TYPE: InstalledAgentPlugin (src/features/agent-plugins/install.ts)

```ts
export interface InstalledAgentPluginSkill {
  readonly name: string;
  readonly skillPath: string;
}

export interface InstalledAgentPlugin {
  readonly pluginId: string;
  readonly version?: string;
  /** SHA-256 of the raw archive bytes — the content-addressing key and the descriptor `revision`
   * a future capability projection pins invocation to (`capability-projection.ts`). */
  readonly archiveDigest: string;
  /** Absolute, read-only (frozen) path to the extracted package root. */
  readonly packageRoot: string;
  readonly files: readonly string[];
  readonly skills: readonly InstalledAgentPluginSkill[];
}

```

## NOTE: listInstalledPlugins walks EVERY digest under packages/sha256/*, so two installed
versions of one pluginId both appear. resolve-agent-plugin-refs.ts:153 hardcodes
`skills/${pluginRefId}/SKILL.md`, and the eponymous-skill convention has ZERO enforcement in the
manifest schema. One real installed plugin (`ui-ux-design`) has 7 skill folders. Your design must
handle all three.
