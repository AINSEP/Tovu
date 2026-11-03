/** Cross-build imports must scan bundled artifacts without mistaking their API vocabulary for secrets. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as yauzl from "yauzl";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { buildArchiveManifest } from "../archive-manifest.js";
import { createShareArchiveReader } from "../import-archive-reader.js";
import { verifySiteImport } from "../import-verifier.js";
import { buildManifestInventory, checkArchiveMatchesInventory, parseShareManifest, readListedFiles, scanArchiveMetadata } from "../import-verifier-inventory.js";
import { readBundledImportPluginIds } from "../package-file-inventory.js";
import { requireShareSecretFree } from "../share-file-policy.js";

const timeout = 20_000;
const schema = { index: 1, tag: "fixture" };
const sourceDigest = "b".repeat(64), recipientDigest = "a".repeat(64);
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const pluginFiles = new Map([
  ["agent-plugins/github/package/source-control/write-files.mjs", Buffer.from("/** @param {{ authorization: string }} input */\nexport const write = () => {};\n")],
  ["agent-plugins/github/package/locales/tovu-source-control.json", Buffer.from('{"API token":"Token de API","Access token":"Token de acceso","Personal access token":"Token personal"}')],
  ["agent-plugins/fly/package/plugin.json", Buffer.from('{"name":"fly","tools":["deployment_ops_set_secret"]}')],
  ["agent-plugins/fly/package/skills/deploy/SKILL.md", Buffer.from("Use Authorization: Bearer <API_KEY> to authenticate.")],
  ["agent-plugins/github/package/NOTES.md", Buffer.from("Authorization: Bearer <ACCESS_TOKEN>")],
  ["agent-plugins/cloudflare/package/lib/forms.mjs", Buffer.from('throw new Error("CLOUDFLARE_API_TOKEN_REQUIRED");')],
  ["agent-plugins/railway/package/deploy-configs/regions.json", Buffer.from('{"regions":["us-west2","europe-west4-drams3a"]}')],
]);

