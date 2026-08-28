import {
  buildDomainRegistrations,
  indexCatalogById,
  isRecord,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type WirableToolDefinition,
} from "@jini-ai/cms/core";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { PluginActivationRepoPort } from "./activation.js";
import type { PluginDiscoveryRecord } from "./discovery.js";
import type { PluginManifest, PluginManifestFieldDecl } from "./manifest.js";
// Disclosed cross-domain read, same shape `agent-tools.ts`'s header already accepts for this
// package: `ext.{pluginId}.*` is written ONLY on a `posts` row (see `post.ts`'s own `ext` field
// doc — "content.entry.beforeSave hook-merge step... immediately before the single
// deps.repo.save() call"), so a tool that reads a plugin's stored output back has nowhere else to
// read it FROM. Read-only (`PostRepoPort.findById`/`PostRecord`/`PostNotFoundError` only) — this
// file never imports anything that could write a post.
import { PostNotFoundError, type PostRecord, type PostRepoPort } from "../post/post.js";

/**
 * @file Projects each ENABLED plugin-runtime plugin's own declared `fields[]` (manifest.ts,
 * SPEC-005 REQ-06) into one real, `search_tools`-discoverable tool per plugin — the fix for the
 * 2026-08-26 registration-gap audit (`ADS-memory/reports/2026-08-26-plugin-discoverability-audit.md`):
 * a live, valid, tier-3 Word Count plugin was computing and storing a real per-post word count on
 * every save, yet no agent-callable tool anywhere ever exposed it, so `search_tools` correctly
 * returned nothing for "compute word count or reading time statistics for post content" — a
 * registration gap, not a ranking or selection miss.
 *
 * ---------------------------------------------------------------------------
 * Why THIS shape and not the other two the dispatch offered
 * ---------------------------------------------------------------------------
 * (1) "Plugins declare invocable tools" was rejected as the bigger, contract-changing option: v1's
 * entire capability vocabulary (`manifest.ts`'s `VALID_CAPABILITIES`/`VALID_HOOKS`) has no notion of
 * "expose a callable function" at all, and inventing one — arbitrary handler code a plugin author
 * supplies, executed inside the agent's tool-call path — is a real security/sandboxing question this
 * dispatch's time-box cannot responsibly answer.
 * (3) "Discoverable but not invocable" (a catalog entry that only explains a capability exists) was
 * rejected because the owner's own repro ("is there a way to count words in posts?") needed a real
 * ANSWER, not a pointer — a tool the agent cannot actually call would leave it exactly where it
 * started, manually counting words with Bash.
 * This file is (2): a plugin's already-written, already-durable `ext.{pluginId}.*` output becomes
 * READABLE through one native, read-only tool per plugin — no new execution surface, no new
 * capability vocabulary, just a read path onto data that already exists (`post.ts`'s `ext` field).
 *
 * ---------------------------------------------------------------------------
 * One tool PER PLUGIN, not per field (mirrors `agent-plugins/tool-registrations.ts`'s own
 * one-tool-per-plugin collapse, same rationale: crowding `search_tools`' result slots one field at a
 * time does not scale, and a plugin's fields are typically one cohesive capability anyway).
 * ---------------------------------------------------------------------------
 * Tool id: `plugin_capability_<pluginId>` (hyphens folded to underscores, matching
 * `agent_plugin_<pluginId>`'s own scheme) — deliberately NOT `plugins_*` (already
 * `plugins_list`/`plugins_set_enabled`, the MANAGEMENT tools this is not) and NOT `plugin_*` bare
 * (would read as belonging to the Agent Plugins family). Checked against every existing catalog's
 * ids (`grep -rn 'name: "[a-z_]*"' src/**\/agent-tools.ts src/**\/*tool-registrations.ts`) before
 * choosing it — no collision today. `@jini-ai/core`'s `createToolRegistry().register()` throws on a
 * duplicate id at registration time regardless (verified by reading `tool-registry.ts`), so a future
 * collision fails loudly at boot rather than silently shadowing a native tool — this module does not
 * need to (and does not) reimplement that guard.
 *
 * ---------------------------------------------------------------------------
 * The description text IS the fix — folds each field's own manifest-declared, action-oriented
 * `description` (see `manifest.ts`'s `PluginManifestFieldDecl.description`, added alongside this
 * file) into one tool description. A plugin with no authored field description still gets a tool —
 * degraded to a generic, weaker description ({@link genericFieldDescription}) rather than no tool at
 * all, the same graceful-degradation shape `agent-plugins/tool-registrations.ts`'s
 * `extractFallbackSummary` already uses for a skill with no frontmatter.
 *
 * ---------------------------------------------------------------------------
 * Activation gate — the OPPOSITE default from Agent Plugins, and that is a real, disclosed decision
 * ---------------------------------------------------------------------------
 * `features/agent-plugins/activation.ts` treats an absent activation record as ACTIVE ("presence
 * implies consent"). Plugin-runtime's own projection (`admin-response.ts`: `enabled: activation?.
 * enabled ?? false`) is the opposite: absent means DISABLED. This loader follows plugin-runtime's own
 * convention, not the Agent Plugins one it sits next to — a disabled plugin's `content.entry.
 * beforeSave` hook never fires (`hook-registry.ts`), so its `ext` data (if any survives from when it
 * was last enabled, INV-03) is not being kept fresh. Advertising that as a live capability would be a
 * new bug this file exists to avoid, not fix. Only `status: "valid"` AND `activation.enabled === true`
 * plugins are ever projected into a tool source — verified by both an enabled-plugin test and a
 * disabled-plugin (absent-activation) test in this file's own unit suite.
 *
 * Architectural role:
 * `features/plugin-runtime` domain declaration, alongside (not replacing) `agent-tools.ts`/
 * `tool-registrations.ts`'s static `plugins_list`/`plugins_set_enabled` pair — this file's tool ids
 * are dynamic (learned only by awaiting `discoverPlugins()` + `pluginActivationRepo`), the same
 * reason `agent-plugins/tool-registrations.ts` is not a synchronous `ToolContributor` either. Called
 * once from `agent-daemon-server.ts`'s `start()`, immediately before `buildToolCatalogQuery` snapshots
 * the registry into a one-shot FTS index — see that call site's own comment for why placement there
 * (not before) makes a registered-late tool invisible to `search_tools`.
 */

