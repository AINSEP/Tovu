import { type ToolRegistry, type ToolRegistration } from "@jini-ai/core";
import { createPluginCapabilityTools, pluginCapabilityToolDerivedRisk as derivedRiskFor, type PluginCapabilityToolSource, type PluginContributionRegistry, type PluginCapabilityToolText } from "@jini-ai/plugins/host";
import { toolMetadata } from '../../contracts/core/tool-metadata/plugin-runtime.js';
import type { ApplyExtensionApprovalPolicy } from "#src/contracts/headless/assistant-tool-approval-policy";
import type { DerivedRiskByToolId } from "@jini-ai/core";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { PluginActivationRepoPort } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";
import type { PluginBeforeSavePreview } from "#src/features/plugin-runtime/host-binding";
// Disclosed cross-domain read, same shape `agent-tools.ts`'s header already accepts for this
// package: `ext.{pluginId}.*` is written ONLY on a `posts` row (see `post.ts`'s own `ext` field
// doc — "content.entry.beforeSave hook-merge step... immediately before the single
// deps.repo.save() call"), so a tool that reads a plugin's stored output back has nowhere else to
// read it FROM. Read-only (`PluginPostReadPort`/`PostRecord` only) — this
// file never imports anything that could write a post.
import type { PostRecord } from "../post/index.js";
import type { PluginPostReadPort } from "./service-ports.js";

/**
 * @file Tovu binder for the plugin capability tools (`plugin_capability_<pluginId>`). The registrar
 * algorithm and its full rationale (tool id scheme, activation gate, revocation, fresh tier-2 results)
 * live in `@jini-ai/plugins/host`'s `capability-tools.ts`; this module keeps every old export and
 * signature and binds Tovu's vocabulary: identity namespace `tovu`, `content.read` on `post`,
 * `admin.plugins.enable` on `plugin` for executable tools, `toolMetadata`, the `plugin-capability-result`
 * approval family, this catalog path, the preview draft fields and the exact model-facing text below.
 *
 * Called once from `agent-daemon-server.ts`'s `start()`, immediately before `buildToolCatalogQuery`
 * snapshots the registry into a one-shot FTS index — a registered-late tool is invisible to `search_tools`.
 */

export type { PluginCapabilityFieldSource, PluginCapabilityToolSource } from "@jini-ai/plugins/host";

/** Tovu's exact model-facing wording for the capability tools (text only). */
const CAPABILITY_TOOL_MESSAGES: PluginCapabilityToolText = {
  genericFieldDescription: ({ pluginName, path, type }) =>
    `The '${pluginName}' plugin's '${path}' value (${type}), written whenever a post is saved while this plugin is enabled.`,
  discovery: ({ terms }) => ` Plugin discovery: ${terms}.`,
  freshDescription: ({ pluginName, fieldText }) =>
    `Runs the installed '${pluginName}' plugin on one existing post or page right now and returns its fresh result ` +
    `(nothing is saved). ${fieldText} Requires an existing postId — call content_post_search, content_post_list, or ` +
    `content_post_get first if you do not already have one. JSON-valued fields (such as a report) come back already parsed.`,
  storedDescription: ({ pluginName, fieldText }) =>
    `Reads content metrics and other data the installed '${pluginName}' plugin has already computed and stored ` +
    `for one existing post or page. ${fieldText} Requires an existing postId — call content_post_search, ` +
    `content_post_list, or content_post_get first if you do not already have one. Returns null for any field this ` +
    `plugin has not written yet for that post (for example, one never saved since '${pluginName}' was enabled), ` +
    `plus a note explaining why, rather than failing the call.`,
  postIdDescription:
    "The post/page id to read this plugin's computed field(s) for, as returned by content_post_search, " +
    "content_post_list, or content_post_get.",
  noDataNote: ({ pluginName }) =>
    `'${pluginName}' has not computed any field for this post yet — it will be written the next ` +
    `time this post is saved while the plugin stays enabled.`,
  previewFailed: ({ pluginName, postId }) =>
    `PLUGIN_HOOK_FAILED: '${pluginName}' could not run on post '${postId}' just now, so there is no fresh result. Nothing was saved; its stored values are unchanged.`,
  activationReadDenied: ({ pluginId, detail }) =>
    `[plugin-runtime] '${pluginId}': capability tool call denied — its activation record could not be read (${detail})`,
};

