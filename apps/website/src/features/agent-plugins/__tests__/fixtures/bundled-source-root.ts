import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { agentPluginSourceDir } from "../../../../../../../development/test-support/agent-plugin-source.mjs";
import { SELECTED_AGENT_PLUGIN_PACKAGES } from "../../bundled-catalog.js";
import { forceRemove } from "./force-remove.js";

/**
 * @file Bundled source roots for tests that seed REAL bundled bytes.
 *
 * Plugins moved to per-plugin Jini packages (D-W1 onward) are no longer under
 * `content/agent-plugins/`. The build composes Tovu's own plugins plus each selected package
 * (`compose-bundled-agent-plugins.mjs`, which stages through npm); tests build the same set from
 * `agentPluginSourceDir`, so they need no npm and never pin a plugin to a folder it has left.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../../..");

export interface DisposableSourceRoot {
  readonly root: string;
  readonly dispose: () => Promise<void>;
}

async function copyPlugins(root: string, pluginIds: Iterable<string>): Promise<void> {
  for (const pluginId of pluginIds) {
    await cp(agentPluginSourceDir({ pluginId }), path.join(root, pluginId), { recursive: true });
  }
}

/** The whole shipped bundle (Tovu's own plugins plus every selected package) in a throwaway folder. */
export async function composedBundledSourceRoot(): Promise<DisposableSourceRoot> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-composed-bundle-"));
  await cp(path.join(REPO_ROOT, "content", "agent-plugins"), root, { recursive: true });
  await copyPlugins(root, SELECTED_AGENT_PLUGIN_PACKAGES.keys());
  return { root, dispose: () => forceRemove(root) };
}

/** A source root holding only `pluginIds`, each from where Tovu takes it (its selected package, or its content folder). */
export async function selectedPluginSourceRoot({ pluginIds }: { readonly pluginIds: readonly string[] }): Promise<DisposableSourceRoot> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-selected-plugins-"));
  await copyPlugins(root, pluginIds);
  return { root, dispose: () => forceRemove(root) };
}
