import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadPluginContributionsFromSource, type LoadPluginContributions } from "../../agent-plugins/lifecycle.js";
import { loadMediaProviderRegistry, MEDIA_PROVIDERS_FILENAME, parseMediaProvidersFile } from "../media-provider-registry.js";

/** A plugin-shaped vendor module; `providerId` lets a test make the manifest id disagree with it. */
function vendorModule(providerId: string): string {
  return `export default {
  provider: { id: ${JSON.stringify(providerId)}, label: "Acme Media", hint: "plugin vendor", integrated: true },
  models: [{ id: "acme-image-1", label: "acme-image-1", hint: "", provider: ${JSON.stringify(providerId)}, caps: ["t2i"], surface: "image" }],
  adapters: { image: { buildRequest: () => ({ url: "https://api.acme.example/v1", init: {}, meta: undefined }), parseResponse: async () => ({ bytes: new Uint8Array(), providerNote: "acme" }) } },
};
`;
}

/** Writes one plugin source directory and returns a loader that reads it with the real contribution code. */
async function pluginSource(t: test.TestContext, files: Record<string, string>): Promise<LoadPluginContributions> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-media-plugin-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), body);
  }
  return (async ({ definition }: { definition: Parameters<typeof loadPluginContributionsFromSource>[0]["definition"] }) =>
    loadPluginContributionsFromSource({ plugin: { pluginId: "acme-plugin", packageRoot: root }, definition })) as unknown as LoadPluginContributions;
}

const manifest = (providers: unknown[]) => JSON.stringify({ schemaVersion: 1, providers });

test("a plugin vendor loads into the built-in registry as one unit, labelled from its provider", async (t) => {
  const loadContributions = await pluginSource(t, { [MEDIA_PROVIDERS_FILENAME]: manifest([{ id: "acme_media", module: "vendor.mjs" }]), "vendor.mjs": vendorModule("acme-media") });
  const { registry, refusals } = await loadMediaProviderRegistry({ workspaceId: "ws" }, { loadContributions });
  assert.deepEqual(refusals, []);
  assert.equal(registry.findProvider({ id: "acme-media" })?.label, "Acme Media");
  assert.equal(registry.providers.get({ id: "acme_media" })?.label, "Acme Media");
  assert.equal(registry.providers.get({ id: "acme_media" })?.pluginId, "acme-plugin");
  assert.equal(registry.findModel({ id: "acme-image-1" })?.provider, "acme-media");
  assert.ok(registry.get({ providerId: "acme-media", routeKey: "image" }));
  assert.equal(registry.findProvider({ id: "openai" })?.label, "OpenAI", "built-ins stay registered");
});

test("a manifest label wins over the provider label", async (t) => {
  const loadContributions = await pluginSource(t, { [MEDIA_PROVIDERS_FILENAME]: manifest([{ id: "acme_media", module: "vendor.mjs", label: "Acme (beta)" }]), "vendor.mjs": vendorModule("acme-media") });
  const { registry } = await loadMediaProviderRegistry({ workspaceId: "ws" }, { loadContributions });
  assert.equal(registry.providers.get({ id: "acme_media" })?.label, "Acme (beta)");
});

test("a manifest id that is not the vendor's registry id is refused, naming both", async (t) => {
  const loadContributions = await pluginSource(t, { [MEDIA_PROVIDERS_FILENAME]: manifest([{ id: "acme", module: "vendor.mjs" }]), "vendor.mjs": vendorModule("acme-media") });
  const { registry, refusals } = await loadMediaProviderRegistry({ workspaceId: "ws" }, { loadContributions });
  assert.deepEqual(refusals, ["media provider 'acme' from 'acme-plugin' was not loaded: its module exports provider 'acme-media' (registry id 'acme_media')"]);
  assert.equal(registry.findProvider({ id: "acme-media" }), null);
});

test("a module that is not a contribution is refused before reaching the registry", async (t) => {
  const loadContributions = await pluginSource(t, { [MEDIA_PROVIDERS_FILENAME]: manifest([{ id: "acme_media", module: "vendor.mjs" }]), "vendor.mjs": "export default { provider: 'acme' };\n" });
  const { refusals } = await loadMediaProviderRegistry({ workspaceId: "ws" }, { loadContributions });
  assert.equal(refusals.length, 1);
  assert.match(refusals[0]!, /must export \{ provider, models, adapters \}/);
});

