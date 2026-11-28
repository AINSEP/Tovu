import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @file Characterization pins (design 02 step 5, gap D-R2-4b + the late-bound closures of the root's
 * literal). Two kinds of invariant a move can break without any type error:
 *
 * 1. ONE hoisted instance behind two doors. `assetRenditionRepo` is the very table `mediaRepo` writes
 *    renditions into; `newsletterSubscriberDirectory` reads the very rows `memberRepo` holds.
 * 2. Closures that read the FINAL `routeDeps` object at call time (`listPublishedPosts`,
 *    `resolveActiveThemeId`, `staticSiteContext`). A test that replaces a field in place must be seen
 *    by them; a fragment that captured the field's value while the literal was still being built would
 *    keep answering from the old instance.
 */

import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { seededPresentation } from "../../configuration/seed.js";

const { createRouteDeps } = await import("../app.js");

const AT = "2026-11-17T10:00:00.000Z";

test("memory root: the rendition repo is the table the media repo writes renditions into", async () => {
  const deps: any = createRouteDeps();
  const workspaceId = deps.workspaceId as string;
  const media = { id: "media-shared", workspaceId, status: "active", version: 1, createdAt: AT, updatedAt: AT, source: { sha256: "src-sha" } };
  await deps.mediaRepo.save(media);
  const rendition = { id: "rend-1", workspaceId, assetId: media.id, transformName: "thumb", version: 1, storageKey: "k/thumb", createdAt: AT };
  const saved = await deps.mediaRepo.saveRenditionIfSource({ record: rendition, sourceSha256: "src-sha" });
  assert.deepEqual(saved, { applied: true });
  const listed = await deps.assetRenditionRepo.listByAsset({ workspaceId, assetId: media.id });
  assert.deepEqual(listed.map((row: { id: string }) => row.id), ["rend-1"]);
});

test("memory root: the newsletter subscriber directory reads the member repo the routes write", async () => {
  const deps: any = createRouteDeps();
  const workspaceId = deps.workspaceId as string;
  await deps.memberRepo.save({ id: "member-shared", workspaceId, email: "shared@example.test", status: "active", createdAt: AT, updatedAt: AT, version: 1 });
  const contact = await deps.newsletterSubscriberDirectory.getContact({ workspaceId, subscriberId: "member-shared" });
  assert.equal(contact?.email, "shared@example.test");
});

test("memory root: listPublishedPosts reads the post repo that is on routeDeps when it is called", async () => {
  const deps: any = createRouteDeps();
  const asked: string[] = [];
  deps.postRepo = { list: async (required: { workspaceId: string }) => { asked.push(required.workspaceId); return []; } };
  assert.deepEqual(await deps.listPublishedPosts(), { posts: [] });
  assert.deepEqual(asked, [deps.workspaceId]);
});

test("memory root: resolveActiveThemeId reads the presentation repo that is on routeDeps when it is called", async () => {
  const deps: any = createRouteDeps();
  assert.notEqual(await deps.resolveActiveThemeId(), "swapped-theme");
  deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ ...seededPresentation, activeThemeId: "swapped-theme" }] });
  assert.equal(await deps.resolveActiveThemeId(), "swapped-theme");
});

test("memory root: staticSiteContext reads siteDisplayName from the routeDeps object it was built into", async () => {
  const deps: any = createRouteDeps();
  deps.siteDisplayName = { read: () => "Replaced In Place" };
  const context = await deps.staticSiteContext();
  assert.equal(context.name, "Replaced In Place");
  assert.equal(context.slug, deps.siteBinding.name);
});

test("memory root: the three post-construction assignments are in place and settle", async () => {
  const deps: any = createRouteDeps();
  assert.equal(typeof deps.pluginHost, "object");
  assert.equal(typeof deps.siteConsent, "object");
  await deps.pluginRuntimeReady;
  await deps.newsletterReady;
  const lists = await deps.newsletterListRepo.list({ workspaceId: deps.workspaceId });
  assert.equal(lists.length >= 1, true, "the default newsletter list is seeded while the literal is evaluated");
});

test("the hermetic root's deploy, source-control, workflow, key-card and auth-scheme loaders read the bundled plugins' own declarations", async () => {
  const deps = createRouteDeps();
  assert.equal(typeof deps.loadDeployWorkflowFiles, "function", "the hermetic root wires the bundled workflow reader");
  const ops = await deps.loadDeployOps({ workspaceId: deps.workspaceId });
  assert.ok(ops.list().some((entry) => entry.pluginId === "github"), "the bundled GitHub plugin's deploy ops are listed");
  assert.ok(ops.list().some((entry) => entry.pluginId === "fly"), "the bundled Fly plugin's deploy ops are listed");
  const sourceControl = await deps.loadSourceControlProviders({ workspaceId: deps.workspaceId });
  assert.ok(sourceControl.list().some((entry) => entry.pluginId === "github"), "the bundled GitHub source-control declaration is listed");
  assert.ok((await deps.loadDeployWorkflowFiles!({ workspaceId: deps.workspaceId })).includes("fly-deploy.yml"));
  assert.ok((await deps.loadPluginCredentialCards(deps.workspaceId)).some((card) => card.pluginId === "resend" && card.providerId === "resend"));
  assert.deepEqual((await deps.loadAuthSchemes({ workspaceId: deps.workspaceId })).find((rule) => rule.id === "fly-io"), { id: "fly-io", prefix: "FlyV1", scheme: "FlyV1" });
});

