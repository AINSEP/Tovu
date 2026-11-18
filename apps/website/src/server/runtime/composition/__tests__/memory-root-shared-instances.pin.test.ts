import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

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
