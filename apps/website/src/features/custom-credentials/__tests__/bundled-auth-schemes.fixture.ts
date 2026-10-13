import path from "node:path";

import { loadCredentialSchemeRegistryFromSource, type CredentialSchemeRule } from "../auth-schemes.js";

/**
 * @file Test fixture: the self-describing token scheme rules read straight from the bundled `fly`
 * plugin's source (`content/agent-plugins/fly/tovu-credential-schemes.json`), with no install. For
 * tests whose subject needs the real shipped rules; pass {@link loadBundledAuthSchemes} as
 * `CredentialedRequestDeps.loadAuthSchemes`.
 */

export const BUNDLED_FLY_PLUGIN_ROOT = path.resolve(import.meta.dirname, "../../../../../../content/agent-plugins/fly");

let cached: Promise<readonly CredentialSchemeRule[]> | undefined;

/** The bundled scheme rules, loaded once per test process. Matches `loadAuthSchemes`' shape. */
export function loadBundledAuthSchemes(): Promise<readonly CredentialSchemeRule[]> {
  cached ??= loadCredentialSchemeRegistryFromSource({ pluginId: "fly", packageRoot: BUNDLED_FLY_PLUGIN_ROOT }).then((registry) => {
    if (registry.refusals.length > 0) throw new Error(`bundled credential schemes were refused: ${registry.refusals.join("; ")}`);
    return registry.rules;
  });
  return cached;
}
