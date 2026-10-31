import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer, loginAsOwner, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import { SHARE_TOKEN_LENGTH, SiteShareRegistry } from "#src/features/site-backup/share-registry";

// RED gap: these routes previously had no assertion through the actual session/RBAC mount.
test("all share routes including static export require authentication, site-backup.push and the correct workspace", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-admin-auth-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const deps = createRouteDeps();
  let calls = 0;
  const inputs: unknown[] = [];
  const registry = new SiteShareRegistry({ directory: path.join(directory, ".hidden", "shares") });
  const operation = async (input: unknown) => { calls++; inputs.push(input); return { ok: true }; };
  deps.siteShareBackend = { registry, staticOptions: operation as never, create: operation, revoke: operation as never, list: async () => { calls++; return []; } };
  const app = createApp(deps);
  const base = await startTestServer(app, t);
  const owner = await loginAsOwner(base);
  const bare = await loginAsBarePrincipal(deps, base);
  const id = "00000000-0000-4000-8000-000000000001";
  // Share tokens are 16 letters since d3ea26cfd (owner 10-25); a 64-hex token is refused as INVALID_INPUT.
  const token = "a".repeat(SHARE_TOKEN_LENGTH);
  const routes = [
    ["GET", ""], ["POST", ""], ["POST", "/static"], ["GET", "/static/options"], ["GET", `/${id}/download`], ["DELETE", `/${id}`],
    ["PUT", `/artifacts/${token}/site.tovu.zip`], ["DELETE", `/artifacts/${token}/site.tovu.zip`],
  ];
  for (const [method, suffix] of routes) {
    const request = (workspace: string, cookie?: string) => fetch(`${base}/api/admin/v1/workspaces/${workspace}/site-shares${suffix}`, { method,
      headers: { ...(cookie ? { cookie } : {}), "content-type": method === "PUT" ? "application/zip" : "application/json" },
      ...(method === "PUT" ? { body: Buffer.from([0x50, 0x4b, 3, 4]) } : method === "POST" ? { body: "{}" } : {}),
    });
    assert.equal((await request(deps.workspaceId)).status, 401, `${method} ${suffix}: no session`);
    assert.equal((await request(deps.workspaceId, bare)).status, 403, `${method} ${suffix}: permission denied`);
    assert.equal((await request("wrong-workspace", owner)).status, 404, `${method} ${suffix}: foreign workspace`);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await registry.list({}), []);
  assert.equal((await fetch(`${base}/api/admin/v1/workspaces/${deps.workspaceId}/site-shares`, { headers: { cookie: owner } })).status, 200);
  assert.equal(calls, 1);
  const root = `${base}/api/admin/v1/workspaces/${deps.workspaceId}/site-shares`;
  const staticExport = await fetch(`${root}/static`, { method: "POST", headers: { cookie: owner, "content-type": "application/json" }, body: "{}" });
  assert.equal(staticExport.status, 200);
  assert.equal((inputs.at(-1) as { format: string }).format, "static");
  const archive = Buffer.from([0x50, 0x4b, 3, 4, 0, 0xff]);
  const upload = await fetch(`${root}/artifacts/${token}/site.tovu.zip`, { method: "PUT", headers: { cookie: owner, "content-type": "application/zip" }, body: archive });
  assert.equal(upload.status, 201);
  const received = await upload.json() as { shareId: string };
  const download = await fetch(`${root}/${received.shareId}/download`, { headers: { cookie: owner } });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), archive);
});