test("a supplied publish-content peer client is the one the hermetic root dials peers with; without one it builds its own", () => {
  const client = { send: async () => { throw new Error("fixture peer client never dials"); } };
  assert.equal(createRouteDeps({ publishContentPeerHttpClient: client }).publishContentPeerHttpClient, client);
  const built = createRouteDeps().publishContentPeerHttpClient;
  assert.notEqual(built, client);
  assert.equal(typeof built.send, "function");
});

test("memory root: the trash sweep purges a post whose retention ran out, and only adapter-backed types are trashable", async () => {
  const deps: any = createRouteDeps();
  const workspaceId = deps.workspaceId as string;
  assert.equal(deps.isTrashableEntityType({ entityType: "post" }), true);
  assert.equal(deps.isTrashableEntityType({ entityType: "no-such-domain" }), false);
  await deps.postRepo.save({ id: "post-expired", workspaceId, title: "Expired", slug: "post-expired", bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc", bodyHtml: null, status: "draft", kind: "post", updatedAt: AT, version: 1 });
  const marker = await deps.trash.trash({ workspaceId, entityType: "post", entityId: "post-expired", actor: { principalId: "owner" },
    display: { title: "Expired" }, at: AT, expectedVersion: 1 });
  assert.equal(marker.ok, true);
  const trashed = async () => (await deps.trash.list({ workspaceId, now: AT, limit: 50 })).items.map((row: { entityId: string }) => row.entityId);
  assert.deepEqual(await trashed(), ["post-expired"]);
  const sweep = (now: string) => deps.sweepTrash({ now, leaseOwner: "sweeper", leaseUntil: "2099-01-01T00:00:00.000Z", limit: 5 });
  assert.deepEqual(await sweep(AT), { claimed: 0, purged: 0, results: [] }, "a fresh marker is not due");
  const report = await sweep("2099-01-01T00:00:00.000Z");
  assert.deepEqual({ claimed: report.claimed, purged: report.purged, outcomes: report.results.map((row: { outcome: string }) => row.outcome) },
    { claimed: 1, purged: 1, outcomes: ["purged"] });
  assert.deepEqual(await trashed(), []);
  assert.equal(await deps.postRepo.findById({ workspaceId, id: "post-expired" }), null);
});

test("memory root: removing a plugin parks its folder; purging it deletes the folder and forgets its activation rows", async t => {
  const root = mkdtempSync(join(tmpdir(), "memory-plugin-trash-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const installDir = join(root, "plugins");
  mkdirSync(join(installDir, "acme-gallery"), { recursive: true });
  writeFileSync(join(installDir, "acme-gallery", "plugin.json"), "{}");
  const deps: any = createRouteDeps({ installDir });
  const workspaceId = deps.workspaceId as string;
  const activation = { pluginId: "acme-gallery", workspaceId, version: "1.2.0", enabled: false, updatedAt: AT };
  await deps.pluginActivationRepo.save(activation);
  await deps.pluginActivationRepo.save({ ...activation, pluginId: "other-plugin" });
  const removed = await deps.removePlugin({ workspaceId, id: "acme-gallery", display: { title: "Acme Gallery" }, at: AT, expectedVersion: null,
    actor: { principalId: "owner" } });
  assert.equal(removed.ok, true);
  const activeIds = async () => (await deps.pluginActivationRepo.listAll()).map((row: { pluginId: string }) => row.pluginId).sort();
  assert.equal((await activeIds()).includes("acme-gallery"), true, "remove alone keeps the activation row so a restore can bring it back");
  const parked = join(root, "plugins-trash", "acme-gallery");
  assert.equal(existsSync(join(installDir, "acme-gallery")), false, "the live folder is moved out on remove");
  assert.equal(existsSync(parked), true, "the folder is parked beside the install dir");
  const report = await deps.sweepTrash({ now: "2099-01-01T00:00:00.000Z", leaseOwner: "sweeper", leaseUntil: "2099-01-01T00:00:00.000Z", limit: 5 });
  assert.deepEqual({ claimed: report.claimed, purged: report.purged }, { claimed: 1, purged: 1 });
  assert.equal(existsSync(parked), false, "purge deletes the parked folder");
  assert.deepEqual(await activeIds(), ["charts-recharts", "other-plugin"], "only the purged plugin's row is forgotten; the bundled and other rows stay");
});

test("memory root: resolveStorefrontProducts reads the commerce catalog that is on routeDeps when it is called", async () => {
  const deps: any = createRouteDeps();
  deps.commerceCatalog = undefined;
  assert.deepEqual(await deps.resolveStorefrontProducts(), [], "no commerce catalog exposes no products");
  const product = { id: "product-1", name: "Book", slug: "book" };
  const asked: unknown[] = [];
  deps.commerceCatalog = { listProducts(this: unknown, required: unknown) { asked.push([this === deps.commerceCatalog, required]); return Promise.resolve([product]); } };
  assert.deepEqual(await deps.resolveStorefrontProducts(), [product]);
  assert.deepEqual(asked, [[true, {}]], "the catalog is called once, bound to itself, with an empty request");
});
