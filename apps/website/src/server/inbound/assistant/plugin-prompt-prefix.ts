/**
 * @file Test seam extracted out of `agent-daemon-server.ts`'s `onStarted`: resolves a run's
 * pinned Agent Plugin refs into prompt-prefix text.
 *
 * `agent-daemon-server.ts` cannot be imported directly by a unit test without inheriting its own
 * import-time side effects (opens a DB connection, builds the tool registry, etc — see that
 * file's own module doc, `const routeDeps = ...` at its top level). This module has none: it
 * imports only the layout type, `resolveAgentPluginRefs` and the retired-ref map, all side-effect-free at
 * import time, so a test can import it directly and exercise the exact code `onStarted` runs.
 *
 * `agent-daemon-server.ts`'s `onStarted` is the only caller of the resolver below. Moving it
 * here changes WHERE it lives, not what it does — see git history on this file's introduction
 * for the line-for-line move out of `onStarted`'s neighborhood.
 */
import type { RunStartHandler } from "@jini-ai/daemon/http";

import type { AgentPluginLayout } from "@jini-ai/core/contracts/headless/plugin-host";
import { resolveAgentPluginRefs } from "../../../features/agent-plugins/lifecycle.js";
import { translateRetiredPluginRefs } from "../../../features/agent-plugins/bundled-catalog.js";

import { failRunBeforeStart } from "@jini-ai/daemon/session-coordination";

type OnStartedContext = Parameters<RunStartHandler>[0];

/**
 * Resolves this run's pinned Agent Plugin refs into the real prompt-prefix text `onStarted`
 * prepends to `prompt`, against `workspaceId`'s own Agent Plugin layout — never a shared/
 * instance-level or hardcoded layout, matching `layout.ts`'s own tenant-isolation rule that an
 * installed package is reachable only through its owning workspace's `forWorkspace()` result.
 *
 * A `null` return means resolution has already finished the run as `'failed'` and logged why —
 * the caller must abort rather than continue with an unaugmented (but otherwise normal-looking)
 * prompt. A run pinning no plugin ref (the common case) resolves to `""` with no filesystem
 * access at all (`resolveAgentPluginRefs`'s own empty-array fast path).
 */
export async function resolveAgentPluginPromptPrefix(
  input: {
    run: OnStartedContext["run"];
    pluginRefIds: readonly string[];
    runLifecycle: OnStartedContext["lifecycle"];
    workspaceId: string;
    agentPluginLayout: AgentPluginLayout;
  },
  _options = {},
): Promise<string | null> {
  const { run, pluginRefIds, runLifecycle, workspaceId, agentPluginLayout } = input;
  if (pluginRefIds.length === 0) return "";

  const workspaceLayout = agentPluginLayout.forWorkspace({ workspaceId });
  // A run saved before a plugin was retired still pins its old id (`RETIRED_PLUGIN_REPLACEMENTS` names the successor).
  const result = await resolveAgentPluginRefs({ pluginRefIds: translateRetiredPluginRefs({ pluginRefIds }), workspaceLayout });

  if (!result.ok) {
    // Same severity `resolveAttachmentRunFields` (in `agent-daemon-server.ts`) already gives an
    // unresolvable attachment: a pinned plugin the operator explicitly selected silently not
    // reaching the agent would be a confusing "why didn't it use what I picked" failure, worse
    // than an explicit, loud one.
    await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "The assistant could not start: a selected Agent Plugin could not be loaded." }, {});
    console.error(`[agent-daemon] run ${run.id}: Agent Plugin resolution failed`, result.reason);
    return null;
  }

  return result.promptPrefix;
}
