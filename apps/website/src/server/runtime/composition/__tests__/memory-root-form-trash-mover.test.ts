/**
 * @file The hermetic composition root's `trashMovers` entry for forms (the admin Trash screen's
 * "move to Trash" for a form): an unknown form is `not-found`, a known form gets a Trash row
 * carrying its name and slug at the version the trash write stamped, and a second move of the
 * same form is `not-found` (a trashed form is hidden) without writing a second Trash row.
 */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRouteDeps } from "../app.js";

const AT = "2026-11-01T09:00:00.000Z";

test("memory root form trash mover: unknown form is not-found, a known form is trashed with its name and slug, a repeat move is not-found", async () => {
  const routeDeps = createRouteDeps();
  const workspaceId = routeDeps.workspaceId;
  await routeDeps.formDefinitionRepo.create({ id: "form-7", workspaceId, name: "Waitlist", slug: "waitlist", status: "active", version: 3,
    createdAt: AT, updatedAt: AT, notify: { enabled: false, recipients: [] }, fields: [{ id: "email", label: "Email", type: "email", required: true }] });
  const mover = routeDeps.trashMovers?.get("form");
  assert.ok(mover, "the memory root registers a form trash mover");
  const actor = { principalId: "owner-1" };

  assert.deepEqual(await mover.move({ workspaceId, entityId: "form-missing", actor }), { ok: false, reason: "not-found" });

  const moved = await mover.move({ workspaceId, entityId: "form-7", actor });
  // The trash write bumps the form from version 3 to 4; the mover hands that version back to the route.
  assert.deepEqual(moved, { ok: true, version: 4 });
  const page = await routeDeps.trash.list({ workspaceId, now: AT, limit: 10 }, { entityTypes: ["form"] });
  assert.deepEqual(page.items.map(item => ({ entityId: item.entityId, title: item.displayTitle, subtitle: item.displaySubtitle, version: item.entityVersion })),
    [{ entityId: "form-7", title: "Waitlist", subtitle: "waitlist", version: 4 }]);

  assert.deepEqual(await mover.move({ workspaceId, entityId: "form-7", actor }), { ok: false, reason: "not-found" });
  const after = await routeDeps.trash.list({ workspaceId, now: AT, limit: 10 }, { entityTypes: ["form"] });
  assert.deepEqual(after.items.map(item => item.entityId), ["form-7"]);
});

test("memory root form trash mover: a form edited between the mover's read and its trash write is refused with the trash service's own outcome", async () => {
  const routeDeps = createRouteDeps();
  const workspaceId = routeDeps.workspaceId;
  const form = { id: "form-8", workspaceId, name: "Survey", slug: "survey", status: "active" as const, version: 2,
    createdAt: AT, updatedAt: AT, notify: { enabled: false, recipients: [] }, fields: [{ id: "email", label: "Email", type: "email" as const, required: true }] };
  const repo = routeDeps.formDefinitionRepo;
  await repo.create(form);
  const realFind = repo.findById.bind(repo);
  // A concurrent edit lands right after the mover read version 2, so its trash write expects a stale version.
  repo.findById = async required => {
    const row = await realFind(required);
    repo.findById = realFind;
    await repo.update({ ...form, name: "Survey v2", version: 3 }, { expectedVersion: 2 });
    return row;
  };
  const moved = await routeDeps.trashMovers?.get("form")?.move({ workspaceId, entityId: "form-8", actor: { principalId: "owner-1" } });
  assert.deepEqual(moved, { ok: false, reason: "version-changed" });
  const page = await routeDeps.trash.list({ workspaceId, now: AT, limit: 10 }, { entityTypes: ["form"] });
  assert.deepEqual(page.items, [], "a refused move writes no Trash row");
  assert.equal((await realFind({ workspaceId, id: "form-8" }))?.name, "Survey v2", "the concurrent edit stands");
});
