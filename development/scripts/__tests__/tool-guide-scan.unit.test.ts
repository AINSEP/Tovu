import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { scanToolGuides, type GuideSource, type ToolGuideNames } from "../lib/tool-guide-scan.js";

const NAMES: ToolGuideNames = {
  toolIds: ["theme_list_files", "theme_list", "credential_save", "load_agent_plugin", "menus_list", "content_read.menu", "agent_plugin_list"],
  localNames: ["execute_delegated_tool", "search_tools"],
  wireNames: ["tool_theme_files_ab12cd"],
  knownProperties: ["old_string", "theme_id"],
};

const guide = (text: string, path = "guide.ts"): GuideSource => ({ path, kind: "guide", text });
const scan = (...texts: string[]) => scanToolGuides({ names: NAMES, sources: texts.map((text) => guide(text)) });

test("a registered id in a sentence is a named mention in prose form", () => {
  const result = scan("Use theme_list_files to discover what a theme holds.");
  assert.deepEqual(result.named, [{ id: "theme_list_files", form: "prose", source: "guide.ts", kind: "guide" }]);
  assert.deepEqual(result.unknownCalls, []);
});

test("a call written with its arguments is named in call form", () => {
  const result = scan('Run `load_agent_plugin({pluginId:"x"})` first.');
  assert.deepEqual(result.named.map(({ id, form }) => [id, form]), [["load_agent_plugin", "call"]]);
});

test("the gateway's toolId names the tool in gateway form, and the gateway itself is named too", () => {
  const result = scan('Call execute_delegated_tool({"toolId":"credential_save","input":{}}) to store it.');
  assert.deepEqual(result.gatewayForm.map(({ id }) => id), ["credential_save"]);
  assert.deepEqual(result.named.map(({ id, form }) => [id, form]), [["execute_delegated_tool", "call"], ["credential_save", "gateway"]]);
  assert.deepEqual(scan("execute_delegated_tool toolId: 'menus_list'").gatewayForm.map(({ id }) => id), ["menus_list"]);
});

test("an id is never found inside a longer id, and a dotted id is matched whole", () => {
  assert.deepEqual(scan("See theme_list_files.").named.map(({ id }) => id), ["theme_list_files"]);
  assert.deepEqual(scan("Read content_read.menu now. Then theme_list.").named.map(({ id }) => id).sort(), ["content_read.menu", "theme_list"]);
  assert.deepEqual(scan("xtheme_list or theme_list2").named, []);
});

test("a backticked name that is no tool, in a domain the catalog has, is an unknown call", () => {
  assert.deepEqual(scan("Call `menus_list_menus` to see them.").unknownCalls, [{ token: "menus_list_menus", source: "guide.ts", kind: "guide" }]);
  assert.deepEqual(scan("Call menus_list_menus(x) to see them.").unknownCalls.map(({ token }) => token), ["menus_list_menus"]);
});

test("a tool-name template is an unknown call", () => {
  assert.deepEqual(scan("Each plugin adds agent_plugin_<id> to the list.").unknownCalls.map(({ token }) => token), ["agent_plugin_<id>"]);
});

test("SQL functions in a guide produce no mention and no unknown call", () => {
  const sql = "SELECT json_extract(data, '$.x') FROM t WHERE json_valid(data) AND json_each(data) AND json_quote(x)";
  assert.deepEqual(scan(sql), { named: [], gatewayForm: [], unknownCalls: [] });
});

test("a template placeholder, a helper in a non-guide file and JSON-schema syntax produce nothing", () => {
  assert.deepEqual(scan("${tool_name}(…)").unknownCalls, []);
  assert.deepEqual(scan("some_helper(arg)").unknownCalls, []);
  assert.deepEqual(scan('"type":"object","additional_properties":false').unknownCalls, []);
});

test("a declared argument or alias in backticks is not a call", () => {
  assert.deepEqual(scan("Send `old_string` and `theme_id` together.").unknownCalls, []);
});

test("a literal that equals a registered id is the descriptor's own id, not a mention", () => {
  assert.deepEqual(scan("theme_list_files").named, []);
  assert.deepEqual(scan("  theme_list_files\n").named, []);
});

test("a wire name is known: it is no unknown call", () => {
  assert.deepEqual(scan("Call `tool_theme_files_ab12cd` directly.").unknownCalls, []);
});

test("every mention carries the source path and kind it came from", () => {
  const result = scanToolGuides({ names: NAMES, sources: [{ path: "registry:theme_x", kind: "registry", text: "Use theme_list first." }] });
  assert.deepEqual(result.named, [{ id: "theme_list", form: "prose", source: "registry:theme_x", kind: "registry" }]);
});

test("the SQL json_* calls in the repository's own migrations are not findings", () => {
  const files = [
    "apps/website/src/platform/db/migrations/0003_coercion_json_as_json.ts",
    "apps/website/src/platform/db/sqlite/fresh-content-db.ts",
  ].filter((file) => existsSync(file));
  assert.equal(files.length, 2, "both fixtures exist");
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /json_\w+\(/, `${file} still contains a SQL json_ call`);
    assert.deepEqual(scan(text), { named: [], gatewayForm: [], unknownCalls: [] }, file);
  }
});
