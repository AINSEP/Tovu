import { useState } from "react";

import {
  findBundledAgentPluginSourceFile,
  getBundledAgentPluginSourceFiles,
  type BundledAgentPluginSourceFile,
} from "../agent-plugin-source-catalog";

/**
 * @file `AgentPluginDetailsModal`'s file-tree selection state, split out of the component per the
 * `use-<thing>.hooks.ts` convention `use-plugins.hooks.ts` uses for this same feature.
 *
 * No `-port.hooks.ts`/`-dependencies.hooks.ts` pair: `getBundledAgentPluginSourceFiles`/
 * `findBundledAgentPluginSourceFile` are pure, compile-time-closed lookups over the allowlist in
 * `agent-plugin-source-catalog.ts` (see that file's own header — no path/loading adapter, no IO,
 * selecting a row can never become an arbitrary file read), the same "pure, no host boundary"
 * category `describeApiError` sits in for `use-plugins.hooks.ts`. There is nothing to inject a
 * fake for.
 */

export interface AgentPluginDetailsModalController {
  /** The plugin's full catalogued file list — `[]` for an unrecognized plugin id. */
  files: readonly BundledAgentPluginSourceFile[];
  /** The currently selected file, or `null` only when `files` itself is empty. */
  selectedFile: BundledAgentPluginSourceFile | null;
  /** Selects a file by its `relativePath` — an unrecognized path leaves the current selection in
   *  place, since `selectedFile`'s own fallback chain never resolves to `null` while `files` has
   *  entries. */
  selectFile: (relativePath: string) => void;
}

/**
 * Owns which of a bundled plugin's source files is showing in the modal's content pane.
 *
 * @param pluginId - The plugin whose bundled files to list — see
 *   {@link getBundledAgentPluginSourceFiles}'s own closed lookup.
 * @returns `files`, the currently `selectedFile`, and `selectFile` to change it.
 * @complexity Time/space: O(n) in the plugin's file count per lookup — a fixed, compile-time-small
 *   list (the `ui-ux-design` plugin catalogues 44 files), not a caller-controlled collection.
 */
export function useAgentPluginDetailsModal(pluginId: string): AgentPluginDetailsModalController {
  const files = getBundledAgentPluginSourceFiles(pluginId);
  const [selectedPath, setSelectedPath] = useState(files[0]?.relativePath ?? "");
  const selectedFile = findBundledAgentPluginSourceFile(files, selectedPath) ?? files[0] ?? null;

  return { files, selectedFile, selectFile: setSelectedPath };
}
