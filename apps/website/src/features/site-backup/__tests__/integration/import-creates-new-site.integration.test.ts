import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { createSiteImportBackend } from "../../import-backend.js";
import { buildShareZip } from "../../share-zip.js";
import { ENCRYPTED_KEYS_DESCRIPTOR, SAVED_KEYS_PATH, type SiteSavedKeysPort } from "../../saved-keys-port.js";
import { restoreStagedImport } from "#src/server/runtime/composition/site-portability";
import { readTemplate } from "#src/platform/site-dir/read-template";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { importFixture, OWNER_PASSWORD } from "../import.fixture.js";

type Harness = Awaited<ReturnType<typeof importFixture>>;
type Backend = ReturnType<typeof createSiteImportBackend>;
const principalId = "owner";

function tree(required: { root: string }): unknown[] {
  return fs.readdirSync(required.root, { recursive: true, withFileTypes: true }).map(entry => {
    const file = path.join(entry.parentPath, entry.name), relative = path.relative(required.root, file);
    return entry.isDirectory() ? [relative, "directory"] : [relative, fs.statSync(file).size,
      createHash("sha256").update(fs.readFileSync(file)).digest("hex")];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

async function pending(required: { backend: Backend; archive: Buffer }) {
  const { uploadId } = await required.backend.upload({ principalId, archive: required.archive });
  return required.backend.importBackup({ principalId, source: { uploadId } });
}

async function existing(required: { h: Harness }) {
  const { h } = required, imported = await pending({ backend: h.backend, archive: h.archive });
  const ready = await h.backend.completeOwner({ principalId, importId: imported.importId, adminPassword: OWNER_PASSWORD });
  const site = h.workspace.registry({}).list({}).find(row => row.id === ready.newSiteId)!;
  const dbPath = resolveSiteDatabasePaths({ dir: site.path }, { workspace: h.workspace }).contentDbPath;
  return { site, dbPath, before: tree({ root: site.path }), database: fs.readFileSync(dbPath) };
}

async function keysArchive(required: { h: Harness }): Promise<Buffer> {
  return buildShareZip({ plan: { ...required.h.plan, encryptedKeys: ENCRYPTED_KEYS_DESCRIPTOR,
    bufferedFiles: [...required.h.plan.bufferedFiles!, { path: SAVED_KEYS_PATH, content: Buffer.from("historical encrypted-key fixture") }] }, zip: zipFolderFiles });
}

function assertExisting(required: { s: Awaited<ReturnType<typeof existing>> }): void {
  assert.deepEqual(tree({ root: required.s.site.path }), required.s.before);
  assert.deepEqual(fs.readFileSync(required.s.dbPath), required.s.database);
}

// Mutation: collisionSafe: false in createImportedSite prevents the second successful import.
test("a same-name archive creates a suffixed new site and leaves existing site S byte-identical", { timeout: 120000 }, async t => {
  const h = await importFixture(t), s = await existing({ h });
  const imported = await pending({ backend: h.backend, archive: h.archive });
  const ready = await h.backend.completeOwner({ principalId, importId: imported.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.status, "ready");
  assert.notEqual(ready.newSiteId, s.site.id);
  assert.equal(ready.newSiteName, s.site.name + "-2");
  assert.equal(h.workspace.registry({}).list({}).length, 2);
  assertExisting({ s });
});

// Mutation: remove the fallback exclusion in restoreStagedImport; the live-tree comparison fails.
test("creation seeds only the protected fallback and preserves a differing archive copy set aside", { timeout: 120000 }, async t => {
  const h = await importFixture(t), fallback = readTemplate({ templateId: "starter" }).seed.presentation.activeThemeId;
  assert.equal(fallback, "tovu-starter");
  const fallbackFiles = h.plan.bufferedFiles!.filter(file => file.path.startsWith("themes/site/")).map(file => ({
    path: file.path.replace("themes/site/", `themes/${fallback}/`),
    content: file.path.endsWith("theme.json") ? Buffer.from(file.content.toString().replace('"id":"site"', `"id":"${fallback}"`)) : file.content,
  }));
  let seeded: unknown[] | undefined;
  const backend = createSiteImportBackend({ ...h.backendPorts, restoreStagedImport: async (input, options) => {
    assert.deepEqual(fs.readdirSync(path.join(input.dir, "themes/static")).sort(), [fallback]);
    assert.deepEqual(fs.readdirSync(path.join(input.dir, "themes/__original-themes__/static")).sort(), [fallback]);
    seeded = tree({ root: path.join(input.dir, "themes/static", fallback) });
    await restoreStagedImport(input, options);
  } });
  const archive = await buildShareZip({ plan: { ...h.plan, bufferedFiles: [...h.plan.bufferedFiles!, ...fallbackFiles] }, zip: zipFolderFiles });
  const imported = await pending({ backend, archive });
  const ready = await backend.completeOwner({ principalId, importId: imported.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.status, "ready");
  const site = h.workspace.registry({}).list({}).find(row => row.id === ready.newSiteId)!;
  assert.ok(seeded);
  assert.deepEqual(tree({ root: path.join(site.path, "themes/static", fallback) }), seeded);
  for (const file of fallbackFiles) {
    const runtimePath = file.path.replace(`themes/${fallback}/`, `themes/static/${fallback}/`);
    assert.deepEqual(fs.readFileSync(path.join(site.path, ".import-quarantine", runtimePath)), file.content);
  }
  assert.ok(ready.warnings?.some(warning => warning.includes(fallback)));
});

for (const failurePoint of ["saved-key abort", "exclusive file collision"] as const) {
  // Mutations: bypass savedKeys.restore / replace writeExclusive's wx with w, respectively.
  test(`${failurePoint} rolls back the fresh site and stage, marks failed and preserves S`, { timeout: 120000 }, async t => {
    const h = await importFixture(t), s = await existing({ h });
    const abort = Object.assign(new Error("saved-key restore stopped"), { name: "AbortError" });
    let keyCalls = 0, allocated: string | undefined;
    const savedKeys: Pick<SiteSavedKeysPort, "restore"> = { restore: async () => { keyCalls++; throw abort; } };
    const backend = createSiteImportBackend({ ...h.backendPorts, restoreStagedImport: async (input, options) => {
      allocated = input.dir;
      if (failurePoint === "exclusive file collision") {
        const target = path.join(input.dir, ".import-quarantine/skills/custom/SKILL.md");
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "pre-existing placement");
      }
      await restoreStagedImport({ ...input, savedKeys }, options);
    } });
    const imported = await pending({ backend, archive: await keysArchive({ h }) });
    const stage = h.registry.stagePath({ importId: imported.importId });
    await assert.rejects(backend.completeOwner({ principalId, importId: imported.importId, adminPassword: OWNER_PASSWORD }), error => {
      if (failurePoint === "saved-key abort") assert.equal(error, abort);
      else assert.equal((error as NodeJS.ErrnoException).code, "EEXIST");
      return true;
    });
    assert.equal(keyCalls, failurePoint === "saved-key abort" ? 1 : 0);
    const row = backend.get({ principalId, importId: imported.importId });
    assert.equal(row.status, "failed");
    assert.equal(row.error, "Site creation failed and was rolled back. Import the archive again.");
    assert.equal(row.newSiteId, null);
    assert.equal(row.newSiteName, null);
    assert.ok(allocated);
    assert.equal(fs.existsSync(allocated), false);
    assert.equal(fs.existsSync(stage), false);
    assert.deepEqual(h.workspace.registry({}).list({}).map(site => site.id), [s.site.id]);
    assertExisting({ s });
  });
}

// Mutation: discard restoreOptionalSavedKeys' returned notices; the import report assertion fails.
test("a non-abort saved-key failure notice keeps the created site and preserves S", { timeout: 120000 }, async t => {
  const h = await importFixture(t), s = await existing({ h });
  const notice = "Saved keys could not be restored. Approve fresh access on the imported site.";
  let keyCalls = 0;
  // The restore adapter owns converting a non-abort failure to this safe result.
  const savedKeys: Pick<SiteSavedKeysPort, "restore"> = { restore: async () => { keyCalls++; return { notices: [notice] }; } };
  const backend = createSiteImportBackend({ ...h.backendPorts, restoreStagedImport: (input, options) => restoreStagedImport({ ...input, savedKeys }, options) });
  const imported = await pending({ backend, archive: await keysArchive({ h }) });
  const ready = await backend.completeOwner({ principalId, importId: imported.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(keyCalls, 1);
  assert.equal(ready.status, "ready");
  assert.ok(ready.warnings?.includes(notice));
  const site = h.workspace.registry({}).list({}).find(row => row.id === ready.newSiteId)!;
  assert.equal(fs.existsSync(path.join(site.path, ".site-meta.json")), true);
  assert.equal(fs.existsSync(resolveSiteDatabasePaths({ dir: site.path }, { workspace: h.workspace }).contentDbPath), true);
  assert.equal(fs.existsSync(h.registry.stagePath({ importId: imported.importId })), false);
  assertExisting({ s });
});
