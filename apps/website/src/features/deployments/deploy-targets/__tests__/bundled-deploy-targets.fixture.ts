import path from "node:path";

import { loadDeployTargetRegistryFromSource } from "../registry.js";
import type { DeployTargetRegistry } from "../types.js";

/**
 * @file Test fixture: the deploy registry read straight from the bundled `deploy` plugin's source
 * (`content/agent-plugins/deploy`), the same hermetic registry `app.ts` composes. For tests whose
 * subject needs the real host declarations (credential fields, config fields) but no install.
 */

const BUNDLED_DEPLOY_PLUGIN_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/deploy");

let cached: Promise<DeployTargetRegistry> | undefined;

/** The bundled deploy registry, loaded once per test process. Matches `loadDeployTargets`' shape. */
export function loadBundledDeployTargets(): Promise<DeployTargetRegistry> {
  cached ??= loadDeployTargetRegistryFromSource({ pluginId: "deploy", packageRoot: BUNDLED_DEPLOY_PLUGIN_ROOT });
  return cached;
}
