import path from "node:path";

import type { RepositoryTargetValidator } from "../../provider-module.js";
import { loadSourceControlProviderRegistryFromSource, type LoadSourceControlProviders } from "../../provider-registry.js";
import { agentPluginSourceDir } from "../../../../../../../development/test-support/agent-plugin-source.mjs";

/** The bundled `github` plugin's package root in this repository. */
export const GITHUB_PACKAGE_ROOT = agentPluginSourceDir({ pluginId: "github" });

/** The bundled `github` plugin read from its source directory (no install or activation gate), so a
 *  suite never reads the developer's real workspace. */
export const githubFromSource: LoadSourceControlProviders = (_workspaceId) => loadSourceControlProviderRegistryFromSource({ pluginId: "github", packageRoot: GITHUB_PACKAGE_ROOT });

/** The bundled `github` plugin module's own owner/repo check, read from source. */
export async function githubValidateTarget(): Promise<RepositoryTargetValidator> {
  const validate = (await githubFromSource("")).get("github")?.module.validateTarget;
  if (!validate) throw new Error("the github plugin module ships no validateTarget");
  return validate;
}
