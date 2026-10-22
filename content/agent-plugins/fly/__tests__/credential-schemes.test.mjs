import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { detectSelfDescribingAuthScheme } from "@jini-ai/integrations/credentialed-http";

import { loadCredentialSchemeRegistryFromSource } from "../../../../apps/website/src/features/custom-credentials/auth-schemes.ts";

/**
 * @file Moved from core (`apps/website/src/features/custom-credentials/__tests__/auth-schemes.unit.test.ts`)
 * into the Fly plugin: vendor tests live with the vendor. Core's credential-scheme tests now run
 * against a neutral `example-host` fixture plugin; this file pins the real rule Fly ships. Every token
 * is SYNTHETIC, never a real credential.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

test("the bundled fly plugin ships exactly one rule, fly-io, sending FlyV1 for a FlyV1 prefix", async () => {
  const registry = await loadCredentialSchemeRegistryFromSource({ pluginId: "fly", packageRoot: PACKAGE_ROOT });
  assert.deepEqual(registry.rules, [{ id: "fly-io", prefix: "FlyV1", scheme: "FlyV1" }]);
  assert.deepEqual(registry.refusals, []);
});

test("detect: a token starting with FlyV1 splits into scheme 'FlyV1' and everything after it as the value", async () => {
  const { rules } = await loadCredentialSchemeRegistryFromSource({ pluginId: "fly", packageRoot: PACKAGE_ROOT });
  assert.deepEqual(detectSelfDescribingAuthScheme({ token: "FlyV1fake_test_token_value", rules }), { scheme: "FlyV1", value: "fake_test_token_value" });
});
