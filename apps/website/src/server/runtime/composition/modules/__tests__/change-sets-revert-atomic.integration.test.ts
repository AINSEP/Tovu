import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { ChangeSetItemRecord } from "@jini-ai/core/contracts/events";
import { createPost } from "@jini-ai/cms/posts/post-create";
import { deletePost } from "@jini-ai/cms/posts/post-trash";
import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import { bootSite, send, expectJson, SITE_DIALECTS, type SiteDeps } from "#src/server/__tests__/helpers/unrun-site-boot";

const ENTITY_ID = "atomic-first";
const CHANGE_SET_ID = "atomic-revert";
const PRIOR_HTML = '<section data-agent-element="prior" data-agent-role="region"><h1>Prior</h1></section>';
const NEXT_HTML = `<section data-agent-element="next" data-agent-role="region"><h1>Next</h1><div data-embed-config='{"type":"widget","id":"atomic-widget"}'></div></section>`;

async function seedInverse({ deps, kind }: { deps: SiteDeps; kind: "post" | "page-html" | "menu" }, _optional = {}): Promise<ChangeSetItemRecord> {
  const workspaceId = deps.workspaceId;
  let inversePayload: ChangeSetItemRecord["inversePayload"];
  let version: number;
  if (kind === "menu") {
    await deps.menuRepo.save({ id: ENTITY_ID, workspaceId, slug: "atomic-menu", title: "Atomic menu", status: "published",
      doc: { type: "menu", version: 1, items: [{ id: "next", target: { kind: "url", href: "/next" } }] },
      locations: [], version: 1, updatedAt: deps.clock.nowIso() });
    inversePayload = { items: [] };
    version = 1;
  } else {
    await createPost({ deps: { reservedSegments: RESERVED_SEGMENTS, repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox },
      input: { workspaceId, id: ENTITY_ID, title: "Atomic post", kind: kind === "post" ? "post" : "page", status: "published" } });
    if (kind === "post") {
      await deletePost({ deps: { repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox, remove: deps.removePost }, input: { workspaceId, id: ENTITY_ID } });
      inversePayload = { deletedAt: null };
    } else {
      const store = deps.pagesHtmlStore({ workspaceId, postId: ENTITY_ID, actorId: "seed" });
      await store.ensureHtmlFormat({ seedHtml: NEXT_HTML });
      inversePayload = { format: "html", html: PRIOR_HTML };
    }
    const row = await deps.postRepo.findById({ workspaceId, id: ENTITY_ID });
    assert.ok(row);
    version = row.version;
  }
  return { id: "first", changeSetId: CHANGE_SET_ID, entityType: kind, entityId: ENTITY_ID,
    operation: kind === "post" ? "delete" : "update", inversePayload, entityVersionAtApply: version, position: 1 };
}

async function storedState({ deps }: { deps: SiteDeps }, _optional = {}) {
  const { workspaceId, contentKernel } = deps;
  assert.ok(contentKernel);
  return {
    post: await deps.postRepo.findById({ workspaceId, id: ENTITY_ID }),
    revisions: await deps.postRepo.listRevisions({ workspaceId, postId: ENTITY_ID }),
    menu: await deps.menuRepo.findById({ workspaceId, id: ENTITY_ID }),
    trash: await deps.trashRepo.findByEntity({ workspaceId, entityType: "post", entityId: ENTITY_ID }),
    refs: await deps.entryRefsRepo.findBySource({ workspaceId, sourceEntryId: ENTITY_ID }),
    ledger: await deps.changeSets.findById({ workspaceId, id: CHANGE_SET_ID }),
    events: await contentKernel.run(db => db.selectFrom("outbox_events").select(["id", "event_json"]).orderBy("id").execute()),
  };
}

for (const dialect of SITE_DIALECTS) {
  for (const kind of ["post", "page-html", "menu"] as const) {
    test(`Recovery revert rolls back the first inverse when the second fails (${dialect}, ${kind})`, async t => {
      const failure = new Error("second inverse failed");
      let observed = false;
      const site = await bootSite(t, dialect, { configureDeps: deps => {
        deps.revertRegistry.register("atomic-sentinel", "update", {
          currentVersion: async () => 1,
          applyInverse: async () => {
            const inside = await storedState({ deps });
            assert.equal(deps.contentKernel?.inTransaction(), true);
            if (kind === "post") {
              assert.equal(inside.post?.deletedAt, null);
              assert.equal(inside.trash, null);
            } else if (kind === "page-html") {
              assert.equal(inside.post?.bodyHtml, PRIOR_HTML);
              assert.deepEqual(inside.refs, []);
            } else assert.deepEqual(inside.menu?.doc.items, []);
            assert.equal(inside.ledger?.changeSet.status, "applied");
            observed = true;
            throw failure;
          },
        });
      } });
      const first = await seedInverse({ deps: site.deps, kind });
      await site.deps.changeSets.insert({ record: { id: CHANGE_SET_ID, workspaceId: site.deps.workspaceId,
        actorId: "seed", actor: { id: "seed", kind: "user" }, status: "applied", summary: "Atomic revert", createdAt: site.deps.clock.nowIso() },
      items: [first, { ...first, id: "second", entityId: "second", entityType: "atomic-sentinel", operation: "update", position: 0, entityVersionAtApply: 1 }] });
      const before = await storedState({ deps: site.deps });
      if (kind === "page-html") assert.equal(before.refs.length, 1);
      await expectJson(await send(site, "POST", `${site.ws}/change-sets/${CHANGE_SET_ID}/revert`, {}), 500);
      assert.equal(observed, true);
      assert.deepEqual(await storedState({ deps: site.deps }), before);
    });
  }
}

for (const dialect of SITE_DIALECTS) {
  test(`a final outbox failure also rolls back the reverted status (${dialect})`, async t => {
    const failure = new Error("final enqueue failed");
    let observed = false;
    const site = await bootSite(t, dialect, { configureDeps: deps => {
      const enqueue = deps.outbox.enqueue.bind(deps.outbox);
      deps.outbox.enqueue = async event => {
        await enqueue(event);
        if (event.name !== "change-set.reverted") return;
        const inside = await storedState({ deps });
        assert.equal(inside.ledger?.changeSet.status, "reverted");
        assert.equal(inside.post?.deletedAt, null);
        assert.ok(inside.events.some(row => JSON.parse(row.event_json).name === "change-set.reverted"));
        observed = true;
        throw failure;
      };
    } });
    const first = await seedInverse({ deps: site.deps, kind: "post" });
    await site.deps.changeSets.insert({ record: { id: CHANGE_SET_ID, workspaceId: site.deps.workspaceId,
      actorId: "seed", actor: { id: "seed", kind: "user" }, status: "applied", summary: "Atomic revert", createdAt: site.deps.clock.nowIso() }, items: [first] });
    const before = await storedState({ deps: site.deps });
    await expectJson(await send(site, "POST", `${site.ws}/change-sets/${CHANGE_SET_ID}/revert`, {}), 500);
    assert.equal(observed, true);
    assert.deepEqual(await storedState({ deps: site.deps }), before);
  });
}
