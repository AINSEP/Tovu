import { ApiError, authenticatedAdminRequest } from "@/lib/admin-http/request";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import type { ComposerCapabilitySource } from "@jini-ai/admin/screens/plugins/composer-capabilities";
import type { ResolveComposerDiscoveryOutcomeDeps } from "@jini-ai/admin/screens/plugins/resolve-composer-discovery-outcome";
import { createInstalledSkillsComposerCapabilitySource } from "@jini-ai/agent-plugins/react/installed-skills-composer-source";
import { SKILLS_CHANGED_EVENT, loadSkillDraft } from "@/features/skills/api";
import { getAssistantDockOpen, subscribeToAssistantDock } from "@jini-ai/admin/shell/lib/assistant-dock-bus";
import { useCallback } from "react";
import { type ComposerDiscoveryOutcome, type ComposerDiscoverySelection } from "@jini-ai/chat/react";

import { navigate } from "@jini-ai/admin/shell/lib/router";
import { startVisibleInterval } from "@jini-ai/ui/visible-interval";
import { useAdminBootScope } from "@jini-ai/admin/shell/lib/admin-boot-scope";
import { createBundledComposerCapabilitySource, resolveTovuComposerDiscoveryRoute } from "@/features/plugins/composer-capabilities";
import { useComposerCapabilities as useAdminComposerCapabilities, useComposerDiscoverySelect as useAdminComposerDiscoverySelect } from "@jini-ai/admin/shell/components/AssistantDock/hooks/composer-discovery.hooks";
import type { UseComposerCapabilities } from "@jini-ai/admin/shell/components/AssistantDock/hooks/composer-discovery.hooks";
import type { ComposerCapabilityProjection } from "@jini-ai/admin/screens/plugins/composer-capabilities";

function createInstalledSource() {
  // One source per authenticated boot scope and document (same-origin site/API, fixed workspace).
  // No module singleton can retain another user's installed capabilities.
  return createInstalledSkillsComposerCapabilitySource({
    request: authenticatedAdminRequest, path: `/workspaces/${WORKSPACE_ID}/skills`,
    isNotModified: error => error instanceof ApiError && error.status === 304,
    reportFailure: (message, error) => console.error(message, error),
  }, {}) satisfies ComposerCapabilitySource;
}

function watchComposerCapabilities(
  { refreshVisible: reload, forceReload }: Parameters<Parameters<typeof useAdminComposerCapabilities>[0]["watch"]>[0],
  _options: Record<string, never> = {},
): () => void {
  let stopPolling = () => {};
  const refreshVisible = () => {
    if (document.visibilityState !== "hidden") void reload();
  };
  // Polling belongs to the dock's visible lifetime, including an unfocused visible window.
  const syncPolling = (_required = {}, _options = {}) => {
    stopPolling();
    if (getAssistantDockOpen() && document.visibilityState !== "hidden") {
      stopPolling = startVisibleInterval({ tick: () => { void reload(); }, periodMs: 60_000 });
    }
  };
  const visibilityChanged = () => { syncPolling(); refreshVisible(); };
  const skillsChanged = () => { forceReload(); };
  const stopDockSubscription = subscribeToAssistantDock(() => {
    syncPolling();
    if (getAssistantDockOpen()) refreshVisible();
  });
  syncPolling();
  window.addEventListener(SKILLS_CHANGED_EVENT, skillsChanged);
  window.addEventListener("focus", refreshVisible);
  document.addEventListener("visibilitychange", visibilityChanged);
  return () => {
    stopPolling();
    stopDockSubscription();
    window.removeEventListener(SKILLS_CHANGED_EVENT, skillsChanged);
    window.removeEventListener("focus", refreshVisible);
    document.removeEventListener("visibilitychange", visibilityChanged);
  };
}

const reportFailure = (error: unknown) => console.error("[AssistantDock] composer capability projection failed", error);

