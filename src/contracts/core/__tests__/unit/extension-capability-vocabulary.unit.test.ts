import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { SHARED_EXTENSION_CAPABILITIES } from "../../extension-capability-vocabulary.js";
import { validateManifest } from "../../../../features/plugin-runtime/manifest.js";
import { validateGlueManifest } from "../../../../features/site-glue/manifest.js";

/**
 * @file Guards the single-source-of-truth invariant this module exists for: `content.read` /
 * `content.extend` / `hooks.attach` must be declared exactly once, here, and consumed by import
 * identity from both `plugin-runtime/manifest.ts` and `site-glue/manifest.ts` — never re-typed as
 * a private literal in either sibling.
 *
 * The import-identity assertions below are deliberately NOT a value comparison. Comparing the two
 * features' accepted capability *values* would still pass even if a future edit reintroduced two
 * independently hand-typed `["content.read", "content.extend", "hooks.attach"]` literals — the
 * exact drift this module exists to prevent, and indistinguishable from the shared-import case by
 * runtime behavior alone (three immutable string literals behave identically regardless of which
 * declaration produced them). Only checking that each sibling file's own source still imports
 * `SHARED_EXTENSION_CAPABILITIES` from this module — rather than re-declaring it — catches that
 * regression. The behavioral test at the bottom is a supplementary smoke check that the refactor
 * itself didn't change validation outcomes; it is not the regression guard.
 */

const SHARED_IMPORT_PATTERN =
  /import\s*\{[^}]*SHARED_EXTENSION_CAPABILITIES[^}]*\}\s*from\s*["']\.\.\/\.\.\/core\/extension-capability-vocabulary\.js["'];?/;

function readSiblingSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

test("plugin-runtime's manifest imports the shared vocabulary rather than re-declaring it", () => {
  const source = readSiblingSource("../../../features/plugin-runtime/manifest.ts");
  assert.match(
    source,
    SHARED_IMPORT_PATTERN,
    "plugin-runtime/manifest.ts must import SHARED_EXTENSION_CAPABILITIES from core/ — a private " +
      "re-declaration of the same three strings would not be caught by any behavioral test"
  );
});

test("site-glue's manifest imports the shared vocabulary rather than re-declaring it", () => {
  const source = readSiblingSource("../../../features/site-glue/manifest.ts");
  assert.match(
    source,
    SHARED_IMPORT_PATTERN,
    "site-glue/manifest.ts must import SHARED_EXTENSION_CAPABILITIES from core/ — a private " +
      "re-declaration of the same three strings would not be caught by any behavioral test"
  );
});

test("site-glue's capability gate imports the shared vocabulary rather than re-declaring it", () => {
  const source = readSiblingSource("../../../features/site-glue/capability-gate.ts");
  assert.match(
    source,
    SHARED_IMPORT_PATTERN,
    "site-glue/capability-gate.ts must import SHARED_EXTENSION_CAPABILITIES from core/ — a " +
      "private re-declaration of the same three strings would not be caught by any behavioral test"
  );
});

test("neither sibling imports the other feature's manifest module", () => {
  // Scoped to actual import specifiers (`from ".../site-glue/..."`), not prose — both files'
  // headers legitimately *mention* the sibling mechanism by name when explaining why the shared
  // vocabulary lives in core/ instead of one importing the other.
  const importPathPattern = (siblingDir: string) => new RegExp(`from\\s+["'][^"']*/${siblingDir}/`);
  const pluginSource = readSiblingSource("../../../features/plugin-runtime/manifest.ts");
  const glueSource = readSiblingSource("../../../features/site-glue/manifest.ts");
  assert.doesNotMatch(
    pluginSource,
    importPathPattern("site-glue"),
    "plugin-runtime must not import from site-glue"
  );
  assert.doesNotMatch(
    glueSource,
    importPathPattern("plugin-runtime"),
    "site-glue must not import from plugin-runtime"
  );
});

test("(supplementary, not the regression guard) both validators still accept exactly the shared vocabulary", () => {
  for (const capability of SHARED_EXTENSION_CAPABILITIES) {
    const pluginResult = validateManifest({
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

    const glueResult = validateGlueManifest({
      manifest: {
        id: "sample",
        version: "1.0.0",
        sdkRange: "^1.0.0",
        capabilities: [capability],
        attachments: [],
      },
    });
    assert.equal(
      glueResult.errors.some((error) => error.code === "CAPABILITY_UNKNOWN"),
      false,
      `site-glue must accept shared capability '${capability}'`
    );
  }
});
