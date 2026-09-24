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
 * Each of the three registrars is awaited individually and wrapped in its OWN `try/catch` — not one
 * catch around all three — so one family's unreadable disk tree (a corrupt plugin package, an
 * unparsable `SKILL.md`) does not also withhold the other two, matching the original three
 * independent blocks this file replaces. `log` is the calling process's own console-prefix
 * (`"[agent-daemon]"` / `"[assistant-byok]"`), so the warning text a reader already recognizes from
 * the daemon's boot log is unchanged for that caller.
 *
 * Both real callers need this to run, and be fully applied to the registry, BEFORE they snapshot that
 * registry into a `search_tools` index (`buildToolCatalogQuery` — a one-shot FTS build; a tool
 * registered after it is executable but invisible to search): `agent-daemon-server.ts` awaits this
 * call directly inside `start()`, before its own `buildToolCatalogQuery`; `byok-tool-surface.ts`
 * exposes the same promise as its returned surface's `ready` field, which
 * `modules/assistant-byok.ts`'s turn route awaits once before dispatching a turn.
 */
import type { ToolRegistration } from "@jini-ai/core";

import { registerInstalledAgentPluginTools } from "../features/agent-plugins/tool-registrations.js";
import { registerInstalledSkillTools } from "../features/skills/tool-registrations.js";
import {
  registerEnabledPluginCapabilityTools,
  type PluginCapabilityToolDeps,
} from "../features/plugin-runtime/capability-tool-registrations.js";
import type { PluginDiscoveryRecord } from "../features/plugin-runtime/discovery.js";

/** Everything {@link registerInstalledExtensionTools} needs from its caller: the plugin-capability
 *  family's own deps (`workspaceId`, `authorize`, `postRepo`, `pluginActivationRepo` —
 *  {@link PluginCapabilityToolDeps}), plus `discoverPlugins`, the one field that family's own
 *  `registerEnabledPluginCapabilityTools` declares as an inline addition rather than part of that
 *  type (see that function's own signature). The agent-plugin and skill registrars need only
 *  `workspaceId`, which this already carries. */
export interface InstalledExtensionToolDeps extends PluginCapabilityToolDeps {
  readonly discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
}

/** Registers every installed Agent Plugin, installed Agent Skill, and enabled plugin-runtime
 *  capability tool directly onto `registry`, in that fixed order. Never throws or rejects: each of
 *  the three sub-registrations degrades independently, on its own disk read failing open, to a
 *  `console.warn` naming the family and the underlying error, matching this repo's other optional
 *  extension registrars. A workspace with nothing installed in any of the three families is the
 *  common case, and costs three fast, empty reads.
 *  @complexity O(p + s + c) in the installed-plugin, installed-skill, and enabled-capability counts
 *  for this one workspace — each family's own loader is the cost driver, not this function. */
export async function registerInstalledExtensionTools(
  registry: { readonly register: (registration: ToolRegistration) => void },
  deps: InstalledExtensionToolDeps,
  log: string,
): Promise<void> {
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
}