test("a vendor that takes a built-in id is refused by the registry, not thrown", async (t) => {
  const loadContributions = await pluginSource(t, { [MEDIA_PROVIDERS_FILENAME]: manifest([{ id: "openai", module: "vendor.mjs" }]), "vendor.mjs": vendorModule("openai") });
  const { registry, refusals } = await loadMediaProviderRegistry({ workspaceId: "ws" }, { loadContributions });
  assert.equal(refusals.length, 1);
  assert.match(refusals[0]!, /already registered by the built-in provider/);
  assert.equal(registry.findProvider({ id: "openai" })?.label, "OpenAI");
});

test("a loader fault degrades to the built-in vendors plus one refusal line", async () => {
  const loadContributions = (async () => { throw new Error("EACCES: plugin dir"); }) as unknown as LoadPluginContributions;
  const { registry, refusals } = await loadMediaProviderRegistry({ workspaceId: "ws" }, { loadContributions });
  assert.deepEqual(refusals, ["plugin media providers were not loaded: EACCES: plugin dir"]);
  assert.equal(registry.findProvider({ id: "openai" })?.label, "OpenAI");
});

/** One fake installed plugin: its manifest read and its module import, each of which may fault. */
interface FakePlugin {
  readonly pluginId: string;
  readonly providerId?: string;
  readonly readFault?: boolean;
  readonly importFault?: boolean;
  readonly exported?: unknown;
}

/**
 * A `LoadPluginContributions` fake with the shared loader's per-plugin semantics (read -> onReadError,
 * parse, then one contained import per descriptor); a fault the definition does not recover from
 * propagates, exactly as the real loader does.
 */
function fakeLoader(plugins: readonly FakePlugin[]): LoadPluginContributions {
  type Definition = Parameters<typeof loadPluginContributionsFromSource>[0]["definition"];
  return (async ({ definition }: { definition: Definition }) => {
    const items: unknown[] = [];
    const refusals: string[] = [];
    for (const spec of plugins) {
      const plugin = { pluginId: spec.pluginId, packageRoot: `/plugins/${spec.pluginId}` };
      const registryId = (spec.providerId ?? `${spec.pluginId}-media`).replaceAll("-", "_");
      if (spec.readFault) {
        const recovered = definition.onReadError?.({ plugin, error: Object.assign(new Error("EIO: read"), { code: "EIO" }) });
        if (recovered === undefined) throw new Error("EIO: read");
        refusals.push(...recovered);
        continue;
      }
      const parsed = definition.parse({ raw: manifest([{ id: registryId, module: "vendor.mjs" }]) });
      assert.ok(parsed.ok);
      for (const descriptor of parsed.descriptors) {
        const importModule = async () => {
          if (spec.importFault) throw new Error("EIO: containment");
          return { exported: spec.exported ?? vendorExport(spec.providerId ?? `${spec.pluginId}-media`) };
        };
        const loaded = await definition.load({ plugin, descriptor, importModule });
        if (typeof loaded === "string") refusals.push(loaded);
        else items.push(loaded);
      }
    }
    return { items, refusals };
  }) as unknown as LoadPluginContributions;
}

/** {@link vendorModule}'s export as a value, one image model `<providerId>-1`. */
function vendorExport(providerId: string): unknown {
  return {
    provider: { id: providerId, label: providerId, hint: "", integrated: true },
    models: [{ id: `${providerId}-1`, label: providerId, hint: "", provider: providerId, caps: ["t2i"], surface: "image" }],
    adapters: { image: { buildRequest: () => ({ url: "https://api.acme.example/v1", init: {}, meta: undefined }), parseResponse: async () => ({ bytes: new Uint8Array(), providerNote: "x" }) } },
  };
}