/** A real ZIP with a source-build digest absent from the receiving build's inventory. */
async function fixture(changes: ReadonlyMap<string, Buffer> = new Map()) {
  const files = new Map([["content.db", Buffer.from("source database")], ["settings.json", Buffer.from("{}")], ...pluginFiles, ...changes]);
  const packages = [...new Set([...files.keys()].flatMap(file => /^(agent-plugins|plugins)\/[^/]+\/package\//.exec(file)?.[0] ?? []))];
  const manifest = buildArchiveManifest({ schema, site: { name: "Cross-build site" }, scopes: { database: true, media: true, themes: true, plugins: true, settings: true },
    plugins: packages.map(root => ({ kind: root.startsWith("agent-plugins/") ? "agent" : "site", id: root.split("/")[1]!, version: "0.1.25", digest: sourceDigest, enabled: true, shipped: true })), media: [],
    files: [...files].map(([file, bytes]) => ({ path: file, bytes: bytes.length, sha256: sha(bytes) })),
  });
  files.set("manifest.json", Buffer.from(manifest));
  const picked = [...files].map(([name, bytes]) => {
    const file = new File([bytes as BlobPart], name.split("/").at(-1)!);
    Object.defineProperty(file, "webkitRelativePath", { value: "pick/" + name });
    return file;
  });
  const archive = Buffer.from(await (await zipFolderFiles({ files: picked, maxBytes: 1024 * 1024 })).arrayBuffer());
  // None of these source files need match this build's bytes; that is the cross-version contract.
  const packageFiles = new Map([[recipientDigest, new Map([["plugin.json", sha(Buffer.from('{"name":"github","version":"next"}'))]])]]);
  let sanitized = false;
  const verify = () => verifySiteImport({ archive, reader: createShareArchiveReader({ yauzl }), schema,
    sanitize: async ({ snapshot }) => {
      sanitized = true;
      assert.deepEqual(snapshot, files.get("content.db"));
      return { bytes: Buffer.from("recipient database"), media: [] };
    },
  }, { packageFiles });
  return { verify, files, wasSanitized: () => sanitized };
}

test("built-in package labels, JSDoc and placeholders import across build digests", { timeout }, async () => {
  const h = await fixture();
  const result = await h.verify();
  assert.equal(result.name, "Cross-build site");
  assert.deepEqual(result.database, Buffer.from("recipient database"));
  for (const [file, bytes] of pluginFiles) assert.deepEqual(result.files.get(file), bytes, file);
  assert.deepEqual(result.trustedPlugins, [], "scan policy must not grant execution trust to a different build");
  assert.equal(result.modified.size, 0, "a genuine source-build digest is not an edited package");
});

const secrets = [
  ["GitHub", () => ["gh", "p_"].join("") + "x".repeat(36)],
  ["OpenAI", () => ["sk", "-"].join("") + "x".repeat(48)],
  ["AWS", () => ["AK", "IA"].join("") + "A".repeat(16)],
  ["PEM", () => `-----BEGIN ${["PRIVATE", "KEY"].join(" ")}-----\n${"A".repeat(64)}\n-----END ${["PRIVATE", "KEY"].join(" ")}-----`],
  ["JWT", () => ["eyJ" + "a".repeat(12), "eyJ" + "b".repeat(12), "c".repeat(16)].join(".")],
] as const;

for (const [kind, secret] of secrets) {
  for (const file of ["agent-plugins/github/package/source-control/write-files.mjs", "agent-plugins/unknown/package/readme.txt", "agent-plugins/github/memory/notes/note.md", "themes/site/notes.txt", "themes/site/asset.bin"]) {
    test(`${kind} secret in ${file} stays included with a safe warning`, { timeout }, async () => {
      const prefix = file.endsWith(".bin") ? Buffer.from([0, 255, 0]) : Buffer.from("ordinary content\n");
      const bytes = Buffer.concat([pluginFiles.get(file) ?? prefix, Buffer.from("\n" + secret())]);
      const h = await fixture(new Map([[file, bytes]]));
      const imported = await h.verify();
      assert.ok(imported.files.has(file.startsWith("themes/site/") ? file.replace("themes/site/", "themes/untrusted/site/") : file));
      assert.ok(imported.credentialWarnings!.some(warning => warning.path === file), "name the included archive path");
      assert.equal(JSON.stringify(imported.credentialWarnings).includes(secret()), false);
      assert.ok([...imported.files.values()].some(content => content.includes(Buffer.from(secret()))));
      assert.equal(h.wasSanitized(), true, "the same projection verifies retained content");
    });
  }
}

for (const file of ["agent-plugins/unknown/package/locales/es.json", "agent-plugins/github/memory/notes/note.md", "plugins/github/package/locales/es.json", "themes/site/labels.json"]) {
  test(`credential labels still get strict import scanning in ${file}`, { timeout }, async () => {
    const h = await fixture(new Map([[file, Buffer.from('{"API token":"Token de API"}')]]));
    const imported = await h.verify();
    assert.ok(imported.files.has(file.startsWith("themes/site/") ? file.replace("themes/site/", "themes/untrusted/site/") : file));
    assert.ok(imported.credentialWarnings!.some(warning => warning.path === file));
    assert.equal(h.wasSanitized(), true);
  });
}

test("package labels stay included independently of bundled identity", { timeout }, () => {
  const file = `agent-plugins/ws/w/github/package/sha256/${sourceDigest}/locales/es.json`;
  assert.equal(requireShareSecretFree({ path: file, bytes: pluginFiles.get("agent-plugins/github/package/locales/tovu-source-control.json")! }), true);
});

test("an unknown import id cannot borrow a bundled digest and file hash to relax its scan", { timeout }, () => {
  const file = `agent-plugins/ws/w/unknown/package/sha256/${recipientDigest}/locales/es.json`;
  const bytes = Buffer.from('{"API token":"Token de API"}');
  const packageFiles = new Map([[recipientDigest, new Map([["locales/es.json", sha(bytes)]])]]);
  assert.equal(requireShareSecretFree({ path: file, bytes }, { packageFiles, bundledImportPluginIds: new Set(["github"]) }), true);
});

// Optional private repro: exercise every actual ZIP file without retaining client bytes in the repo
// or passing its database to a test sanitizer. The synthetic fixture above is the portable regression.
test("a supplied local repro ZIP passes inventory and secret scanning", { timeout, skip: !process.env.TOVU_SITE_BACKUP_REPRO_ZIP }, async () => {
  const archive = await readFile(process.env.TOVU_SITE_BACKUP_REPRO_ZIP!);
  const reader = createShareArchiveReader({ yauzl });
  const scan = await scanArchiveMetadata({ archive, reader });
  const manifest = parseShareManifest({ manifestBytes: scan.manifestBytes, schema: JSON.parse(scan.manifestBytes.toString()).schema });
  const inventory = buildManifestInventory({ files: manifest.files });
  checkArchiveMatchesInventory({ inventory, fileAliases: scan.fileAliases, directories: scan.directories });
  const files = await readListedFiles({ archive, reader, inventory, manifestBytes: scan.manifestBytes, wrapper: scan.wrapper, manifest, modified: new Set() }, { packageFiles: new Map(), bundledImportPluginIds: await readBundledImportPluginIds() });
  assert.equal(files.size, inventory.size);
});