/** `plugin_capability_<pluginId>` — see this file's header, "Tool id scheme". */
function toCapabilityToolId(pluginId: string): string {
  return `plugin_capability_${pluginId.replace(/-/g, "_")}`;
}

/** One resolved, already-namespace-parsed `ext.{pluginId}.*` field this tool can read back. */
export interface PluginCapabilityFieldSource {
  /** The full manifest-declared path, e.g. `"ext.word-count.count"`. */
  readonly path: string;
  /** The key this field is stored under inside `post.ext[pluginId]` — `path` with the
   *  `ext.{pluginId}.` prefix stripped (e.g. `"count"`). Namespacing is already enforced by
   *  `manifest.ts`'s `validateField` before a record can ever reach `status: "valid"`, so this is a
   *  plain slice, not a re-validation. */
  readonly fieldKey: string;
  readonly type: PluginManifestFieldDecl["type"];
  /** Action-oriented, human-authored text when the manifest supplies one; otherwise
   *  {@link genericFieldDescription}'s weaker fallback. Never empty. */
  readonly description: string;
}

/** One enabled plugin's tool-ready source — everything {@link buildPluginCapabilityToolRegistrations}
 *  needs to mint one real `ToolRegistration`, with nothing left for the handler to (re)compute from
 *  raw discovery/activation state at call time. */
export interface PluginCapabilityToolSource {
  readonly id: string;
  readonly pluginId: string;
  readonly pluginName: string;
  readonly description: string;
  readonly fields: readonly PluginCapabilityFieldSource[];
}

/** Fallback for a field whose manifest declares no `description` (see this file's header,
 *  "description text IS the fix") — weaker (a noun-phrase, not an action), but still a usable,
 *  non-empty tool description rather than no tool at all. */
function genericFieldDescription(pluginName: string, field: PluginManifestFieldDecl): string {
  return `The '${pluginName}' plugin's '${field.path}' value (${field.type}), written whenever a post is saved while this plugin is enabled.`;
}

/**
 * Resolves one valid manifest's declared fields into tool-ready sources — `expectedPrefix` mirrors
 * `manifest.ts`'s own `validateFields` derivation exactly, so a field this function accepts is
 * guaranteed already-validated namespacing, never a fresh assumption this file invents.
 *
 * @complexity O(fields.length) — one manifest's own declared array.
 */
