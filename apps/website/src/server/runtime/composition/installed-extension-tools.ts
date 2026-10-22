/**
 * @file Registers the three optional, workspace-scoped extension-tool families — installed Agent
 * Plugins, installed Agent Skills, and enabled plugin-runtime capability tools (Word Count today) —
 * onto one `ToolRegistry`. Extracted from `agent-daemon-server.ts`'s `start()` (where the three blocks
 * used to live inline, each with its own placement/ordering/fail-open rationale repeated three times)
 * so `byok-tool-surface.ts` can call the IDENTICAL sequence, in the IDENTICAL order, with the
 * IDENTICAL fail-open behavior, rather than growing a second hand-written copy that could drift the
 * way `process-root-parity.test.ts` exists to catch (F4a,
 * `ADS-memory/.local-artifacts/tool-design-audit-2026-09-24.md`) — before this file, BYOK mode could
 * not see an installed Agent Plugin's tool, an installed Agent Skill's tool, or an enabled
 * plugin-capability tool at all, even though the daemon path already could.
 *
 * Lives in the composition root, not `assistant/` (moved 2026-09-26): its three registrars are
 * feature code (`agent-plugins`, `skills`, `plugin-runtime`), and `assistant/` importing them by
 * value closed the `assistant <-> features/agent-plugins` / `assistant <-> features/plugins` module
 * cycles `check:architecture` refuses. `assistant/installed-extension-tools.ts`'s
 * `attachAssistantToolExtensions` now receives this function as its injected `registerInstalled`;
 * both real callers (`agent-daemon-server.ts`, `modules/assistant-byok.ts`) pass it.
 *
 * Each of the three registrars is awaited individually and wrapped in its OWN `try/catch` — not one
 * catch around all three — so one family's unreadable disk tree (a corrupt plugin package, an
 * unparsable `SKILL.md`) does not also withhold the other two, matching the original three
 * independent blocks this file replaces. `log` is the calling process's own console-prefix
 * (`"[agent-daemon]"` / `"[assistant-byok]"`), so the warning text a reader already recognizes from
 * the daemon's boot log is unchanged for that caller.
 */
import type { InstalledExtensionRegistrar } from "#src/assistant/installed-extension-tools";
import { registerInstalledAgentPluginTools } from "#src/features/agent-plugins/tool-registrations";
import { createRetiredPluginToolAliases } from "#src/features/agent-plugins/retired-plugin-tool-aliases";
import { registerEnabledPluginCapabilityTools } from "#src/features/plugin-runtime/capability-tool-registrations";
import { registerInstalledSkillTools } from "#src/features/skills/tool-registrations";
import { registerAgentPluginExecutableTools } from "#src/features/agent-plugins/executable-tools/register";
import { agentPluginActivations } from "#src/features/agent-plugins/activation-effects";
import { applyToolApprovalPolicy } from "#src/assistant/tool-approval-policy";

/** Registers every installed Agent Plugin, installed Agent Skill, and enabled plugin-runtime
 *  capability tool directly onto `registry`, in that fixed order. Never throws or rejects: each of
 *  the three sub-registrations degrades independently, on its own disk read failing open, to a
 *  `console.warn` naming the family and the underlying error, matching this repo's other optional
 *  extension registrars. A workspace with nothing installed in any of the three families is the
 *  common case, and costs three fast, empty reads.
 *  @complexity O(p + s + c) in the installed-plugin, installed-skill, and enabled-capability counts
 *  for this one workspace — each family's own loader is the cost driver, not this function. */
export const registerInstalledExtensionTools: InstalledExtensionRegistrar = async (registry, deps, log) => {
  try {
    // A retired plugin's tool name (`agent_plugin_deploy`) stays a gated alias of its successor's.
    const aliases = createRetiredPluginToolAliases({ registry });
    await registerInstalledAgentPluginTools(aliases.registry, deps);
    aliases.registerAliases();
  } catch (error) {
    warnFamilySkipped({ log, family: "agent-plugin tools", error });
  }

  try {
    await registerInstalledSkillTools(registry, deps);
  } catch (error) {
    warnFamilySkipped({ log, family: "skill tools", error });
  }

  await registerExecutableAgentPluginTools(deps, log);

  try {
    await registerEnabledPluginCapabilityTools(registry, {
      authorize: deps.authorize,
      workspaceId: deps.workspaceId,
      postRepo: deps.postRepo,
      discoverPlugins: deps.discoverPlugins,
      pluginActivationRepo: deps.pluginActivationRepo,
      pluginContributions: deps.pluginContributions,
      executablePluginToolRegistry: deps.executablePluginToolRegistry,
      // AW-7 Tier 2: a tier-2 plugin's tool computes a fresh result through this process's registry.
      ...(deps.previewPluginBeforeSave ? { previewPluginBeforeSave: deps.previewPluginBeforeSave } : {}),
    });
  } catch (error) {
    warnFamilySkipped({ log, family: "plugin capability tools", error });
  }
};

/** Registers executable Agent Plugin tools when the composition bound their host ports and a
 *  confirmation transport; otherwise the family is skipped. Fails open like the other families.
 *  @complexity O(t) in the contributed tool count; see `registerAgentPluginExecutableTools`. */
async function registerExecutableAgentPluginTools(deps: Parameters<InstalledExtensionRegistrar>[1], log: string): Promise<void> {
  const { agentPluginTools: host, surfaces, executablePluginToolRegistry: registry } = deps;
  if (!host || !surfaces || !registry) return;
  try {
    const workspaceRoot = deps.agentPluginLayout.forWorkspace(deps.workspaceId).root;
    const { refusals } = await registerAgentPluginExecutableTools({
      registry, workspaceId: deps.workspaceId, host, authorize: deps.authorize,
      // Fresh per call and fail-closed: anything but a readable "active" verdict denies.
      isActive: async ({ pluginId }) => (await agentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId })).verdict === "active",
      applyApproval: ({ registration }, { disclose }) => applyToolApprovalPolicy({ registration, surfaces }, { disclose }),
    });
    for (const refusal of refusals) console.warn(`${log} ${refusal}`);
  } catch (error) {
    warnFamilySkipped({ log, family: "executable agent-plugin tools", error });
  }
}

/** One family's registration failed: log it with the registrar's prefix and continue without it
 * (every family is optional — a broken install must never take the whole tool pass down). O(1). */
function warnFamilySkipped({ log, family, error }: { log: string; family: string; error: unknown }, _options = {}): void {
  console.warn(`${log} ${family} could not be registered, continuing without them — ${error instanceof Error ? error.message : String(error)}`);
}
