import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { bundledContributionSources } from "../../bundled-contribution-sources.js";
import { parseMailAdaptersFile } from "../../mail-adapter-registry.js";

const sourceRoot = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const filename = "tovu-mail-adapters.json";
const sources = bundledContributionSources({ sourceRoot, filename });

test("bundled mail credential card check discovers contribution packages", () => {
  assert.ok(sources.length > 0, "a missing content root must not turn this check into a silent pass");
});

for (const { pluginId, packageRoot } of sources) {
  test(`${pluginId}: every labelled mail adapter supplies its own usable credential card`, () => {
    const parsed = parseMailAdaptersFile(readFileSync(path.join(packageRoot, filename), "utf8"));
    assert.ok(parsed.ok, `${pluginId}/${filename} must parse`);
    assert.ok(parsed.descriptors.length > 0, `${pluginId} must declare its mail adapters`);
    for (const descriptor of parsed.descriptors) {
      // The parser supplies a default credentialLabel too: omitting the label must not evade the rule.
      assert.ok(descriptor.credentialLabel.trim(), `${pluginId}/${descriptor.id}: missing saved label`);
      assert.equal(descriptor.credentialCardRefusal, undefined, `${pluginId}/${descriptor.id}: invalid card`);
      assert.ok(descriptor.credentialCard, `${pluginId}/${descriptor.id}: credentialLabel requires credentialCard`);
      for (const field of ["title", "intro", "helpUrl", "helpLabel", "keyHint", "baseUrl"] as const) {
        assert.ok(descriptor.credentialCard[field]?.trim(), `${pluginId}/${descriptor.id}: missing credentialCard.${field}`);
      }
    }
  });
}