function buildFieldSources(manifest: PluginManifest): readonly PluginCapabilityFieldSource[] {
  const expectedPrefix = `ext.${manifest.id}.`;
  return manifest.fields
    .filter((field) => field.path.startsWith(expectedPrefix) && field.path.length > expectedPrefix.length)
    .map((field) => ({
      path: field.path,
      fieldKey: field.path.slice(expectedPrefix.length),
      type: field.type,
      description: field.description ?? genericFieldDescription(manifest.name, field),
    }));
}

/**
 * Builds this plugin tool's model-facing description — an operator SEARCH TARGET, not a card blurb
 * (mirrors `agent-plugins/tool-registrations.ts`'s `buildPluginToolDescription` doc on the same
 * point). Leads with an imperative action clause, folds in every field's own description text (the
 * actual indexed vocabulary a real query needs to match), and states the `postId` precondition and
 * the "no data yet" outcome up front so a model reading only this description already knows how to
 * call it and what an empty result means.
 */
function buildCapabilityToolDescription(manifest: PluginManifest, fields: readonly PluginCapabilityFieldSource[]): string {
  const fieldText = fields.map((field) => field.description).join(" ");
  return (
    `Reads content metrics and other data the installed '${manifest.name}' plugin has already computed and stored ` +
    `for one existing post or page. ${fieldText} Requires an existing postId — call content_post_search, ` +
    `content_post_list, or content_post_get first if you do not already have one. Returns null for any field this ` +
    `plugin has not written yet for that post (for example, one never saved since '${manifest.name}' was enabled), ` +
    `plus a note explaining why, rather than failing the call.`
  );
}

/**
 * Loads every ENABLED, valid plugin-runtime plugin that declares at least one field, resolved into
 * one tool-ready source per plugin. See this file's header, "Activation gate", for why "enabled"
 * here means `activation.enabled === true` — the opposite default from Agent Plugins.
 *
 * @complexity O(p) plugin-discovery calls times one `pluginActivationRepo.getActivation` each,
 * dominated by `discoverPlugins()`'s own I/O (unchanged, not re-read per plugin).
 */
export async function loadEnabledPluginCapabilityToolSources(deps: {
  readonly workspaceId: string;
  readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  readonly pluginActivationRepo: PluginActivationRepoPort;
}): Promise<readonly PluginCapabilityToolSource[]> {
  const discovery = await deps.discoverPlugins();
  const sources: PluginCapabilityToolSource[] = [];

  for (const record of discovery) {
    if (record.status !== "valid" || !record.manifest) continue;
    if (record.manifest.fields.length === 0) continue; // nothing this plugin's tool could ever return

    const activation = await deps.pluginActivationRepo.getActivation({ workspaceId: deps.workspaceId, pluginId: record.id });
    if (!activation?.enabled) continue; // disabled (or never activated) — see this file's header

    const fields = buildFieldSources(record.manifest);
    if (fields.length === 0) continue;

    sources.push({
      id: toCapabilityToolId(record.id),
      pluginId: record.id,
      pluginName: record.manifest.name,
      description: buildCapabilityToolDescription(record.manifest, fields),
      fields,
    });
  }

  return sources;
}

/** This module's own risk classification — every capability tool is a pure read of an already-saved
 *  post's already-computed `ext` bag: no domain call, no write path. Mirrors
 *  `agent-plugins/tool-registrations.ts`'s identical `"none"` classification for the same reason. */
export function pluginCapabilityToolDerivedRisk(sources: readonly PluginCapabilityToolSource[]): DerivedRiskByToolId {
  return new Map(sources.map((source) => [source.id, "none" as const]));
}

function buildCapabilityInputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["postId"],
    properties: {
      postId: {
        type: "string",
        minLength: 1,
        description:
          "The post/page id to read this plugin's computed field(s) for, as returned by content_post_search, " +
          "content_post_list, or content_post_get.",
      },
    },
  };
}

/** Reads one plugin's stored fields back off an already-loaded post, defensively — `post.ext` is
 *  typed as a generic `JsonObject` (see `post.ts`'s own field doc), so this narrows with `isRecord`
 *  at each level rather than casting, and treats any unexpected shape the same as "not yet written"
 *  (`null` + note) rather than throwing on data this handler does not own the shape of. */
