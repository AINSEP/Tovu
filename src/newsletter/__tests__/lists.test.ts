/**
 * @file T022 — failing-first tests for `lists.ts` (REQ-08/09, AC-10).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { archiveList, ensureDefaultList, saveList, type ListsDeps } from "../lists";
import { NewsletterDefaultListProtectedError, NewsletterListNotFoundError } from "../errors";
import { InMemoryNewsletterListRepo } from "../repo.memory";

const WS = "ws-1";
let counter = 0;
const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
function makeDeps(): ListsDeps {
  counter = 0;
  return { listRepo: new InMemoryNewsletterListRepo(), clock, ids: { newId: () => `list-${++counter}` } };
}

test("ensureDefaultList: exactly one default list seeded per workspace, idempotent on repeat", async () => {
  const deps = makeDeps();
  const first = await ensureDefaultList({ deps, input: { workspaceId: WS } });
  assert.equal(first.list.isDefault, true);

  const second = await ensureDefaultList({ deps, input: { workspaceId: WS } });
  assert.equal(second.list.id, first.list.id, "idempotent — no second default list created");

  const all = await deps.listRepo.list({ workspaceId: WS });
  assert.equal(all.filter((l) => l.isDefault).length, 1);
});

test("saveList: admin-created lists always land isDefault:false", async () => {
  const deps = makeDeps();
  const { list } = await saveList({ deps, input: { workspaceId: WS, name: "VIPs", slug: "vips" } });
  assert.equal(list.isDefault, false);
  assert.equal(list.status, "active");
});

test("archiveList: the default list rejects archive with NEWSLETTER_DEFAULT_LIST_PROTECTED (AC-10)", async () => {
  const deps = makeDeps();
  const { list: defaultList } = await ensureDefaultList({ deps, input: { workspaceId: WS } });
  await assert.rejects(
    archiveList({ deps, input: { workspaceId: WS, id: defaultList.id } }),
    NewsletterDefaultListProtectedError
  );
});

test("archiveList: a non-default list archives successfully", async () => {
  const deps = makeDeps();
  const { list } = await saveList({ deps, input: { workspaceId: WS, name: "VIPs", slug: "vips" } });
  const archived = await archiveList({ deps, input: { workspaceId: WS, id: list.id } });
  assert.equal(archived.list.status, "archived");
});

test("archiveList: unknown list id is rejected", async () => {
  const deps = makeDeps();
  await assert.rejects(archiveList({ deps, input: { workspaceId: WS, id: "nope" } }), NewsletterListNotFoundError);
});
