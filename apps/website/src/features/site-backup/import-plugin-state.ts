import { restoreImportedPluginState as restore, type ImportPluginStateDeps } from "@jini-ai/devops/backup/site/import-plugin-state";
import type { ImportedExtensionState } from "@jini-ai/devops/backup/site/import-plugin-state";
import type { AgentPluginLayout } from "@jini-ai/core/contracts/headless/plugin-host";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { findSoonAgentPlugin } from "#src/features/agent-plugins/soon-lock";
import { bundledAgentPluginsDir, readTemplate } from "#src/platform/site-dir/index";
import { validateSharePath } from "./share-file-policy.js";

/** Seed only THIS install's code before applying imported activation choices by plugin id.
 * Shipped code remains quarantined (see the devops module for the per-plugin decision).
 * @complexity O(local bundled package bytes + imported memory bytes), bounded by share caps.
 */
export async function restoreImportedPluginState(required: { root: string; dir: string; layout: AgentPluginLayout; state: ImportedExtensionState; files: readonly string[] }, optional: { sourceRoot?: string } = {}): Promise<ReadonlySet<string>> {
  const deps: ImportPluginStateDeps = {
    sourceRoot: optional.sourceRoot ?? bundledAgentPluginsDir(),
    createLifecycle: ({ layout, sourceRoot }) => createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: sourceRoot }),
    // A "Soon" plugin is locked off (`agent-plugins/soon-lock.ts`, owner 2026-11-10): written off
    // rather than refused, so one locked plugin never aborts the rest of the import.
    findSoonAgentPlugin: ({ catalog, workspaceRoot, pluginId }) => findSoonAgentPlugin({ catalog: catalog as Parameters<typeof findSoonAgentPlugin>[0]["catalog"], workspaceRoot, pluginId }),
    starterWorkspaceId: () => readTemplate({ templateId: "starter" }).seed.workspace.id,
    validatePath: validateSharePath,
  };
  return restore({ ...required, deps });
}
