/**
 * @file Test seam extracted out of `agent-daemon-server.ts`'s `onStarted`: resolves a run's
 * pinned Agent Plugin refs into prompt-prefix text and prepends it onto the run's base prompt.
 *
 * `agent-daemon-server.ts` cannot be imported directly by a unit test without inheriting its own
 * import-time side effects (opens a DB connection, builds the tool registry, etc — see that
 * file's own module doc, `const routeDeps = ...` at its top level). This module has none: it
 * imports only `resolveAgentPluginLayout` and `resolveAgentPluginRefs`, both side-effect-free at
 * import time, so a test can import it directly and exercise the exact code `onStarted` runs.
 *
 * `agent-daemon-server.ts`'s `onStarted` is the only caller of either export below. Moving them
 * here changes WHERE they live, not what they do — see git history on this file's introduction
 * for the line-for-line move out of `onStarted`'s neighborhood.
 */
import type { RunStartHandler } from "@jini-ai/http-kit";

import { resolveAgentPluginLayout } from "../../../features/agent-plugins/layout.js";
import { resolveAgentPluginRefs } from "../../../features/agent-plugins/resolve-agent-plugin-refs.js";

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
  run: OnStartedContext["run"],
  pluginRefIds: readonly string[],
  runLifecycle: OnStartedContext["lifecycle"],
  workspaceId: string,
): Promise<string | null> {
  if (pluginRefIds.length === 0) return "";

  const workspaceLayout = resolveAgentPluginLayout().forWorkspace(workspaceId);
  const result = await resolveAgentPluginRefs(pluginRefIds, workspaceLayout);

  if (!result.ok) {
    // Same severity `resolveAttachmentRunFields` (in `agent-daemon-server.ts`) already gives an
    // unresolvable attachment: a pinned plugin the operator explicitly selected silently not
    // reaching the agent would be a confusing "why didn't it use what I picked" failure, worse
    // than an explicit, loud one.
    void runLifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false });
    console.error(`[agent-daemon] run ${run.id}: Agent Plugin resolution failed`, result.reason);
    return null;
  }

  return result.promptPrefix;
}

/**
 * Prepends a resolved Agent Plugin prompt-prefix onto a run's base prompt — split out from
 * {@link resolveAgentPluginPromptPrefix} because this half has no async/IO/failure path at all,
 * so a test can assert on it directly with zero setup. Mirrors `onStarted`'s own original guard:
 * an empty prefix (the common case — a run pinning no plugin ref) leaves `basePrompt` untouched
 * rather than prepending an empty section plus a blank-line separator for nothing.
 */
export function assemblePromptWithPluginPrefix(basePrompt: string, pluginPromptPrefix: string): string {
  return pluginPromptPrefix.length > 0 ? `${pluginPromptPrefix}\n\n${basePrompt}` : basePrompt;
}
