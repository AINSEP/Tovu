// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #2 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — the change-set audit/undo
 * trail (ADR-008/ADR-046) end to end through the REAL site composition, on both dialects.
 *
 * `change-sets-revert.test.ts` covers every refusal branch of the revert route, but over the
 * hermetic `createRouteDeps()` with hand-built change-sets and fake reverters; `change-sets-get-list
 * .test.ts` likewise. Nothing drives a real admin write into the persisted `change_sets` /
 * `change_set_items` tables (`platform/db/repos/change-set-repo.ts`) and then undoes it through the
 * real post reverter the site composition registers — the whole point of ADR-046's move off the
 * in-memory repo. Also unproven on the real store: the `Idempotency-Key` replay guard, which relies
 * on the persisted `idempotency_key` column rather than a Map.
 */

interface ChangeSetHeader {
  id: string;
  workspaceId: string;
  actorId: string | null;
  status: string;
  summary: string;
  appliedAt: string | null;
  revertedAt: string | null;
}

async function createPost(site: BootedSite, title: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${site.baseUrl}${site.ws}/posts`, {
    method: "POST",
    headers: { cookie: site.cookie, "content-type": "application/json", ...headers },
    body: JSON.stringify({ title, status: "draft" }),
  });
}

async function changeSets(site: BootedSite): Promise<ChangeSetHeader[]> {
  return (await expectJson<{ changeSets: ChangeSetHeader[] }>(await send(site, "GET", `${site.ws}/change-sets`), 200)).changeSets;
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] change-set revert [${dialect}]: a post title edit is recorded as an applied change-set and reverting it restores the prior title`, async (t) => {
    const site = await bootSite(t, dialect);
    const { post } = await expectJson<{ post: { id: string; slug: string } }>(await createPost(site, "Original title"), 201);

    const edited = await expectJson<{ post: { title: string } }>(
      await send(site, "PUT", `${site.ws}/posts/${post.id}`, { title: "Edited title", slug: post.slug, status: "draft" }),
      200
    );
    assert.equal(edited.post.title, "Edited title");

    const updates = (await changeSets(site)).filter((cs) => cs.summary === `Update post ${post.id}`);
    assert.equal(updates.length, 1, "exactly one change-set records the edit");
    const [update] = updates;
    assert.equal(update.status, "applied");
    assert.equal(update.workspaceId, site.deps.workspaceId);
    assert.equal(typeof update.actorId, "string", "the change-set is attributed to the signed-in owner");
    assert.equal(update.revertedAt, null);

    const detail = await expectJson<{ changeSet: ChangeSetHeader; items: Array<Record<string, unknown>> }>(
      await send(site, "GET", `${site.ws}/change-sets/${update.id}`),
      200
    );
    assert.deepEqual(detail.changeSet, update);
    assert.equal(detail.items.length, 1);
    assert.deepEqual(
      { entityType: detail.items[0].entityType, entityId: detail.items[0].entityId, operation: detail.items[0].operation, revertible: detail.items[0].revertible, position: detail.items[0].position },
      { entityType: "post", entityId: post.id, operation: "update", revertible: true, position: 0 }
    );

    const reverted = await expectJson<{ changeSet: ChangeSetHeader }>(await send(site, "POST", `${site.ws}/change-sets/${update.id}/revert`), 200);
    assert.equal(reverted.changeSet.id, update.id);
    assert.equal(reverted.changeSet.status, "reverted");
    assert.equal(typeof reverted.changeSet.revertedAt, "string");

    const reread = await expectJson<{ post: { title: string } }>(await send(site, "GET", `${site.ws}/posts/${post.id}`), 200);
    assert.equal(reread.post.title, "Original title", "the real post reverter put the prior title back");

    const kernel = site.deps.contentKernel;
    assert.ok(kernel);
    const stored = await kernel.run((db) => db.selectFrom("change_sets").select(["status", "reverted_at"]).where("id", "=", update.id).executeTakeFirst());
    assert.equal(stored?.status, "reverted", "the reverted status is persisted, not just returned");
    assert.equal(stored?.reverted_at, reverted.changeSet.revertedAt);

    const again = await expectJson<{ code: string }>(await send(site, "POST", `${site.ws}/change-sets/${update.id}/revert`), 409);
    assert.equal(again.code, "CHANGE_SET_INVALID_STATUS", "a reverted change-set cannot be reverted twice");
  });

  test(`[unrun] change-set idempotency [${dialect}]: replaying a create with the same Idempotency-Key is refused 409 DUPLICATE_COMMAND and creates nothing`, async (t) => {
    const site = await bootSite(t, dialect);
    const key = `unrun-idem-${dialect}`;
    await expectJson(await createPost(site, "Created once", { "Idempotency-Key": key }), 201);

    const replay = await expectJson<{ code: string; changeSetId: string }>(await createPost(site, "Created once", { "Idempotency-Key": key }), 409);
    assert.equal(replay.code, "DUPLICATE_COMMAND");

    const kernel = site.deps.contentKernel;
    assert.ok(kernel);
    const keyed = await kernel.run((db) => db.selectFrom("change_sets").select("id").where("idempotency_key", "=", key).execute());
    assert.deepEqual(keyed.map((row) => row.id), [replay.changeSetId], "the 409 names the one change-set that holds the key");
    const posts = await kernel.run((db) => db.selectFrom("posts").select("id").where("title", "=", "Created once").execute());
    assert.equal(posts.length, 1, "the replay did not leave a second post behind");
  });

  test(`[unrun] change-set get [${dialect}]: an unknown change-set id is 404 CHANGE_SET_NOT_FOUND`, async (t) => {
    const site = await bootSite(t, dialect);
    const missing = await expectJson<unknown>(await send(site, "GET", `${site.ws}/change-sets/no-such-change-set`), 404);
    assert.deepEqual(missing, { error: "change set was not found", code: "CHANGE_SET_NOT_FOUND" });
  });
}
