import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { SecretSealerPort } from "../../webhooks/index.js";
import { createStaticSitePackager } from "../../site-backup/static-site-packager.js";
import { commitSiteToSourceControl, previewCommitExport, type CommitSiteInput, type SourceControlCommitAdapter } from "../commit-site.js";
import type { CommitFile } from "../provider-module.js";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory.js";

/**
 * @file The dry run and the real commit package one site through one packager: a preview that listed other files than the
 * commit would send is a lie the agent shows the user. Also pins that the preview resolves no credential and calls no adapter.
 */

const REPORT = {
  routes: { succeeded: [
    { path: "/", kind: "home", outputFile: "index.html", data: "<html>home</html>" },
    { path: "/about", kind: "page", outputFile: "about/index.html", data: "<html>about</html>" },
  ], failed: [] },
  assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [],
};

test("preview and commit send the same files, and the preview asks for no credential and calls no adapter", async () => {
  const askedForKey: unknown[] = [];
  const committed: CommitFile[][] = [];
  const folders: (string | undefined)[] = [];
  const gitAdapter: SourceControlCommitAdapter = {
    async commit(input) {
      committed.push([...input.files]);
      folders.push(input.folder);
      return { ok: true, branch: "main", branchCreated: false, commitSha: "abc123", commitUrl: "https://git.example.test/c/abc123", filesChanged: input.files.length, filesDeleted: 0 };
    },
  };
  const sealer: SecretSealerPort = { seal: async () => { throw new Error("not used"); }, open: async () => { throw new Error("not used"); } };
  const exportRoot = await mkdtemp(path.join(tmpdir(), "tovu-sc-preview-parity-"));
  try {
    const input: CommitSiteInput = {
      workspaceId: "ws-1", owner: "octo", repo: "demo", commitMessage: "parity", folder: "nested/site", sourceControlExportRootDir: exportRoot,
      idGen: { newId: () => "run-1" }, packager: createStaticSitePackager(),
      staticSiteContext: async () => ({ name: "Demo", slug: "demo", theme: "Fixture", themeId: "fixture" }),
      exportSiteBound: async ({ outputDir }) => ({ outputDir, ...REPORT }),
    };
    const preview = await previewCommitExport(input);
    assert.ok(preview.ok);
    assert.equal(askedForKey.length, 0, "the preview resolves no credential");
    assert.equal(committed.length, 0, "the preview calls no adapter");
    if (!preview.ok) return;

    const outcome = await commitSiteToSourceControl({
      providerId: "github", gitAdapter, supportsFolder: true,
      credentialDeps: { repo: new InMemorySourceControlCredentialSetRepo(), sealer, resolveSavedApiKey: async (key) => { askedForKey.push(key); return { token: "fixture_saved_token" } as never; } },
    }, input);
    assert.ok(outcome.ok, JSON.stringify(outcome));
    assert.equal(committed.length, 1);
    // The adapter gets folder-relative files plus the folder; the preview lists the folder-prefixed paths it will write.
    const sent = committed[0]!.map((file) => `${folders[0]}/${file.path}`).sort();
    assert.deepEqual(preview.paths, sent);
    assert.equal(preview.fileCount, committed[0]!.length);
    assert.equal(folders[0], "nested/site");
    if (outcome.ok) assert.equal(outcome.entryPath, `nested/site/${createStaticSitePackager().entryFile}`);
  } finally { await rm(exportRoot, { recursive: true, force: true }); }
});