function buildCapabilityToolResult(source: PluginCapabilityToolSource, post: PostRecord): Record<string, unknown> {
  const pluginBag = isRecord(post.ext) && isRecord(post.ext[source.pluginId]) ? (post.ext[source.pluginId] as Record<string, unknown>) : undefined;

  const fields: Record<string, unknown> = {};
  let anyComputed = false;
  for (const field of source.fields) {
    const value = pluginBag ? pluginBag[field.fieldKey] : undefined;
    fields[field.fieldKey] = value ?? null;
    if (value !== undefined) anyComputed = true;
  }

  return {
    postId: post.id,
    pluginId: source.pluginId,
    fields,
    ...(anyComputed
      ? {}
      : {
          note:
            `'${source.pluginName}' has not computed any field for this post yet — it will be written the next ` +
            `time this post is saved while the plugin stays enabled.`,
        }),
  };
}

export interface PluginCapabilityToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly postRepo: PostRepoPort;
}

/**
 * Turns already-resolved plugin capability sources into real `ToolRegistration`s — pure and
 * synchronous, unlike {@link loadEnabledPluginCapabilityToolSources}, so this half is unit-tested
 * without touching activation/discovery I/O. Uses the same `buildDomainRegistrations` gate every
 * other domain's `tool-registrations.ts` uses (catalog/risk cross-check, `inputSchema` presence,
 * drift tripwire) — not a parallel mechanism.
 *
 * Permission: `content.read`, the same permission `content_post_get` itself requires — this tool
 * reads a post's already-persisted data, nothing a plugin-specific permission would meaningfully
 * narrow further (mirrors `content_post_get`'s own inline `requireToolPermission` call exactly,
 * including the `entityType`/`entityId` pair so a per-post authorization rule can still apply).
 */
export function buildPluginCapabilityToolRegistrations(
  sources: readonly PluginCapabilityToolSource[],
  deps: PluginCapabilityToolDeps,
): ToolRegistration[] {
  const catalog: WirableToolDefinition[] = sources.map((source) => ({
    name: source.id,
    description: source.description,
    sideEffects: "none",
    authorization: { permission: "content.read" },
    inputSchema: buildCapabilityInputSchema(),
  }));

  const handlers: Record<string, ToolHandler> = {};
  for (const source of sources) {
    handlers[source.id] = async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const postId = requireString(input, "postId");
      await requireToolPermission(deps, {
        principalId: ctx.principal.id,
        permission: "content.read",
        entityType: "post",
        entityId: postId,
      });

      const post = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: postId });
      if (!post) {
        throw new PostNotFoundError(`post '${postId}' was not found`);
      }
      return buildCapabilityToolResult(source, post);
    };
  }

  return buildDomainRegistrations({
    domain: "plugin-capability",
    catalogModule: "features/plugin-runtime/capability-tool-registrations.ts",
    catalog: indexCatalogById(catalog),
    handlers,
    derivedRisk: pluginCapabilityToolDerivedRisk(sources),
  });
}

/**
 * Composition-root entry point: loads every enabled, field-declaring plugin for one workspace and
 * registers each as a real tool directly on `registry` — the same `registry.register(registration)`
 * call `agent-daemon-server.ts`'s own loops make for every other contributor's output, just awaited
 * first (mirrors `registerInstalledAgentPluginTools`'s identical shape and rationale).
 *
 * @throws Whatever `registry.register()` itself throws on an id collision (`@jini-ai/core`'s
 * `createToolRegistry()` throws synchronously — see this file's header) — deliberately not caught
 * here; the caller's own fail-open `try/catch` (matching `registerInstalledAgentPluginTools`'s and
 * `registerInstalledSkillTools`'s call sites in `agent-daemon-server.ts`) is where that is handled,
 * so all three optional registrars degrade identically on failure.
 */
export async function registerEnabledPluginCapabilityTools(
  registry: { register: (registration: ToolRegistration) => void },
  deps: PluginCapabilityToolDeps & {
    readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
    readonly pluginActivationRepo: PluginActivationRepoPort;
  },
): Promise<void> {
  const sources = await loadEnabledPluginCapabilityToolSources(deps);
  for (const registration of buildPluginCapabilityToolRegistrations(sources, deps)) {
    registry.register(registration);
  }
}
