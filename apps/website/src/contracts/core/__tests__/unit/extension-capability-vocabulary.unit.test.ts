import { pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { SHARED_EXTENSION_CAPABILITIES } from "../../extension-capability-vocabulary.js";
import { validateManifest } from "@jini-ai/plugins/host";

/**
 * @file Guards the single-source-of-truth invariant this module exists for: `content.read` /
 * `content.extend` / `hooks.attach` must be declared exactly once, here, and consumed by import
 * identity by the plugin host binding supplied to Jini's manifest validator — never re-typed
 * as a private literal in the host.
 *
 * The import-identity assertion below is deliberately NOT a value comparison. Comparing accepted
 * capability *values* would still pass even if a future edit reintroduced an independently
 * hand-typed `["content.read", "content.extend", "hooks.attach"]` literal — the
 * exact drift this module exists to prevent, and indistinguishable from the shared-import case by
 * runtime behavior alone (three immutable string literals behave identically regardless of which
 * declaration produced them). Only checking that the host binding's own source still imports
 * `SHARED_EXTENSION_CAPABILITIES` from this module — rather than re-declaring it — catches that
 * regression. The behavioral test at the bottom is a supplementary smoke check that the shared binding
 * itself didn't change validation outcomes; it is not the regression guard.
 */

const SHARED_IMPORT_PATTERN =
  /import\s*\{[^}]*SHARED_EXTENSION_CAPABILITIES[^}]*\}\s*from\s*["']\.\.\/\.\.\/contracts\/core\/extension-capability-vocabulary\.js["'];?/;

function readSiblingSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

test("plugin-runtime's manifest imports the shared vocabulary rather than re-declaring it", () => {
  const source = readSiblingSource("../../../../features/plugin-runtime/host-binding.ts");
  assert.match(
    source,
    SHARED_IMPORT_PATTERN,
    "plugin-runtime/manifest.ts must import SHARED_EXTENSION_CAPABILITIES from core/ — a private " +
      "re-declaration of the same three strings would not be caught by any behavioral test"
  );
});

test("(supplementary, not the regression guard) the plugin validator still accepts the shared vocabulary", () => {
  const required = ["content.read", "content.extend", "hooks.attach"];
  assert.deepEqual([...SHARED_EXTENSION_CAPABILITIES].sort(), [...required].sort());
  for (const capability of required) {
    const pluginResult = validateManifest({ ...pluginHostBinding,
      manifest: {
        id: "sample",
        name: "Sample",
        version: "1.0.0",
        sdkRange: "^1.0.0",
        engine: 1,
        tier: "tier-1",
        capabilities: [capability],
        hooks: [],
        fields: [],
        integrity: {},
      },
      folderName: "sample",
      builtInIds: [],
    });
    assert.equal(
      pluginResult.errors.some((error) => error.code === "CAPABILITY_UNKNOWN"),
      false,
      `plugin-runtime must accept shared capability '${capability}'`
    );
  }
});
