import { isDeepStrictEqual } from "node:util";
import { postPublicPath } from "#src/platform/routing/index";
import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import assert from "node:assert/strict";
import test from "node:test";
import { updatePost } from "@jini-ai/cms/posts/post-update";
import { restorePostForward } from "@jini-ai/cms/posts/post-trash";

import { ContentTypeAlreadyExistsError, NoopContentTypeIndexProvisioner } from "@jini-ai/cms/content-types";
import { VersionConflictError } from "@jini-ai/cms/entries";
import { buildWidgetHostPorts, buildWidgetsDeps, buildWidgetsRegionDeps, READ_ONLY_WIDGET_POST_WRITES, type WidgetsRouteDeps } from "../../deps.js";
import { PostNotFoundError, PostVersionConflictError, type PostRepoPort, type PublicPostRecord } from "@jini-ai/cms/posts/post";
import { InMemoryPostRepo } from "../../../post/repo.memory.js";
import { InMemoryOutbox } from "@jini-ai/infra/events/memory-bus";
import { createPublicPostReader } from "@jini-ai/cms/posts/post-read";

/**
 * @file `buildWidgetsDeps`/`buildWidgetsRegionDeps` — the shared write-path deps composer
 * (`deps.ts`'s own file header documents the ~11-call-site outbox-bridging bug this replaced).
 * These are pure structural mappers with no branches; the risk they guard against is not "does it
 * throw" but "does every field land under the RIGHT name" — `idGen` -> `ids` is a rename, not a
 * passthrough, and that exact class of mismatch (a route's own field shape silently not matching
 * what the domain function destructures) is what caused the outbox bug this file's header cites.
 * Fields retain IDENTITY (`assert.equal`, same object reference), except the kind-filtered public
 * post reader introduced by 4ccffe630: its assertions exercise reads through the supplied repo.
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
        widgetPostWrites: { updatePost: (required, optional) => updatePost({ ...required, deps: { ...required.deps, reservedSegments: RESERVED_SEGMENTS, postPublicPath, isDeepStrictEqual, } }, optional), restorePostForward },
        removeWidget: (async () => ({ ok: true })) as unknown as WidgetsRouteDeps["removeWidget"],
  };
}

test("buildWidgetsDeps: maps write-path fields by identity and narrows post reads, including the idGen -> ids rename", async (t) => {
  const routeDeps = makeRouteDeps();
  const seen: string[] = [];
  routeDeps.postRepo = postLookupRepo("mapped", seen);
  const result = buildWidgetsDeps(routeDeps);

  assert.equal(result.entryRepo, routeDeps.entryRepo);
  assert.equal(result.contentTypeRepo, routeDeps.contentTypeRepo);
  assert.equal(result.entryRefsRepo, routeDeps.entryRefsRepo);
  assert.equal(result.clock, routeDeps.clock);
  assert.equal(result.authorize, routeDeps.authorize);
  assert.equal(result.outbox, routeDeps.outbox);
  // The one rename in this mapping: `routeDeps.idGen` becomes `result.ids`.
      assert.equal(result.ids, routeDeps.idGen);
      const post = await result.postRepo.findById({ workspaceId: "ws-1", id: "p-1" });
      assert.ok(post);
      assert.equal(post.id, "mapped-post");
      assert.equal((await result.postRepo.findBySlug({ workspaceId: "ws-1", slug: "s-1" }))?.slug, "mapped-slug");
      assert.deepEqual(await result.postRepo.list({ workspaceId: "ws-1" }), [post]);
      assert.deepEqual(seen, ["mapped:findById:p-1", "mapped:findBySlug:s-1", "mapped:list"]);
      // The public reader must not expose email templates, even if storage marks them published.
      const template = { ...post, kind: "email-template" as const };
      t.mock.method(routeDeps.postRepo, "findById", async () => template);
      t.mock.method(routeDeps.postRepo, "findBySlug", async () => template);
      t.mock.method(routeDeps.postRepo, "list", async () => [post, template]);
      assert.equal(await result.postRepo.findById({ workspaceId: "ws-1", id: "p-1" }), null);
      assert.equal(await result.postRepo.findBySlug({ workspaceId: "ws-1", slug: "s-1" }), null);
      assert.deepEqual(await result.postRepo.list({ workspaceId: "ws-1" }), [post]);
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
  const row: PublicPostRecord = {
    id: `${label}-post`, workspaceId: "ws-1", title: "Post", slug: `${label}-slug`, status: "published",
    kind: "post", bodyFormat: "doc", bodyJson: {}, bodyHtml: null, updatedAt: "2026-01-01T00:00:00.000Z", version: 1,
  };
  return Object.assign(new InMemoryPostRepo({}), {
    findById: async ({ workspaceId, id }: { workspaceId: string; id: string }) => {
      seen.push(`${label}:findById:${id}`);
      return workspaceId === row.workspaceId && id === "p-1" ? row : null;
    },
    findBySlug: async ({ workspaceId, slug }: { workspaceId: string; slug: string }) => {
      seen.push(`${label}:findBySlug:${slug}`);
      return workspaceId === row.workspaceId && slug === "s-1" ? row : null;
    },
    list: async ({ workspaceId }: { workspaceId: string }) => {
      seen.push(`${label}:list`);
      return workspaceId === row.workspaceId ? [row] : [];
    },
  });
}

test("buildWidgetHostPorts: published-post lookups use the bound postRepo, and fall back to the caller's repo when none is bound", async () => {
  const seen: string[] = [];
  const bound = buildWidgetHostPorts({ postRepo: postLookupRepo("bound", seen), postWrites: READ_ONLY_WIDGET_POST_WRITES });
  const unbound = buildWidgetHostPorts({ postWrites: { updatePost: (required, optional) => updatePost({ ...required, deps: { ...required.deps, reservedSegments: RESERVED_SEGMENTS, postPublicPath, isDeepStrictEqual, } }, optional), restorePostForward } });
  const callerRepo = createPublicPostReader({ repo: postLookupRepo("caller", seen) });
  const input = { workspaceId: "ws-1", id: "p-1", slug: "s-1" };

  assert.equal((await bound.posts.findPublishedPostById({ deps: { repo: callerRepo }, input }))?.id, "bound-post");
  assert.equal((await unbound.posts.findPublishedPostById({ deps: { repo: callerRepo }, input }))?.id, "caller-post");
  assert.equal((await bound.posts.findPublishedPostBySlug({ deps: { repo: callerRepo }, input }))?.slug, "bound-slug");
  assert.equal((await unbound.posts.findPublishedPostBySlug({ deps: { repo: callerRepo }, input }))?.slug, "caller-slug");
  assert.deepEqual(seen, ["bound:findById:p-1", "caller:findById:p-1", "bound:findBySlug:s-1", "caller:findBySlug:s-1"]);
});

test("buildWidgetHostPorts: slugify takes the plain title string Jini's write-service passes", () => {
  // Jini's `WidgetHostPorts.slugify(text: string)` is called positionally (`host.slugify(title)`);
  // Tovu's own `toSlug` takes `{ text }`, so the port must adapt at this boundary.
  assert.equal(buildWidgetHostPorts({ postWrites: READ_ONLY_WIDGET_POST_WRITES }).slugify("Hello World"), "hello-world");
});

test("buildWidgetHostPorts: error classifiers recognise only their own error classes", () => {
  const host = buildWidgetHostPorts({ postWrites: READ_ONLY_WIDGET_POST_WRITES });
  assert.equal(host.entries.isVersionConflict(new VersionConflictError({ message: "stale" })), true);
  assert.equal(host.entries.isVersionConflict(new Error("other")), false);
  assert.equal(host.posts.isVersionConflict(new PostVersionConflictError({ message: "stale", expectedVersion: 1, currentVersion: 2 })), true);
  assert.equal(host.posts.isVersionConflict(new Error("other")), false);
  assert.equal(host.posts.isNotFound(new PostNotFoundError("gone")), true);
  assert.equal(host.posts.isNotFound(new Error("other")), false);
  assert.deepEqual(host.contentTypes.alreadyExists(new ContentTypeAlreadyExistsError({ key: "faq", tombstoned: true })), { tombstoned: true });
  assert.deepEqual(host.contentTypes.alreadyExists(new ContentTypeAlreadyExistsError({ key: "faq", tombstoned: false })), { tombstoned: false });
  assert.equal(host.contentTypes.alreadyExists(new Error("other")), null);
});

test("buildWidgetHostPorts: each index provisioner is a fresh no-op provisioner", () => {
  const host = buildWidgetHostPorts({ postWrites: READ_ONLY_WIDGET_POST_WRITES });
  const first = host.contentTypes.createIndexProvisioner();
  assert.ok(first instanceof NoopContentTypeIndexProvisioner);
  assert.notEqual(host.contentTypes.createIndexProvisioner(), first);
});

test("buildWidgetHostPorts: updatePost and restorePostForward read through the bound postRepo, else the caller's repo", async () => {
  const seen: string[] = [];
  const missingRepo = (label: string) => Object.assign(new InMemoryPostRepo({}), {
    findById: async ({ workspaceId, id }: { workspaceId: string; id: string }) => {
      assert.equal(workspaceId, "ws-1");
      seen.push(`${label}:${id}`);
      return null;
    },
  });
  const bound = buildWidgetHostPorts({ postRepo: missingRepo("bound"), postWrites: { updatePost: (required, optional) => updatePost({ ...required, deps: { ...required.deps, reservedSegments: RESERVED_SEGMENTS, postPublicPath, isDeepStrictEqual, } }, optional), restorePostForward } });
  const unbound = buildWidgetHostPorts({ postWrites: { updatePost: (required, optional) => updatePost({ ...required, deps: { ...required.deps, reservedSegments: RESERVED_SEGMENTS, postPublicPath, isDeepStrictEqual, } }, optional), restorePostForward } });
  const caller = { repo: createPublicPostReader({ repo: missingRepo("caller") }), clock: { nowMs: () => 0 }, outbox: new InMemoryOutbox() };
  const row = { workspaceId: "ws-1", title: "Post", slug: "post", status: "draft" as const, bodyJson: {} };

  for (const host of [bound, unbound]) {
    await assert.rejects(host.posts.updatePost({ deps: caller, input: { ...row, id: "p-up", expectedVersion: 1 } }), PostNotFoundError);
    // A row that no longer exists has nothing to roll forward: the restore is a no-op, not a throw.
    assert.equal(await host.posts.restorePostForward({ deps: { ...caller, forgetRemoved: async () => assert.fail("a missing row cannot be removed") },
      input: { prior: { ...row, id: "p-re", version: 1, kind: "post", bodyFormat: "doc", updatedAt: "2026-01-01T00:00:00.000Z" } } }), null);
  }
  assert.deepEqual(seen, ["bound:p-up", "bound:p-re", "caller:p-up", "caller:p-re"]);
});

test("region operations can use the bound host reader without exposing the host on enumerable deps", async () => {
  const routeDeps = makeRouteDeps();
  const seen: string[] = [];
  routeDeps.postRepo = postLookupRepo("region", seen);
  const region = buildWidgetsRegionDeps(routeDeps);
  const callerRepo = createPublicPostReader({ repo: postLookupRepo("caller", seen) });
  const result = await region.host.posts.findPublishedPostBySlug({
    deps: { repo: callerRepo },
    input: { workspaceId: "ws-1", id: "p-1", slug: "s-1" },
  });
  assert.equal(result?.id, "region-post");
  assert.deepEqual(seen, ["region:findBySlug:s-1"]);
  assert.equal(Object.keys(region).includes("host"), false);
});