/**
 * Projects the composer's discovery catalog (debate 2, "Composer slash commands") from the bundled,
 * compile-time source and installed skills, refreshed on open, changes, focus and visibility,
 * plus a conditional check every 60 seconds while the dock is open and the document visible. Split out of
 * `AssistantDock` (2026-08-14 DI migration pass) for the same reason the three hooks above it were:
 * per `INFO.md`'s Components rule 3, any hook doing DOM/IO work gets an injectable seam on
 * `AssistantDockProps`, defaulted to this real implementation — see `AssistantDock.tsx` for the
 * wiring.
 *
 * The raw tool catalog is deliberately NOT in the source list: the menu's job is to let a user point
 * the assistant at a Skill or Agent Plugin whose instructions it should follow, not to hand it a raw
 * tool name (the assistant already picks its own tools once it understands the goal). The ~25 live
 * tool rows that source contributed were also structurally inert — every capability it produces
 * carried no `resolve`, so selecting one did nothing. The unused source and its dedicated tests
 * were removed after confirming that no production code imports them.
 *
 * Starts empty while asynchronous sources load; stale responses are discarded. Installed-source
 * failures leave bundled commands available. The raw tool catalog is intentionally excluded.
 *
 * @returns `composerCapabilities` — the resolved projection, or the empty one before it settles.
 * @complexity O(n) time/space per refresh for n capabilities; at most one pending ordinary check.
 * @example
 * const { composerCapabilities } = useComposerCapabilities();
 */
export function useComposerCapabilities(
  _input: Record<string, never> = {},
  { useBootScope = useAdminBootScope }: { useBootScope?: typeof useAdminBootScope } = {},
): UseComposerCapabilities {
  return useAdminComposerCapabilities({
    useBootScopeHook: useBootScope, createInstalledSource,
    createBundledSource: createBundledComposerCapabilitySource,
    watch: watchComposerCapabilities, reportFailure,
  });
}

/**
 * Wraps {@link resolveComposerDiscoveryOutcome} as the `onDiscoverySelect` callback
 * `AssistantDock.tsx` passes to `<ChatPane composerSlots={...}>`. Pure derivation/wiring, not I/O
 * of its own — `navigate` is a synchronous client-side route change (already a plain import, not a
 * seam anywhere else in this file), and `callAllowlistedTool` is supplied by the caller (the same
 * `mcpUiToolCaller` singleton registered for MCP-UI surfaces), so this hook has nothing of its own
 * to inject; no `INFO.md` rule-3 seam.
 *
 * @param input.composerCapabilities - {@link UseComposerCapabilities.composerCapabilities} — the
 *   live discovery-catalog projection.
 * @param input.callAllowlistedTool - {@link ResolveComposerDiscoveryOutcomeDeps.callAllowlistedTool}.
 * @param input.addPluginRef - {@link ResolveComposerDiscoveryOutcomeDeps.addPluginRef}.
 * @returns The memoized `onDiscoverySelect` callback.
 * @example
 * const handleComposerDiscoverySelect = useComposerDiscoverySelect({
 *   composerCapabilities,
 *   callAllowlistedTool: mcpUiToolCaller,
 *   addPluginRef,
 * });
 */
export function useComposerDiscoverySelect(
  { composerCapabilities, callAllowlistedTool, addPluginRef, skillsAvailable, addSkill, readDraft }: {
    composerCapabilities: ComposerCapabilityProjection;
    callAllowlistedTool: ResolveComposerDiscoveryOutcomeDeps["callAllowlistedTool"];
    addPluginRef?: ResolveComposerDiscoveryOutcomeDeps["addPluginRef"];
    skillsAvailable?: boolean;
    addSkill?: ResolveComposerDiscoveryOutcomeDeps["addSkill"];
    readDraft?: ResolveComposerDiscoveryOutcomeDeps["readDraft"];
  },
): (selection: ComposerDiscoverySelection) => Promise<ComposerDiscoveryOutcome | void> {
  const navigateRoute = useCallback((routePath: string) => navigate({ routePath }), []);
  return useAdminComposerDiscoverySelect({
    composerCapabilities, callAllowlistedTool,
    ...(addPluginRef === undefined ? {} : { addPluginRef }),
    ...(skillsAvailable === undefined ? {} : { skillsAvailable }),
    ...(addSkill === undefined ? {} : { addSkill }),
    ...(readDraft === undefined ? {} : { readDraft }),
    navigate: navigateRoute, resolveRoute: resolveTovuComposerDiscoveryRoute, loadSkillDraft,
  });
}

export function useComposerCapabilitiesSeam({ override }: { override: typeof useComposerCapabilities | undefined }, _options: Record<string, never> = {}
): UseComposerCapabilities {
  return (override ?? useComposerCapabilities)();
}

