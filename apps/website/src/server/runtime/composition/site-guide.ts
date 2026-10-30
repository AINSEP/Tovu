import { bundledAgentPluginsDir } from "./site-paths.js";
import * as agentic from "@jini-ai/agentic/core";
import { FIELD_TYPES } from "@jini-ai/cms/forms";
import { WIDGET_TYPE_REGISTRATIONS } from "@jini-ai/cms/widgets";
import { EMBED_MARKER_TARGET_KEYS, FEATURED_IMAGE_MARKER_TYPE } from "@jini-ai/cms/widgets/markers";
import { ToolInputError } from "@jini-ai/core";
import { createTovuAgentPluginLifecycle, type TovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import type { AgentPluginLayout } from "#src/features/agent-plugins/layout";
import { readInstalledAgentPluginIdentity } from "#src/features/agent-plugins/identity";
import { resolveThemeLayout } from "#src/features/theme/index";
import type { SiteProfileSourceDeps } from "#src/features/site-inspection/index";
import { readSiteGuideFacts, loadSiteGuideContributions, type CapabilityCard, type SiteGuideEngine, type SiteGuideService } from "#src/features/site-guide/index";
import { capabilityCard as content } from "#src/features/post/capability-card";
import { capabilityCard as forms } from "#src/features/forms/capability-card";
import { capabilityCard as widgets } from "#src/features/widgets/capability-card";
import { capabilityCard as themes } from "#src/features/theme/capability-card";
import { capabilityCard as members } from "#src/features/members/capability-card";
import { capabilityCard as seo } from "#src/features/seo/capability-card";
import { capabilityCard as backup } from "#src/features/recovery/capability-card";
import { capabilityCard as deploy } from "#src/features/deployments/capability-card";
import { capabilityCard as plugins } from "#src/features/plugin-runtime/capability-card";
import { capabilityCard as jini } from "#src/features/site-guide/capability-card";

export const TOVU_CAPABILITY_CARDS: readonly CapabilityCard[] = [content, forms, widgets, themes, members, seo, deploy, backup, plugins, jini];
export interface TovuSiteGuideDeps extends SiteProfileSourceDeps {
  /** The boot root's listener origin, including its actual TLS scheme and bound port. */
  readonly derivedPublicOrigin?: string;
  readonly agentPluginLayout: AgentPluginLayout;
  readonly agentPluginLifecycle?: TovuAgentPluginLifecycle;
}

/** Probe the already-built package namespace rather than importing a new, unbuilt named export.
 * This keeps unrelated tools and the dev server bootable while the coordinator owns the build.
 * @throws ToolInputError with the exact prerequisite if the package predates the guide feature.
 */
export function resolveSiteGuideEngine(_input: Record<string, never>, _options: Record<string, never> = {}): SiteGuideEngine {
  const exports = agentic as unknown as Partial<SiteGuideEngine>;
  if (typeof exports.createSiteGuide !== "function" || typeof exports.parseGuideTopics !== "function") {
    throw new ToolInputError({ message: "site_guide is unavailable: build @jini-ai/agentic, then reload the assistant to enable the site guide." });
  }
  return exports as SiteGuideEngine;
}

/** The fact-source ports the guide's `facts.read` hands `readSiteGuideFacts`: the site's own deps
 * plus field-projected registries and the agent-plugin inventory. Extracted from
 * `createTovuSiteGuide` so each projection is unit-testable without running a guide engine.
 * @complexity O(p) agent-plugin activation reads for p installed plugins (capped at 256).
 */
export function siteGuideFactDeps(
  { deps, lifecycle }: { deps: TovuSiteGuideDeps; lifecycle: TovuAgentPluginLifecycle },
  options: { readIdentity?: typeof readInstalledAgentPluginIdentity } = {},
) {
  return {
    ...deps,
    listWidgetTypes: () => Object.values(WIDGET_TYPE_REGISTRATIONS).map(item => item.typeKey),
    listFormFieldTypes: () => [...FIELD_TYPES],
    listMarkers: () => [...new Set([...Object.keys(EMBED_MARKER_TARGET_KEYS), FEATURED_IMAGE_MARKER_TYPE])],
    listLayouts: () => [resolveThemeLayout().pagesDir, resolveThemeLayout(2).pagesDir],
    // No membership enable/disable toggle exists; a wired repository does not establish feature state.
    readMembersEnabled: async () => null,
    readAgentPlugins: async () => {
      const layout = deps.agentPluginLayout.forWorkspace(deps.workspaceId);
      const installed = lifecycle.preferBundledAgentPluginDigests(
        await lifecycle.listInstalledPlugins(layout.root), await lifecycle.readBundledAgentPluginDigests(layout.root),
      );
      if (installed.length > 256) throw new ToolInputError({ message: "site_guide: agent-plugin inventory exceeds the 256-record read limit." });
      return Promise.all(installed.map(async plugin => {
        const activation = await lifecycle.resolveAgentPluginActivation({ workspaceRoot: layout.root, pluginId: plugin.pluginId });
        const { maturity } = await (options.readIdentity ?? readInstalledAgentPluginIdentity)({ plugin });
        return {
          ...(maturity ? { maturity } : {}),
          id: plugin.id ?? plugin.pluginId, name: plugin.displayName ?? plugin.pluginId, version: plugin.version ?? null,
          // Names alone hide what a disabled bundled provider can do; expose metadata, not code.
          pluginId: plugin.pluginId, description: plugin.description ?? null, provides: plugin.provides ?? [],
          // An unreadable activation is unknown, not an operator's decision to disable it.
          enabled: activation.verdict === "undetermined" ? null : activation.verdict === "active",
        };
      }));
    },
  };
}

/** Bind the generic Jini shell to THIS site's owners. Every fact is field-projected, never a
 * spread of an installed manifest or repo record. Plugin loading uses the existing bound lifecycle.
 * @param input - Boot-scoped site ports, never a root inferred from env or cwd.
 * @param options - Engine DI for contract tests; production resolves the built Jini namespace.
 * @returns The read-only guide, with minimal cards even when no plugin is active.
 * @complexity O(1) composition; reads retain their owning services' costs.
 * @example createTovuSiteGuide({ deps }).run({ caller: { principalId }, operation: 'overview' });
 */
export function createTovuSiteGuide({ deps }: { deps: TovuSiteGuideDeps }, options: { engine?: SiteGuideEngine } = {}): SiteGuideService {
  const engine = options.engine ?? resolveSiteGuideEngine({});
  const lifecycle = deps.agentPluginLifecycle ?? createTovuAgentPluginLifecycle({ layout: deps.agentPluginLayout }, { bundledSourceRoot: bundledAgentPluginsDir() });
  const authorize = async ({ caller, permission }: { caller: { principalId: string }; permission: string }) =>
    (await deps.authorize({ principalId: caller.principalId, permission, workspaceId: deps.workspaceId })).allowed;
  const service = engine.createSiteGuide({
    builtInTopics: TOVU_CAPABILITY_CARDS, authorize,
    facts: { read: input => readSiteGuideFacts({ ...input, deps: siteGuideFactDeps({ deps, lifecycle }) }) },
    // The shell filters each contributed topic, pointer and workflow by its own permissions.
    loadContributions: async () => {
      return loadSiteGuideContributions({ workspaceId: deps.workspaceId, loadContributions: lifecycle.loadPluginContributions, engine });
    },
  });
  return { run: async (input, optional) => {
    const result = await service.run(input, optional);
    if (input.operation !== "overview") return result;
    return { ...(result as Record<string, unknown>), siteOrigin: deps.derivedPublicOrigin ?? null,
      navigationHint: deps.derivedPublicOrigin
        ? `Open this site at ${deps.derivedPublicOrigin}/. Preserve this exact scheme, host and port when using browser tools.`
        : "The listener origin is unavailable. Do not guess a localhost URL or its scheme." };
  } };
}
