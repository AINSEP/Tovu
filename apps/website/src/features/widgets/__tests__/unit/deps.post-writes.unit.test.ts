import { isDeepStrictEqual } from "node:util";
import { postPublicPath } from "#src/platform/routing/index";
import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "@jini-ai/infra/events/memory-bus";
import { createPublicPostReader } from "@jini-ai/cms/posts/post-read";
import { InMemoryContentTypeRepo } from "@jini-ai/cms/content-types";
import { InMemoryChangeSetRepo } from "@jini-ai/cms/core/commands";
import { InMemoryEntryRefsRepo, InMemoryWidgetRegionBindingRepo, PRE_AUTHORIZED } from "@jini-ai/cms/widgets";
import { memoryWidgetTrash } from "../support/memory-widget-trash.js";
import { createPost } from "@jini-ai/cms/posts/post-create";
import { updatePost } from "@jini-ai/cms/posts/post-update";
import { restorePostForward } from "@jini-ai/cms/posts/post-trash";
import { InMemoryPostRepo } from "../../../post/repo.memory.js";
import { buildWidgetHostPorts, buildWidgetsDeps, READ_ONLY_WIDGET_POST_WRITES, type WidgetsRouteDeps } from "../../deps.js";

/**
 * @file A14 pin — a widget embed edit on a post/page host must write through the live editor's own
 * post chokepoints (`features/post` `updatePost`/`restorePostForward`), now INJECTED by the host
 * composer as `RouteDeps.widgetPostWrites` instead of imported by `widgets/deps.ts`.
 *
 * The repo the chokepoints receive must be the ORIGINAL repository instance: `InMemoryPostRepo`
 * (like `SqlitePostRepo`) keeps its methods on the prototype, so a spread copy (`{ ...repo }`)
 * silently drops `findById`/`saveIfVersion`/`transaction` — and the embed service hands the host a
 * public READ view, which must be swapped back for the full repo before any write.
 */

const clock = { nowMs: () => Date.parse("2026-11-25T00:00:00Z") };

/** Records every method call with whether `this` was the original instance. */
class TracingPostRepo extends InMemoryPostRepo {
  readonly calls: string[] = [];
  override async findById(required: { workspaceId: string; id: string }) {
    this.calls.push(`findById:${this instanceof TracingPostRepo}`);
    return super.findById(required);
  }
}

function makeRouteDeps(repo: TracingPostRepo, seen: string[]): WidgetsRouteDeps {
  const trash = memoryWidgetTrash();
  return {
    authorize: PRE_AUTHORIZED,
    workspaceId: "ws",
    clock,
    idGen: { newId: () => "id-1" },
    outbox: new InMemoryOutbox(),
    entryRepo: trash.entryRepo,
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    postRepo: repo,
    changeSets: new InMemoryChangeSetRepo(),
    pluginBeforeSaveHook: async () => ({}),
    forgetRemovedPost: async () => {},
    removeWidget: trash.remove,
    widgetPostWrites: {
      updatePost: (required, optional) => { seen.push("updatePost"); return updatePost({ ...required, deps: { ...required.deps, reservedSegments: RESERVED_SEGMENTS, postPublicPath, isDeepStrictEqual, } }, optional); },
      restorePostForward: (required, optional) => { seen.push("restorePostForward"); return restorePostForward(required, optional); },
    },
  };
}

async function seed() {
  const repo = new TracingPostRepo({});
  const created = (await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo, clock }, input: { workspaceId: "ws", id: "p1", title: "Host", actorId: "human" } })).post;
  return { repo, created };
}

test("widget embed update writes through the injected live-editor updatePost on the original repo, with the version guard", async () => {
  const { repo, created } = await seed();
  const seen: string[] = [];
  const deps = buildWidgetsDeps(makeRouteDeps(repo, seen));
  // The embed service passes ITS post repo — the public read view — as `deps.repo`.
  const writeDeps = { repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox };
  const input = { workspaceId: "ws", id: "p1", title: "Embed edited", slug: created.slug, status: created.status, bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Edited body" }] }] }, expectedVersion: created.version, actorId: "human" };

  repo.calls.length = 0;
  const { post } = await deps.host.posts.updatePost({ deps: writeDeps, input });
  assert.equal(post.version, created.version + 1);
  assert.ok(repo.calls.length > 0 && repo.calls.every((c) => c === "findById:true"), "the original instance served every read");
  const saved = await repo.findById({ workspaceId: "ws", id: "p1" });
  assert.equal(saved?.version, created.version + 1);
  assert.equal(saved?.title, "Embed edited");
  assert.deepEqual(saved?.bodyJson, input.bodyJson);

  const stale = await deps.host.posts.updatePost({ deps: writeDeps, input }).then(() => null, (error: unknown) => error);
  assert.ok(deps.host.posts.isVersionConflict(stale), "a stale expectedVersion is refused by the live editor's version guard");
  assert.deepEqual(seen, ["updatePost", "updatePost"]);
});

test("widget embed rollback calls the injected forward restore on the original repository instance", async () => {
  const { repo, created } = await seed();
  const seen: string[] = [];
  const deps = buildWidgetsDeps(makeRouteDeps(repo, seen));
  const writeDeps = { repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox };
  await deps.host.posts.updatePost({ deps: writeDeps, input: {
    workspaceId: "ws", id: "p1", title: "Edited", slug: created.slug, status: created.status, bodyJson: created.bodyJson, expectedVersion: created.version, actorId: "human",
  } });

  repo.calls.length = 0;
  const restored = await deps.host.posts.restorePostForward({
    deps: { ...writeDeps, forgetRemoved: deps.forgetRemovedPost }, input: { prior: created, actorId: "human" },
  });
  assert.partialDeepStrictEqual(restored, { post: { title: "Host" } }, "the forward restore applied");
  assert.ok(repo.calls.length > 0 && repo.calls.every((c) => c === "findById:true"));
  assert.equal((await repo.findById({ workspaceId: "ws", id: "p1" }))?.title, "Host");
  assert.deepEqual(seen, ["updatePost", "restorePostForward"]);
});

test("a read-only widget host binding refuses post writes in plain words instead of silently no-oping", async () => {
  const { repo, created } = await seed();
  const host = buildWidgetHostPorts({ postRepo: repo, postWrites: READ_ONLY_WIDGET_POST_WRITES }, {});
  const deps = { repo: createPublicPostReader({ repo }), clock, outbox: new InMemoryOutbox() };
  await assert.rejects(
    host.posts.updatePost({ deps, input: {
      workspaceId: "ws", id: "p1", title: "x", slug: created.slug, status: created.status, bodyJson: created.bodyJson, expectedVersion: created.version,
    } }),
    /read-only/,
  );
  await assert.rejects(host.posts.restorePostForward({
    deps: { ...deps, forgetRemoved: async () => assert.fail("forgetRemoved must not be called") },
    input: { prior: created, actorId: "human" },
  }), /read-only/);
  assert.equal((await repo.findById({ workspaceId: "ws", id: "p1" }))?.version, created.version, "nothing was written");
});
