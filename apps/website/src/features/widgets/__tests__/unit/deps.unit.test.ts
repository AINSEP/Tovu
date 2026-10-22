import assert from "node:assert/strict";
import test from "node:test";

import { ContentTypeAlreadyExistsError, NoopContentTypeIndexProvisioner } from "@jini-ai/cms/content-types";
import { VersionConflictError } from "@jini-ai/cms/entries";
import { buildWidgetHostPorts, buildWidgetsDeps, buildWidgetsRegionDeps, type WidgetsRouteDeps } from "../../deps.js";
import { PostNotFoundError, PostVersionConflictError, type PostRepoPort } from "../../../post/index.js";

/**
 * @file `buildWidgetsDeps`/`buildWidgetsRegionDeps` — the shared write-path deps composer
 * (`deps.ts`'s own file header documents the ~11-call-site outbox-bridging bug this replaced).
 * These are pure structural mappers with no branches; the risk they guard against is not "does it
 * throw" but "does every field land under the RIGHT name" — `idGen` -> `ids` is a rename, not a
 * passthrough, and that exact class of mismatch (a route's own field shape silently not matching
 * what the domain function destructures) is what caused the outbox bug this file's header cites.
 * So every assertion below pins field IDENTITY (`assert.equal`, same object reference) rather than
 * just "truthy" or "defined".
 */

function makeRouteDeps(): WidgetsRouteDeps {
  return {
    authorize: (() => {}) as unknown as WidgetsRouteDeps["authorize"],
    workspaceId: "ws-1",
    clock: { nowMs: () => Date.parse("2026-08-20T00:00:00.000Z") },
    idGen: { newId: () => "id-1" },
    outbox: { publish: () => {} } as unknown as WidgetsRouteDeps["outbox"],
    entryRepo: { marker: "entryRepo" } as unknown as WidgetsRouteDeps["entryRepo"],
    contentTypeRepo: { marker: "contentTypeRepo" } as unknown as WidgetsRouteDeps["contentTypeRepo"],
    entryRefsRepo: { marker: "entryRefsRepo" } as unknown as WidgetsRouteDeps["entryRefsRepo"],
    widgetBindingRepo: { marker: "widgetBindingRepo" } as unknown as WidgetsRouteDeps["widgetBindingRepo"],
    postRepo: { marker: "postRepo" } as unknown as WidgetsRouteDeps["postRepo"],
    changeSets: { marker: "changeSets" } as unknown as WidgetsRouteDeps["changeSets"],
        pluginBeforeSaveHook: { marker: "pluginBeforeSaveHook" } as unknown as WidgetsRouteDeps["pluginBeforeSaveHook"],
        forgetRemovedPost: (() => {}) as unknown as WidgetsRouteDeps["forgetRemovedPost"],
        removeWidget: (async () => ({ ok: true })) as unknown as WidgetsRouteDeps["removeWidget"],
  };
}

test("buildWidgetsDeps: maps every field to its write-path name, by identity, including the idGen -> ids rename", () => {
  const routeDeps = makeRouteDeps();
  const result = buildWidgetsDeps(routeDeps);

  assert.equal(result.entryRepo, routeDeps.entryRepo);
  assert.equal(result.contentTypeRepo, routeDeps.contentTypeRepo);
  assert.equal(result.entryRefsRepo, routeDeps.entryRefsRepo);
  assert.equal(result.clock, routeDeps.clock);
  assert.equal(result.authorize, routeDeps.authorize);
  assert.equal(result.outbox, routeDeps.outbox);
  // The one rename in this mapping: `routeDeps.idGen` becomes `result.ids`.
      assert.equal(result.ids, routeDeps.idGen);
      assert.equal(result.postRepo, routeDeps.postRepo);
      assert.equal(result.forgetRemovedPost, routeDeps.forgetRemovedPost);
      assert.equal(result.changeSets, routeDeps.changeSets);
      assert.equal(result.beforeSaveHook, routeDeps.pluginBeforeSaveHook);
      assert.equal(result.remove, routeDeps.removeWidget);
      assert.deepEqual(Object.keys(result).sort(), [
        "entryRepo", "contentTypeRepo", "entryRefsRepo", "postRepo",
        "forgetRemovedPost", "changeSets", "beforeSaveHook", "clock",
        "ids", "authorize", "outbox", "remove", "entryLocks",
      ].sort());
});

test("buildWidgetsDeps: does not carry workspaceId or widgetBindingRepo through — those are not part of this shape", () => {
  const routeDeps = makeRouteDeps();
  const result = buildWidgetsDeps(routeDeps);

  assert.equal((result as Record<string, unknown>).workspaceId, undefined);
  assert.equal((result as Record<string, unknown>).widgetBindingRepo, undefined);
  assert.equal((result as Record<string, unknown>).bindingRepo, undefined);
});

test("buildWidgetsRegionDeps: is buildWidgetsDeps' shape plus one extra field, bindingRepo, sourced from widgetBindingRepo", () => {
  const routeDeps = makeRouteDeps();
  const base = buildWidgetsDeps(routeDeps);
  const region = buildWidgetsRegionDeps(routeDeps);

  assert.deepEqual(Object.keys(region).sort(), [...Object.keys(base), "bindingRepo"].sort());
  assert.equal(region.bindingRepo, routeDeps.widgetBindingRepo);
  assert.equal(region.entryRepo, base.entryRepo);
  assert.equal(region.ids, base.ids);
});

