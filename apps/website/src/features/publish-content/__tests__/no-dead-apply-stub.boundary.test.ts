import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function source(relativePath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

test("the obsolete not-implemented apply stub and its 501 response are absent", () => {
  const production = [
    source("features/publish-content/gated-hooks.ts"),
    source("server/inbound/admin-http/routes/publish-content/import.ts"),
  ].join("\n");
  assert.doesNotMatch(production, /PublishContentApplyNotImplementedError/);
  assert.doesNotMatch(production, /createNotYetImplementedPublishContentApplyPort/);
  assert.doesNotMatch(production, /APPLY_NOT_IMPLEMENTED/);
});

test("positive control: both composition roots construct the real apply port", () => {
  const composition = [
    source("server/runtime/composition/deps.ts"),
    source("server/runtime/composition/app.ts"),
  ].join("\n");
  const calls = composition.match(/= createPublishContentApplyPort\(/g) ?? [];
  assert.equal(calls.length, 2);
});

// Exercise the actual repositories held by each root; constructor text cannot prove sharing.
for (const root of ["memory", "sqlite"] as const) {
  test(`${root} composition applies a bundle staged through its exposed repository`, async (t) => {
    const { createSiteRouteDeps } = await import("#src/server/runtime/composition/deps");
    const { createRouteDeps, createApp } = await import("#src/server/runtime/composition/app");
    const { stageBundle } = await import("../bundle-staging.js");
    const { planImport } = await import("../planner.js");
    const { contentHash, CONTENT_HASH_VERSION } = await import("../content-hash.js");
    const { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } = await import("../artifact-format.js");
    const { getPublishContentRunStatus } = await import("../run-repo.js");
    const { initSite } = await import("#src/platform/site-dir/init-site");
    const { bootSiteDir, closeSiteDirBoot } = await import("#src/platform/site-dir/boot-site-dir");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-apply-composition-"));
    let release: (() => Promise<void>) | undefined;
    t.after(async () => {
      try { await release?.(); }
      finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    const siteDir = path.join(dir, "site");
    let deps;
    if (root === "memory") {
      deps = createRouteDeps();
    } else {
      await initSite({ dir: siteDir, name: "Publish test" });
      const boot = await bootSiteDir({ dir: siteDir });
      let composed: { close(): Promise<void> } | undefined;
      release = () => closeSiteDirBoot(boot, composed);
      deps = await createSiteRouteDeps(path.join(siteDir, "content.db"), {
        db: boot.db, workspaceId: boot.workspaceId,
        onStoreOpened: (store) => { composed = store; },
        uploadsDir: path.join(siteDir, "uploads"), themesDir: path.join(siteDir, "themes"),
        siteBinding: { dir: siteDir, name: "Publish test", dirOverridden: true, switcherCompatible: false },
      });
    }
    await Promise.all([deps.identityReady, deps.settingsReady, deps.seoReady, deps.commentsReady,
      deps.commentsSettingsReady, deps.executionSettingsReady, deps.settingsUiTabsReady,
      deps.analyticsSettingsReady, deps.siteTitleReady]);
    createApp(deps); // Registers the publishing module as in production, without listening.
    const state = { title: "Published through composition", slug: "composition-publish", kind: "post",
      bodyJson: { type: "doc", content: [] }, bodyFormat: "doc", bodyHtml: null, status: "draft", termIds: [] };
    const entity = { entityType: "post", id: "composition-publish", schemaVersion: 2,
      hashVersion: CONTENT_HASH_VERSION, contentHash: contentHash("post", state), requiredBlobs: [], state };
    const bundle = { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
      hashVersion: CONTENT_HASH_VERSION, entities: [entity], blobManifest: [] };
    const { bundleId } = await stageBundle({ ...bundle, workspaceId: deps.workspaceId,
      sourcePrincipalId: "peer-source" }, { repo: deps.publishContentBundleRepo, clock: deps.clock, idGen: deps.idGen });
    const report = await planImport(bundle, {
      publishContentDeps: { workspaceId: deps.workspaceId, clock: deps.clock, idGen: deps.idGen,
        ports: { post: { repo: deps.postRepo } } },
      getBaseline: async () => null, hasBlob: async () => true,
    });
    assert.equal(report.rows[0]?.outcome, "created", report.rows[0]?.reason ?? report.refusalReason ?? "");
    const result = await deps.publishContentApplyPort.applyReport({ report, bundleId,
      principalId: await deps.ownerPrincipalId, restorePointId: "test-restore-point" });
    assert.equal(result.changeSetIds.length, 1);
    assert.equal((await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: entity.id }))?.title, state.title);
    const status = await getPublishContentRunStatus(deps.publishContentRunRepo,
      { workspaceId: deps.workspaceId, runId: result.runId });
    assert.equal(status?.phase, "applied");
    assert.deepEqual(status?.changeSetIds, result.changeSetIds);
    assert.equal(status?.report?.rows[0]?.outcome, "created");
  });
}