// Real composition contract: both adapters render through exportSiteBound, then download/unpack
// the same private ZIP route. Requires loopback sockets (unavailable in restricted sandboxes).
test("HTTP and tool selected exports deliver inactive HTML and shared public media without activating themes", async t => {
  const { zipFolderFiles } = await import("@jini-ai/agent-plugins/folder-zip");
  const { createSiteShareBackend } = await import("#src/features/site-backup/share-backend");
  const { buildSiteBackupRegistrations } = await import("#src/features/site-backup/tool-registrations");
  const { createShareArchiveReader } = await import("#src/features/site-backup/import-archive-reader");
  const { uploadMedia } = await import("#src/features/media/index");
  const { default: yauzl } = await import("yauzl");
  const directory = await mkdtemp(path.join(tmpdir(), "selected-export-composition-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  const activeThemeId = await deps.resolveActiveThemeId();
  const ownerPrincipalId = await deps.ownerPrincipalId;
  const before = await deps.presentationRepo.findByWorkspaceId({ workspaceId: deps.workspaceId });
  const { media } = await uploadMedia({ deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
    input: { workspaceId: deps.workspaceId, filename: "export-shared.svg", contentType: "image/svg+xml", bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'), createdByPrincipal: ownerPrincipalId } });
  const original = deps.themes.find(theme => theme.status === "valid")!;
  const themes = [activeThemeId, "inactive-picker"].map(id => ({ ...original, dir: directory,
    manifest: { ...original.manifest, id, tier: "static" as const, engine: 1 as const, publishedPages: ["theme-only"] },
    pages: { index: `<html><body>${id} HOME<img src="/m/${media.slug}/original.svg"></body></html>`, "theme-only": `<html><body>${id} ONLY</body></html>` }, partials: {}, css: "" }));
  deps.themes = themes;
  let renders = 0;
  deps.siteShareBackend = createSiteShareBackend({ site: deps.workspaceId, registry: new SiteShareRegistry({ directory: path.join(directory, "shares") }), zip: zipFolderFiles,
    prepare: async () => { throw new Error("A static export must not prepare a backup"); }, delivery: async () => { throw new Error("A static export must stay private"); },
    staticSite: { now: () => new Date("2026-10-30T17:15:00Z"), context: async () => ({ name: "Picker Test", slug: "picker-test", theme: "Active", themeId: activeThemeId }),
      themes: () => themes.map(theme => ({ themeId: theme.manifest.id, title: theme.manifest.id })),
      render: input => { renders++; return deps.exportSiteBound({ ...input, includeThemePreviews: false }); } } });
  const base = await startTestServer(createApp(deps), t), cookie = await loginAsOwner(base);
  const root = `${base}/api/admin/v1/workspaces/${deps.workspaceId}/site-shares`;
  const options = await (await fetch(root + "/static/options", { headers: { cookie } })).json() as { themes: { themeId: string; name: string }[] };
  const post = async (input: unknown) => {
    const response = await fetch(root + "/static", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(input) });
    assert.equal(response.status, 200); return response.json() as Promise<Record<string, unknown>>;
  };
  const tool = buildSiteBackupRegistrations({ workspaceId: deps.workspaceId, authorize: deps.authorize, siteShareBackend: deps.siteShareBackend } as import("#src/features/site-backup/backup-service").SiteBackupToolDeps, {} as never).find(tool => tool.descriptor.id === "site_export_static")!;
  const invoke = (input: unknown) => Promise.resolve(tool.handler({ executionId: "picker-export", principal: { id: ownerPrincipalId }, run: { id: "picker-run" }, input, signal: new AbortController().signal })) as Promise<Record<string, unknown>>;
  for (const start of [post, invoke]) {
    let result = await start({ themeIds: ["inactive-picker", activeThemeId] });
    for (let poll = 0; "jobId" in result && poll < 50; poll++) result = await start({ jobId: result.jobId });
    assert.ok(result.shareId, JSON.stringify(result));
    const response = await fetch(base + result.downloadUrl, { headers: { cookie } });
    assert.equal(response.status, 200);
    const files = new Map<string, Buffer>();
    for await (const entry of createShareArchiveReader({ yauzl }).entries({ archive: Buffer.from(await response.arrayBuffer()) })) {
      if (entry.kind !== "file") continue;
      const chunks: Buffer[] = []; for await (const chunk of entry.openReadStream({})) chunks.push(Buffer.from(chunk));
      files.set(entry.entryPath, Buffer.concat(chunks));
    }
    const folder = String(result.file).replace(/\.zip$/, "") + "/";
    for (const theme of options.themes) {
      assert.match(files.get(`${folder}sites/${theme.name}/index.html`)!.toString(), new RegExp(`${theme.themeId} HOME`));
      assert.match(files.get(`${folder}sites/${theme.name}/theme-only/index.html`)!.toString(), new RegExp(`${theme.themeId} ONLY`));
    }
    assert.equal([...files.keys()].filter(name => name.startsWith(folder + "media/")).length, 1);
    const active = options.themes.find(theme => theme.themeId === activeThemeId)!;
    assert.ok(files.get(folder + "Open website.html")!.toString().includes(`sites/${active.name}/index.html`));
    assert.deepEqual(await deps.presentationRepo.findByWorkspaceId({ workspaceId: deps.workspaceId }), before);
  }
  assert.equal(renders, 4, "two themes per start, without additional render work during polling");
});