test("widget composition retains one state per entry store across write, embed, region and recreated bags", () => {
  const routeDeps = makeRouteDeps();
  const first = buildWidgetsDeps(routeDeps);
  assert.equal(buildWidgetsDeps({ ...routeDeps }).entryLocks, first.entryLocks);
  assert.equal(buildWidgetsRegionDeps(routeDeps).entryLocks, first.entryLocks);
  assert.notEqual(buildWidgetsDeps(makeRouteDeps()).entryLocks, first.entryLocks);
});

/** A live post row as `findPublishedPost*` reads it, served by whichever repo the host port picks. */
function postLookupRepo(label: string, seen: string[]): PostRepoPort {
  const row = { id: `${label}-post`, slug: `${label}-slug`, status: "published", publishedAt: "2026-01-01T00:00:00.000Z", trashedAt: null, deletedAt: null };
  return {
    findById: async ({ id }: { id: string }) => { seen.push(`${label}:findById:${id}`); return row; },
    findBySlug: async ({ slug }: { slug: string }) => { seen.push(`${label}:findBySlug:${slug}`); return row; },
  } as unknown as PostRepoPort;
}

test("buildWidgetHostPorts: published-post lookups use the bound postRepo, and fall back to the caller's repo when none is bound", async () => {
  const seen: string[] = [];
  const bound = buildWidgetHostPorts({ postRepo: postLookupRepo("bound", seen) });
  const unbound = buildWidgetHostPorts({});
  const callerRepo = postLookupRepo("caller", seen);
  const input = { workspaceId: "ws-1", id: "p-1", slug: "s-1" };

  assert.equal((await bound.posts.findPublishedPostById({ deps: { repo: callerRepo }, input } as never))?.id, "bound-post");
  assert.equal((await unbound.posts.findPublishedPostById({ deps: { repo: callerRepo }, input } as never))?.id, "caller-post");
  assert.equal((await bound.posts.findPublishedPostBySlug({ deps: { repo: callerRepo }, input } as never))?.slug, "bound-slug");
  assert.equal((await unbound.posts.findPublishedPostBySlug({ deps: { repo: callerRepo }, input } as never))?.slug, "caller-slug");
  assert.deepEqual(seen, ["bound:findById:p-1", "caller:findById:p-1", "bound:findBySlug:s-1", "caller:findBySlug:s-1"]);
});

test("buildWidgetHostPorts: error classifiers recognise only their own error classes", () => {
  const host = buildWidgetHostPorts({});
  assert.equal(host.entries.isVersionConflict(new VersionConflictError({ message: "stale" })), true);
  assert.equal(host.entries.isVersionConflict(new Error("other")), false);
  assert.equal(host.posts.isVersionConflict(new PostVersionConflictError("stale", 1, 2)), true);
  assert.equal(host.posts.isVersionConflict(new Error("other")), false);
  assert.equal(host.posts.isNotFound(new PostNotFoundError("gone")), true);
  assert.equal(host.posts.isNotFound(new Error("other")), false);
  assert.deepEqual(host.contentTypes.alreadyExists(new ContentTypeAlreadyExistsError({ key: "faq", tombstoned: true })), { tombstoned: true });
  assert.deepEqual(host.contentTypes.alreadyExists(new ContentTypeAlreadyExistsError({ key: "faq", tombstoned: false })), { tombstoned: false });
  assert.equal(host.contentTypes.alreadyExists(new Error("other")), null);
});

test("buildWidgetHostPorts: each index provisioner is a fresh no-op provisioner", () => {
  const host = buildWidgetHostPorts({});
  const first = host.contentTypes.createIndexProvisioner();
  assert.ok(first instanceof NoopContentTypeIndexProvisioner);
  assert.notEqual(host.contentTypes.createIndexProvisioner(), first);
});

test("buildWidgetHostPorts: updatePost and restorePostForward read through the bound postRepo, else the caller's repo", async () => {
  const seen: string[] = [];
  const missingRepo = (label: string) => ({ findById: async ({ id }: { id: string }) => { seen.push(`${label}:${id}`); return null; } }) as unknown as PostRepoPort;
  const bound = buildWidgetHostPorts({ postRepo: missingRepo("bound") });
  const unbound = buildWidgetHostPorts({});
  const caller = { repo: missingRepo("caller") };

  for (const host of [bound, unbound]) {
    await assert.rejects(host.posts.updatePost({ deps: caller, input: { workspaceId: "ws-1", id: "p-up" } } as never), PostNotFoundError);
    // A row that no longer exists has nothing to roll forward: the restore is a no-op, not a throw.
    assert.equal(await host.posts.restorePostForward({ deps: caller, input: { prior: { workspaceId: "ws-1", id: "p-re", version: 1 } } } as never), null);
  }
  assert.deepEqual(seen, ["bound:p-up", "bound:p-re", "caller:p-up", "caller:p-re"]);
});
