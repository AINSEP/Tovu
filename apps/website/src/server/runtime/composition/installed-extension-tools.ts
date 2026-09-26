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
import { registerEnabledPluginCapabilityTools } from "#src/features/plugin-runtime/capability-tool-registrations";
import { registerInstalledSkillTools } from "#src/features/skills/tool-registrations";

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
    await registerInstalledAgentPluginTools(registry, { workspaceId: deps.workspaceId });
  } catch (error) {
    console.warn(
      `${log} agent-plugin tools could not be registered, continuing without them — ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    await registerInstalledSkillTools(registry, { workspaceId: deps.workspaceId });
  } catch (error) {
    console.warn(
      `${log} skill tools could not be registered, continuing without them — ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    await registerEnabledPluginCapabilityTools(registry, {
      authorize: deps.authorize,
      workspaceId: deps.workspaceId,
      postRepo: deps.postRepo,
      discoverPlugins: deps.discoverPlugins,
      pluginActivationRepo: deps.pluginActivationRepo,
    });
  } catch (error) {
    console.warn(
      `${log} plugin capability tools could not be registered, continuing without them — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
