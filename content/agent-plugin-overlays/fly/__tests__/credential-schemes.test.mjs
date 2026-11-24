import assert from "node:assert/strict";
import test from "node:test";

import { detectSelfDescribingAuthScheme, parseCredentialSchemesFile } from "@jini-ai/integrations/credentialed-http";
import { loadCredentialSchemeRegistryFromSource } from "@jini-ai/agent-plugins/site/auth-schemes";

import { loadPluginContributionsFromSource } from "../../../../apps/website/src/features/agent-plugins/lifecycle.ts";
import { agentPluginSourceDir } from "../../../../development/test-support/agent-plugin-source.mjs";

/**
 * @file Moved from core (`apps/website/src/features/custom-credentials/__tests__/auth-schemes.unit.test.ts`)
 * into the Fly plugin: vendor tests live with the vendor. Core's credential-scheme tests now run
 * against a neutral `example-host` fixture plugin; this file pins the real rule Fly ships. Every token
 * is SYNTHETIC, never a real credential.
 */

// fly ships from @jini-ai/agent-plugins/fly: read it where Tovu takes it from.
const PACKAGE_ROOT = agentPluginSourceDir({ pluginId: "fly" });

test("the bundled fly plugin ships exactly one rule, fly-io, sending FlyV1 for a FlyV1 prefix", async () => {
  const registry = await loadCredentialSchemeRegistryFromSource({ pluginId: "fly", packageRoot: PACKAGE_ROOT, loadFromSource: loadPluginContributionsFromSource, parseCredentialSchemesFile });
  assert.deepEqual(registry.rules, [{ id: "fly-io", prefix: "FlyV1", scheme: "FlyV1" }]);
  assert.deepEqual(registry.refusals, []);
});

test("detect: a token starting with FlyV1 splits into scheme 'FlyV1' and everything after it as the value", async () => {
  const { rules } = await loadCredentialSchemeRegistryFromSource({ pluginId: "fly", packageRoot: PACKAGE_ROOT, loadFromSource: loadPluginContributionsFromSource, parseCredentialSchemesFile });
  assert.deepEqual(detectSelfDescribingAuthScheme({ token: "FlyV1fake_test_token_value", rules }), { scheme: "FlyV1", value: "fake_test_token_value" });
});
