import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { buildFormDestinationRegistry, loadFormDestinationRegistryFromSource, parseFormDestinationsFile } from "../registry.js";
import type { FormDestinationDescriptor, FormDestinationModule, LoadedFormDestination } from "../types.js";

/** @file The form destination category's parse, module-shape and cross-plugin rules, and the real bundled file. */

const PLUGIN_ROOT = path.resolve(import.meta.dirname, "../../../../../../content/agent-plugins/cloudflare");
const file = (destinations: unknown[]) => JSON.stringify({ schemaVersion: 1, destinations });
const cohosted = { id: "co", label: "Co", module: "d/co.mjs", receive: "co-hosted", hosts: ["host-a"] };
const receiving: FormDestinationModule = { pull: async () => ({ items: [], nextAfter: 0, hasMore: false }), ack: async () => ({ acknowledged: 0 }) };
const loaded = (descriptor: FormDestinationDescriptor, pluginId: string, module: FormDestinationModule = receiving): LoadedFormDestination => ({ descriptor, pluginId, module });

test("a valid file parses, keeping only declared fields", () => {
  const external = { id: "relay", label: "Relay", module: "d/relay.mjs", receive: "external", credentialLabel: "Relay key", extra: true };
  assert.deepEqual(parseFormDestinationsFile(file([cohosted, external, { id: "push", label: "Push", module: "push.mjs" }])), { ok: true, descriptors: [
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
  for (const [raw, reason] of cases) assert.deepEqual(parseFormDestinationsFile(raw), { ok: false, reason }, raw);
});

test("a module missing what its receive mode needs is dropped with the reason", () => {
  const registry = buildFormDestinationRegistry({ refusals: ["earlier refusal"], loaded: [
    loaded(cohosted as FormDestinationDescriptor, "p1", { pull: receiving.pull }),
    loaded({ id: "relay", label: "R", module: "r.mjs", receive: "external" }, "p2"),
    loaded({ id: "push", label: "P", module: "p.mjs" }, "p3", {}),
    loaded({ id: "ok-push", label: "P", module: "p.mjs" }, "p4", { deliver: async () => undefined }),
  ] });
  assert.deepEqual(registry.list().map((entry) => entry.descriptor.id), ["ok-push"]);
  assert.deepEqual(registry.refusals, [
    "earlier refusal",
    "form destination 'co' from 'p1' was not loaded: a destination that receives submissions needs pull() and ack()",
    "form destination 'relay' from 'p2' was not loaded: an external receiver needs prepare()",
    "form destination 'push' from 'p3' was not loaded: a destination that does not receive submissions needs deliver()",
  ]);
});

test("an id two plugins declare, and a host two co-hosted destinations claim, are dropped for both", () => {
  const registry = buildFormDestinationRegistry({ refusals: [], loaded: [
    loaded(cohosted as FormDestinationDescriptor, "p2"),
    loaded(cohosted as FormDestinationDescriptor, "p1"),
    loaded({ id: "one", label: "1", module: "1.mjs", receive: "co-hosted", hosts: ["shared", "only-one"] }, "p3"),
    loaded({ id: "two", label: "2", module: "2.mjs", receive: "co-hosted", hosts: ["shared"] }, "p4"),
    loaded({ id: "three", label: "3", module: "3.mjs", receive: "co-hosted", hosts: ["host-c", "host-c"] }, "p5"),
  ] });
  assert.deepEqual(registry.list().map((entry) => entry.descriptor.id), ["three"]);
  assert.deepEqual(registry.refusals, [
    "form destination 'co' was not loaded: more than one plugin declares it ('p1', 'p2')",
    "form receiver for host 'shared' was not loaded: more than one co-hosted destination claims it ('p3', 'p4')",
  ]);
  assert.equal(registry.resolve({ scope: "only-one" }), undefined, "a dropped destination resolves nothing, even for its unshared host");
});

test("resolve maps a saved scope by destination id or by co-hosted host; get is by id only", () => {
  const relay = loaded({ id: "relay", label: "R", module: "r.mjs", receive: "external" }, "p2", { ...receiving, prepare: async () => ({ submitUrl: "https://r.example" }) });
  const registry = buildFormDestinationRegistry({ refusals: [], loaded: [loaded(cohosted as FormDestinationDescriptor, "p1"), relay] });
  assert.equal(registry.resolve({ scope: "host-a" })?.descriptor.id, "co");
  assert.equal(registry.resolve({ scope: "relay" }), relay);
  assert.equal(registry.resolve({ scope: "co" })?.descriptor.id, "co");
  assert.equal(registry.resolve({ scope: "unknown" }), undefined);
  assert.equal(registry.get("host-a"), undefined);
  assert.equal(registry.get("relay"), relay);
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
