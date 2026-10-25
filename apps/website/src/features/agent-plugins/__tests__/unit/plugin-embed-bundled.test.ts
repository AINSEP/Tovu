/** OPUS-REVIEW T1: all bundled templates share CMS's single fragment/slot policy owner. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseAgentPluginManifest, validateAgentPluginExportProps, type AgentPluginExport } from "@jini-ai/agent-plugins/manifest";
import { fillPluginExportTemplate } from "@jini-ai/cms/widgets/html";

type Schema = NonNullable<AgentPluginExport["props"]["properties"]>[string];
function sample(schema: Schema): unknown {
  switch (schema.type) {
    case "object": return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, value]) => [key, sample(value)]));
    case "array": return [];
    case "string": return schema.enum?.[0] ?? "x".repeat(schema.minLength ?? 0);
    case "boolean": return false;
    case "null": return null;
    default: return schema.minimum ?? 0;
  }
}

test("T1: render each bundled export through the real slot filler and fragment validator", async () => {
  const root = path.resolve("content/agent-plugins");
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, "plugin.json");
    const raw = await readFile(manifestPath, "utf8").catch(error => { if (error.code === "ENOENT") return "null"; throw error; });
    const value = JSON.parse(raw);
    if (!value?.extensions?.tovu?.exports) continue;
    const parsed = parseAgentPluginManifest({ value });
    assert.ok(parsed.ok, `${entry.name}: invalid export manifest`);
    if (!parsed.ok) continue;
    for (const [component, definition] of Object.entries(parsed.manifest.exports ?? {})) {
      const props = sample(definition.props) as Record<string, unknown>;
      assert.equal(validateAgentPluginExportProps({ definition, props }), null);
      const host: Record<string, unknown> = Object.fromEntries(Object.keys(definition.hostLinks ?? {}).map(slot => [slot, "/api/host-controlled/start"]));
      host.assets = Object.fromEntries(Object.entries(definition.assets ?? {}).map(([slot, file]) => [slot, `/api/agent-plugin-exports/v1/${entry.name}/${component}/${file}`]));
      const html = fillPluginExportTemplate({ definition: { plugin: parsed.manifest.id!, component, ...definition, props,
        template: await readFile(path.join(root, entry.name, definition.template), "utf8"), host } });
      assert.ok(html.length, `${entry.name}/${component}: empty template`);
      assert.doesNotMatch(html, /data-embed-config|<script|<style/);
    }
  }
});
