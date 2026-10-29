import path from "node:path";

import { loadCredentialSchemeRegistryFromSource, type CredentialSchemeRule } from "../../agent-plugins/auth-schemes.js";

/**
 * @file Test fixture: the self-describing token scheme rules read straight from the neutral
 * `example-host` fixture plugin (`fixtures/example-host/tovu-credential-schemes.json`), with no
 * install. Core stays vendor-neutral: the real vendor rule this shape is modelled on (Fly.io's
 * `FlyV1`) is tested inside the Fly plugin itself (`content/agent-plugins/fly/__tests__/`). For
 * tests whose subject needs shipped-shaped rules; pass {@link loadFixtureAuthSchemes} as
 * `CredentialedRequestDeps.loadAuthSchemes`.
 */

export const EXAMPLE_HOST_PLUGIN_ROOT = path.resolve(import.meta.dirname, "fixtures/example-host");

let cached: Promise<readonly CredentialSchemeRule[]> | undefined;

/** The fixture scheme rules, loaded once per test process. Matches `loadAuthSchemes`' shape. */
export function loadFixtureAuthSchemes(): Promise<readonly CredentialSchemeRule[]> {
  cached ??= loadCredentialSchemeRegistryFromSource({ pluginId: "example-host", packageRoot: EXAMPLE_HOST_PLUGIN_ROOT }).then((registry) => {
    if (registry.refusals.length > 0) throw new Error(`fixture credential schemes were refused: ${registry.refusals.join("; ")}`);
    return registry.rules;
  });
  return cached;
}
