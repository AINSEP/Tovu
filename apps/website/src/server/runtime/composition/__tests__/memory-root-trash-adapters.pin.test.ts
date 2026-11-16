import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { seededPosts } from "../../configuration/seed.js";

/**
 * @file Characterization pin (design 02, step 4): the in-memory composition root registers one Trash
 * adapter per record-store entity type, and each adapter flips the marker on the SAME repo the matching
 * routes read. Driven through `routeDeps.trash` (the only door the routes use), never by importing the
 * adapter builders, so it keeps passing when the builders move files. For every type: trash hides the
 * row (the marker its own repo reads), restore brings it back, and the Trash list carries it between.
 */

const { createRouteDeps } = await import("../app.js");

const AT = "2026-11-16T10:00:00.000Z";
const ACTOR = { principalId: "pin-principal" };

type AnyRepoRow = Record<string, unknown>;

interface EntityCase {
  readonly entityType: string;
  /** Seeds one row and returns its id. */
  readonly seed: (deps: any) => Promise<string>;
  /** Reads the row through the same repo seam the matching routes use (trash-blind where needed). */
  readonly read: (deps: any, id: string) => Promise<AnyRepoRow | null>;
  /** The marker field(s) as a comparable value. */
  readonly marker: (row: AnyRepoRow) => unknown;
  readonly hiddenMarker: unknown;
  readonly shownMarker: unknown;
}

const ws = (deps: any) => deps.workspaceId as string;

const CASES: EntityCase[] = [
  {
    entityType: "post",
    seed: async () => seededPosts[0]!.id,
    read: (deps, id) => deps.postRepo.findById({ workspaceId: ws(deps), id }),
    marker: (row) => (row.deletedAt === null || row.deletedAt === undefined ? "live" : "hidden"),
    hiddenMarker: "hidden", shownMarker: "live",
  },
  {
    entityType: "redirect",
    seed: async (deps) => {
      await deps.redirectRepo.insertRedirect({ id: "redir-1", workspaceId: ws(deps), fromPath: "/old", toPath: "/new", status: "active", statusCode: 301, version: 1, createdAt: AT, updatedAt: AT } as never);
      return "redir-1";
    },
    read: (deps, id) => deps.redirectRepo.findById({ workspaceId: ws(deps), id }),
    marker: (row) => row.status, hiddenMarker: "disabled", shownMarker: "active",
  },
  {
    entityType: "comment",
    seed: async (deps) => {
      await deps.commentRepo.save({ id: "comment-1", workspaceId: ws(deps), entryId: "e1", status: "approved", body: "hi", version: 1, createdAt: AT, updatedAt: AT } as never);
      return "comment-1";
    },
    read: (deps, id) => deps.commentRepo.findById({ workspaceId: ws(deps), id }),
    // restore goes back to moderation ("pending"), never to the prior status
    marker: (row) => row.status, hiddenMarker: "trash", shownMarker: "pending",
  },
  {
    entityType: "media",
    seed: async (deps) => {
      await deps.mediaRepo.save({ id: "media-1", workspaceId: ws(deps), status: "active", version: 1, createdAt: AT, updatedAt: AT } as never);
      return "media-1";
    },
    read: (deps, id) => deps.mediaRepo.findById({ workspaceId: ws(deps), id }),
    marker: (row) => row.status, hiddenMarker: "trashed", shownMarker: "active",
  },
  {
    entityType: "form",
    seed: async (deps) => {
      await deps.formDefinitionRepo.save({ id: "form-1", workspaceId: ws(deps), fields: [], notify: { enabled: false, recipients: [] }, deletedAt: null, version: 1, createdAt: AT, updatedAt: AT } as never);
      return "form-1";
    },
    read: (deps, id) => deps.formDefinitionRepo.findAnyById({ workspaceId: ws(deps), id }),
    marker: (row) => (row.deletedAt === null ? "live" : "hidden"), hiddenMarker: "hidden", shownMarker: "live",
  },
  {
    entityType: "form_submission",
    seed: async (deps) => {
      await deps.formSubmissionRepo.save({ id: "sub-1", workspaceId: ws(deps), formDefinitionId: "form-1", data: {}, deletedAt: null, version: 1, createdAt: AT } as never);
      return "sub-1";
    },
    read: (deps, id) => deps.formSubmissionRepo.findAnyById({ workspaceId: ws(deps), id }),
    marker: (row) => (row.deletedAt === null ? "live" : "hidden"), hiddenMarker: "hidden", shownMarker: "live",
  },
  {
    entityType: "widget",
    seed: async (deps) => {
      await deps.entryRepo.saveAny({ id: "widget-1", workspaceId: ws(deps), deletedAt: null, version: 1, createdAt: AT, updatedAt: AT } as never);
      return "widget-1";
    },
    read: (deps, id) => deps.entryRepo.findAnyById({ workspaceId: ws(deps), id }),
    marker: (row) => (row.deletedAt === null ? "live" : "hidden"), hiddenMarker: "hidden", shownMarker: "live",
  },
  {
    entityType: "menu",
    seed: async (deps) => {
      await deps.menuRepo.saveAny({ id: "menu-1", workspaceId: ws(deps), status: "published", priorStatus: null, version: 1, createdAt: AT, updatedAt: AT } as never);
      return "menu-1";
    },
    read: (deps, id) => deps.menuRepo.findAnyById({ workspaceId: ws(deps), id }),
    // the pre-trash status is stashed and restored (menus are the one type with a side-channel for it)
    marker: (row) => `${String(row.status)}|${String(row.priorStatus)}`,
    hiddenMarker: "trash|published", shownMarker: "published|null",
  },
];

for (const entity of CASES) {
  test(`memory root trash: ${entity.entityType} is hidden on its own repo by trash and shown again by restore`, async () => {
    const deps: any = createRouteDeps();
    const id = await entity.seed(deps);
    const before = await entity.read(deps, id);
    assert.ok(before, `${entity.entityType} seed row must be readable before trashing`);
    const trashed = await deps.trash.trash({ workspaceId: ws(deps), entityType: entity.entityType, entityId: id, actor: ACTOR, display: { title: `pin ${entity.entityType}` }, at: AT, expectedVersion: null });
    assert.equal(trashed.ok, true, JSON.stringify(trashed));
    const hidden = await entity.read(deps, id);
    assert.ok(hidden, `${entity.entityType} row still exists while trashed`);
    assert.equal(entity.marker(hidden), entity.hiddenMarker);
    const page = await deps.trash.list({ workspaceId: ws(deps), now: AT, limit: 50 }, { entityTypes: [entity.entityType] });
    assert.deepEqual(page.items.map((item: { entityId: string }) => item.entityId), [id]);
    const restored = await deps.trash.restore({ workspaceId: ws(deps), entityType: entity.entityType, entityId: id, at: AT });
    assert.equal(restored, "restored");
    assert.equal(entity.marker((await entity.read(deps, id))!), entity.shownMarker);
  });
}

test("memory root trash: an unregistered entity type fails loudly instead of trashing something unrestorable", async () => {
  const deps: any = createRouteDeps();
  await assert.rejects(
    () => deps.trash.trash({ workspaceId: ws(deps), entityType: "no-such-type", entityId: "x", actor: ACTOR, display: { title: "x" }, at: AT, expectedVersion: null }),
  );
});