export interface PluginCapabilityToolDeps {
  readonly pluginContributions?: PluginContributionRegistry;
  readonly executablePluginToolRegistry?: ToolRegistry;
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly postRead: PluginPostReadPort;
  /** Re-read on EVERY call by each registration's policy — see the Jini registrar's "Revocation". */
  readonly pluginActivationRepo: PluginActivationRepoPort;
  /** Runs ONE attached plugin's beforeSave filter on a draft without saving — the composition
   *  root's `previewPluginBeforeSave` binding (`HookRegistry.previewBeforeSave`). Omitted ⇒ every
   *  tool reads stored values. */
  readonly previewPluginBeforeSave?: PluginBeforeSavePreview;
}

const capabilityTools = createPluginCapabilityTools<PostRecord, Parameters<PluginBeforeSavePreview>[1], 'plugin-capability-result'>({
  identityNamespace: "tovu",
  text: CAPABILITY_TOOL_MESSAGES,
  catalog: { domain: "plugin-capability", catalogModule: "features/plugin-runtime/capability-tool-registrations.ts", metadata: toolMetadata },
  // `content.read`, the same permission `content_post_get` itself requires, on the read post.
  access: { permission: "content.read", entityType: "post" },
  // In-process arbitrary code can leave this site. Its prose cannot self-classify it as read-only.
  // The assistant decides when to invoke it; only permanent-delete tools require confirmation.
  executableAccess: { permission: 'admin.plugins.enable', entityType: 'plugin', metadata: { approval: { class: 'publish', confirmation: 'direct' } } },
  approvalFamily: 'plugin-capability-result',
  // The draft is the post exactly as stored — the same fields `post.ts` hands the filter on an update.
  toPreviewDraft: ({ post }) => ({
    id: post.id,
    workspaceId: post.workspaceId,
    title: post.title,
    slug: post.slug,
    status: post.status,
    bodyJson: post.bodyJson,
    ext: (post.ext ?? {}) as Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  }),
});

/** Loads every ENABLED, valid, field-declaring plugin as one tool-ready source per plugin. */
export async function loadEnabledPluginCapabilityToolSources(deps: {
  readonly workspaceId: string;
  readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  readonly pluginActivationRepo: PluginActivationRepoPort;
}): Promise<readonly PluginCapabilityToolSource[]> {
  return capabilityTools.loadSources(deps);
}

/** Every capability tool is a pure read: `"none"` risk. */
export function pluginCapabilityToolDerivedRisk(sources: readonly PluginCapabilityToolSource[]): DerivedRiskByToolId {
  return derivedRiskFor({ sources });
}

/** Builds gated, approval-wrapped registrations — pure and synchronous. */
export function buildPluginCapabilityToolRegistrations(
  { sources, deps, withExtensionApprovalPolicy }: { sources: readonly PluginCapabilityToolSource[]; deps: PluginCapabilityToolDeps; withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy },
  _optional: Record<string, never> = {},
): ToolRegistration[] {
  return capabilityTools.buildRegistrations({ sources, deps, applyApprovalPolicy: withExtensionApprovalPolicy });
}

/** Composition-root entry point; registry collisions throw to the caller's fail-open try/catch. */
export async function registerEnabledPluginCapabilityTools(
  registry: { register: (registration: ToolRegistration) => void; has?: ToolRegistry["has"]; list?: ToolRegistry["list"] },
  deps: PluginCapabilityToolDeps & {
    readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
    readonly withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy;
  },
): Promise<void> {
  await capabilityTools.registerEnabled({ registry, deps, applyApprovalPolicy: deps.withExtensionApprovalPolicy });
}
