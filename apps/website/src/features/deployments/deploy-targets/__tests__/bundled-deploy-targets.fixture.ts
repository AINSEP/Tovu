import { processComposedBundledSourceRoot } from "#src/features/agent-plugins/__tests__/fixtures/bundled-source-root";

import { loadBundledDeployTargetRegistry } from "../registry.js";
import type { DeployTargetRegistry } from "../types.js";

/**
 * @file Test fixture: the deploy registry read straight from every bundled plugin's source
 * (Tovu's `content/agent-plugins/*` plus each selected `@jini-ai/agent-plugins/<id>`, composed as the
 * build composes them), the same hermetic registry `app.ts` composes. For tests whose
 * subject needs the real host declarations (credential fields, config fields) but no install.
 */

let cached: Promise<DeployTargetRegistry> | undefined;

/** The bundled deploy registry, loaded once per test process. Matches `loadDeployTargets`' shape. */
export function loadBundledDeployTargets(): Promise<DeployTargetRegistry> {
  cached ??= processComposedBundledSourceRoot().then((sourceRoot) => loadBundledDeployTargetRegistry({ sourceRoot }));
  return cached;
}

/** Every env var the bundled hosts read a credential from (token vars and extra fields), so a
 *  hermetic "nothing configured" fixture can clear exactly the names the product reads. */
export async function bundledDeployEnvVars(): Promise<string[]> {
  return (await loadBundledDeployTargets()).list().flatMap(({ descriptor }) => [...(descriptor.env?.tokenVars ?? []), ...Object.values(descriptor.env?.fields ?? {})]);
}