test("an unreadable manifest or a module I/O fault refuses only that plugin; healthy plugins before and after still load", async () => {
  const loadContributions = fakeLoader([
    { pluginId: "alpha" }, { pluginId: "bravo", readFault: true }, { pluginId: "charlie", importFault: true }, { pluginId: "delta" },
  ]);
  const { registry, refusals } = await loadMediaProviderRegistry({ workspaceId: "ws" }, { loadContributions });
  assert.deepEqual(refusals, [
    `media providers from 'bravo' were not loaded: ${MEDIA_PROVIDERS_FILENAME} could not be read`,
    "media provider 'charlie_media' from 'charlie' was not loaded: module could not be read or imported",
  ]);
  assert.equal(registry.findProvider({ id: "alpha-media" })?.label, "alpha-media");
  assert.equal(registry.findProvider({ id: "delta-media" })?.label, "delta-media");
  assert.equal(registry.findProvider({ id: "charlie-media" }), null);
});

test("a contribution that throws inside the registry is one plugin's refusal; later plugins still load", async () => {
  const exploding = { ...(vendorExport("bravo-media") as object), models: [{ provider: "bravo-media", get id(): string { throw new Error("boom"); } }] };
  const loadContributions = fakeLoader([{ pluginId: "alpha" }, { pluginId: "bravo", exported: exploding }, { pluginId: "charlie" }]);
  const { registry, refusals } = await loadMediaProviderRegistry({ workspaceId: "ws" }, { loadContributions });
  assert.deepEqual(refusals, ["media provider 'bravo_media' from 'bravo' was not loaded: its contribution could not be registered"]);
  assert.equal(registry.findProvider({ id: "bravo-media" }), null);
  assert.equal(registry.findProvider({ id: "alpha-media" })?.label, "alpha-media");
  assert.equal(registry.findProvider({ id: "charlie-media" })?.label, "charlie-media");
});

test("models: [undefined] is refused by the registry without failing boot", async () => {
  const loadContributions = fakeLoader([{ pluginId: "bravo", exported: { ...(vendorExport("bravo-media") as object), models: [undefined] } }, { pluginId: "charlie" }]);
  const { registry, refusals } = await loadMediaProviderRegistry({ workspaceId: "ws" }, { loadContributions });
  assert.equal(refusals.length, 1);
  assert.match(refusals[0]!, /must have an id and belong to provider 'bravo-media'/);
  assert.equal(registry.findProvider({ id: "charlie-media" })?.label, "charlie-media");
});

test("parseMediaProvidersFile accepts a well-formed file and keeps an optional label", () => {
  assert.deepEqual(parseMediaProvidersFile({ raw: manifest([{ id: "a", module: "a.mjs", extra: 1 }, { id: "b", module: "lib/b.mjs", label: "B" }]) }), {
    ok: true, descriptors: [{ id: "a", module: "a.mjs" }, { id: "b", module: "lib/b.mjs", label: "B" }],
  });
});

for (const [name, raw, reason] of [
  ["invalid JSON", "{", "not valid JSON"],
  ["a missing schemaVersion", JSON.stringify({ providers: [] }), "schemaVersion must be 1"],
  ["a non-object root", "[]", "schemaVersion must be 1"],
  ["providers that are not an array", JSON.stringify({ schemaVersion: 1, providers: {} }), "providers must be an array"],
  ["an entry that is not an object", manifest(["x"]), "providers[0] must be an object"],
  ["a non-string id", manifest([{ id: 1, module: "a.mjs" }]), "providers[0].id must be a string"],
  ["a module that is not .mjs", manifest([{ id: "a", module: "a.js" }]), "providers[0].module must be a relative path ending in .mjs"],
  ["an absolute module path", manifest([{ id: "a", module: "/a.mjs" }]), "providers[0].module must be a relative path ending in .mjs"],
  ["a non-string module", manifest([{ id: "a", module: 3 }]), "providers[0].module must be a relative path ending in .mjs"],
  ["a blank label", manifest([{ id: "a", module: "a.mjs", label: " " }]), "providers[0].label must be a non-empty string when present"],
  ["a non-string label", manifest([{ id: "a", module: "a.mjs", label: 2 }]), "providers[0].label must be a non-empty string when present"],
  ["a duplicate id", manifest([{ id: "a", module: "a.mjs" }, { id: "a", module: "b.mjs" }]), "providers[1].id 'a' is declared twice"],
] as const) {
  test(`parseMediaProvidersFile refuses ${name}`, () => {
    assert.deepEqual(parseMediaProvidersFile({ raw }), { ok: false, reason });
  });
}
