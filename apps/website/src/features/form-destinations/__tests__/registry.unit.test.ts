import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { agentPluginSourceDir } from "../../../../../../development/test-support/agent-plugin-source.mjs";
import test from "node:test";

import { parseFormDestinationsFile } from "@jini-ai/cms/forms";
import { loadFormDestinationRegistryFromSource } from "../registry.js";
import type { FormDestinationDescriptor, FormDestinationModule, LoadedFormDestination } from "../types.js";

/** @file The form destination category's parse, module-shape and cross-plugin rules, and the real bundled file. */

// cloudflare ships from @jini-ai/agent-plugins/cloudflare (D-W3).
const PLUGIN_ROOT = agentPluginSourceDir({ pluginId: "cloudflare" });
const file = (destinations: unknown[]) => JSON.stringify({ schemaVersion: 1, destinations });
const cohosted = { id: "co", label: "Co", module: "d/co.mjs", receive: "co-hosted", hosts: ["host-a"] };
const receiving: FormDestinationModule = { pull: async () => ({ items: [], nextAfter: 0, hasMore: false }), ack: async () => ({ acknowledged: 0 }) };
const loaded = (descriptor: FormDestinationDescriptor, pluginId: string, module: FormDestinationModule = receiving): LoadedFormDestination => ({ descriptor, pluginId, module });

test("a valid file parses, keeping only declared fields", () => {
  const external = { id: "relay", label: "Relay", module: "d/relay.mjs", receive: "external", credentialLabel: "Relay key", extra: true };
  assert.deepEqual(parseFormDestinationsFile({ raw: file([cohosted, external, { id: "push", label: "Push", module: "push.mjs" }]) }), { ok: true, descriptors: [
    cohosted, { id: "relay", label: "Relay", module: "d/relay.mjs", receive: "external", credentialLabel: "Relay key" }, { id: "push", label: "Push", module: "push.mjs" },
  ] });
});

test("invalid files are refused with the field that is wrong", () => {
  const cases: [string, string][] = [
    ["{", "not valid JSON"],
    [JSON.stringify({ schemaVersion: 2, destinations: [] }), "schemaVersion must be 1"],
    [JSON.stringify({ schemaVersion: 1 }), "destinations must be an array"],
    [file(["x"]), "destinations[0] must be an object"],
    [file([{ ...cohosted, id: "Bad Id" }]), "destinations[0].id must be a lowercase hyphenated id"],
    [file([{ ...cohosted, label: " " }]), "destinations[0].label must be a non-empty string"],
    [file([{ ...cohosted, module: "d/co.js" }]), "destinations[0].module must be a relative path ending in .mjs"],
    [file([{ ...cohosted, module: "/abs/co.mjs" }]), "destinations[0].module must be a relative path ending in .mjs"],
    [file([{ ...cohosted, receive: "inbox" }]), "destinations[0].receive must be \"co-hosted\" or \"external\""],
    [file([{ ...cohosted, hosts: ["Host A"] }]), "destinations[0].hosts must be an array of hosting target ids"],
    [file([{ ...cohosted, hosts: undefined }]), "destinations[0].hosts must name at least one hosting target for a co-hosted receiver"],
    [file([{ ...cohosted, hosts: [] }]), "destinations[0].hosts must name at least one hosting target for a co-hosted receiver"],
    [file([{ ...cohosted, credentialLabel: "" }]), "destinations[0].credentialLabel must be a non-empty string"],
    [file([cohosted, cohosted]), "destinations[1].id 'co' is declared twice"],
  ];
  for (const [raw, reason] of cases) assert.deepEqual(parseFormDestinationsFile({ raw }), { ok: false, reason }, raw);
});

test("the bundled plugin's real file loads and resolves its hosting target to the D1 destination", async () => {
  const registry = await loadFormDestinationRegistryFromSource({ pluginId: "cloudflare", packageRoot: PLUGIN_ROOT });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map((entry) => [entry.pluginId, entry.descriptor]), [["cloudflare", {
    id: "cloudflare-d1", label: "Cloudflare (D1 in your account)", module: "form-destinations/cloudflare-d1.mjs", receive: "co-hosted", hosts: ["cloudflare-workers"],
  }]]);
  const lib = await import(pathToFileURL(path.join(PLUGIN_ROOT, "lib/forms.mjs")).href) as { pullFormSubmissions: unknown; acknowledgeFormSubmissions: unknown };
  const resolved = registry.resolve({ scope: "cloudflare-workers" });
  assert.equal(resolved?.module.pull, lib.pullFormSubmissions);
  assert.equal(resolved?.module.ack, lib.acknowledgeFormSubmissions);
});

test("a destination module whose default export is not an object is refused by name; installed loading orders by plugin id", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(path.join(tmpdir(), "tovu-form-dest-"));
  try {
    await writeFile(path.join(root, "tovu-form-destinations.json"), file([{ id: "bad", label: "Bad", module: "bad.mjs", receive: "external", credentialLabel: "Key" }]));
    await writeFile(path.join(root, "bad.mjs"), "export default 42;\n");
    const registry = await loadFormDestinationRegistryFromSource({ pluginId: "relay", packageRoot: root }, {});
    assert.deepEqual(registry.refusals, ["form destination 'bad' from 'relay' was not loaded: its module's default export is not an object"]);
    await writeFile(path.join(root, "tovu-form-destinations.json"), file([{ id: "incomplete", label: "Incomplete", module: "incomplete.mjs", receive: "external" }]));
    await writeFile(path.join(root, "incomplete.mjs"), "export default {};\n");
    const incomplete = await loadFormDestinationRegistryFromSource({ pluginId: "relay", packageRoot: root }, {});
    assert.deepEqual(incomplete.list(), []);
    assert.deepEqual(incomplete.refusals, ["form destination 'incomplete' from 'relay' was not loaded: a destination that receives submissions needs pull() and ack()"]);
  } finally { await rm(root, { recursive: true, force: true }); }

  const { loadFormDestinationRegistry } = await import("../registry.js");
  const seen: unknown[] = [];
  const registry = await loadFormDestinationRegistry({ workspaceId: "ws" }, { loadContributions: (async (input: { workspaceId: string }, options: unknown) => {
    seen.push({ workspaceId: input.workspaceId, options });
    return { items: [loaded(cohosted as FormDestinationDescriptor, "cloudflare")], refusals: ["an upstream refusal"] };
  }) as never });
  assert.deepEqual(seen, [{ workspaceId: "ws", options: { orderByPluginId: true } }]);
  assert.deepEqual(registry.refusals, ["an upstream refusal"]);
});
