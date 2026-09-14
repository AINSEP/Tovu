import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FS_ROOT_DESCRIPTORS } from "../../../fs-files/layout.js";
import { pluginAgentToolCatalog } from "../../agent-tools.js";

/**
 * @file Guards agent-facing guidance against telling the model that no tool can enable an Agent
 * Plugin. `plugins_set_enabled` has covered the Agent Plugin family (`family: "agent-plugin"`) since
 * 2026-09-09, behind a human confirmation dialog — but guidance written without checking kept saying
 * the admin screen was the only way, so a model following it never offers the tool that exists.
 *
 * The first test pins the premise against the real catalog; if the Agent Plugin family is ever
 * removed from `plugins_set_enabled`, it fails, and the other two must be revisited with it rather
 * than left asserting guidance about a tool that no longer does this.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../..");
const AGENT_PLUGINS_CONTENT = path.join(REPO_ROOT, "content", "agent-plugins");

/** Phrasings of "no tool can enable an Agent Plugin" found in shipped guidance. */
const CANNOT_ENABLE_CLAIMS = [
  /no tool call (?:that )?enables an agent plugin/i,
  /no assistant tool wraps/i,
  /must be enabled, and you cannot do it/i,
];

function claimsIn(text: string): string[] {
  return CANNOT_ENABLE_CLAIMS.filter((claim) => claim.test(text)).map((claim) => claim.source);
}

test("premise: plugins_set_enabled accepts the 'agent-plugin' family", () => {
  const tool = pluginAgentToolCatalog.find((entry) => entry.name === "plugins_set_enabled");
  assert.ok(tool, "plugins_set_enabled is missing from pluginAgentToolCatalog");
  assert.match(JSON.stringify(tool.inputSchema), /"agent-plugin"/);
});

test("the custom fs root's description names plugins_set_enabled for enabling tovuize-site, and never claims no tool can", () => {
  const custom = FS_ROOT_DESCRIPTORS.find((descriptor) => descriptor.id === "custom");
  assert.ok(custom, "no 'custom' root descriptor");
  assert.deepEqual(claimsIn(custom.description), []);
  assert.match(custom.description, /plugins_set_enabled/);
  assert.match(custom.description, /family 'agent-plugin'/);
});

test("no bundled Agent Plugin markdown tells the model it cannot enable a plugin", () => {
  const markdownFiles = (fs.readdirSync(AGENT_PLUGINS_CONTENT, { recursive: true }) as string[]).filter((file) =>
    file.endsWith(".md"),
  );
  assert.ok(markdownFiles.length > 0, `no markdown found under ${AGENT_PLUGINS_CONTENT}`);
  const offenders = markdownFiles.flatMap((file) =>
    claimsIn(fs.readFileSync(path.join(AGENT_PLUGINS_CONTENT, file), "utf8")).map((claim) => `${file}: ${claim}`),
  );
  assert.deepEqual(offenders, []);
});
