// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Round 4 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — taxonomy and term CRUD
 * (`routes/taxonomy/{create-taxonomy,create-term,rename-term,delete-term,delete-taxonomy,list,
 * assign-terms}.ts`) through the REAL site composition on both dialects.
 *
 * The PGlite smoke test creates one taxonomy and lists it. The hermetic route tests run on
 * `app.ts`'s root, which binds an inert `findForTrash` stub for taxonomy, so the real Trash binding
 * (`features/trash/registry.ts` — the `TERM_HAS_CHILDREN` blocker, "hidden while trashed, restored
 * back" assignments) has never answered an HTTP request. Merge plan/confirm/execute is round 2's
 * `gated-mutations-real-composition` and is not repeated here.
 *
 * Hierarchy refusals: `createTerm` cannot form a cycle (a new term has no descendants and there is
 * no reparent route), so the reachable refusals are the other three rungs of
 * `validateHierarchyAssignment` — non-hierarchical taxonomy, unknown parent, cross-taxonomy parent.
 */

const TAX = "/api/admin/v1/taxonomy";

interface Taxonomy {
  id: string;
  name: string;
  hierarchical: boolean;
  status: string;
  version: number;
}

interface Term {
  id: string;
  taxonomyId: string;
  parentId: string | null;
  name: string;
  status: string;
  version: number;
}

async function createTaxonomy(site: BootedSite, name: string, hierarchical: boolean): Promise<Taxonomy> {
  return (await expectJson<{ taxonomy: Taxonomy }>(await send(site, "POST", TAX, { name, hierarchical }), 201)).taxonomy;
}

async function createTerm(site: BootedSite, taxonomyId: string, name: string, parentId?: string): Promise<Term> {
  return (await expectJson<{ term: Term }>(await send(site, "POST", `${TAX}/${taxonomyId}/terms`, { name, ...(parentId ? { parentId } : {}) }), 201)).term;
}

async function listed(site: BootedSite, taxonomyId: string): Promise<{ taxonomy: Taxonomy; terms: Term[] } | undefined> {
  const body = await expectJson<{ items: Array<{ taxonomy: Taxonomy; terms: Term[] }> }>(await send(site, "GET", TAX), 200);
  return body.items.find((item) => item.taxonomy.id === taxonomyId);
}

async function assignedTermIds(site: BootedSite, postId: string): Promise<string[]> {
  return (await expectJson<{ termIds: string[] }>(await send(site, "GET", `${TAX}/assigned-terms?contentType=post&contentId=${postId}`), 200)).termIds;
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] taxonomy [${dialect}]: a hierarchical taxonomy, a parent and a child term persist and list with their parent link; rename bumps the version`, async (t) => {
    const site = await bootSite(t, dialect);
    const taxonomy = await createTaxonomy(site, "unrun-topics", true);
    assert.deepEqual({ name: taxonomy.name, hierarchical: taxonomy.hierarchical, status: taxonomy.status }, { name: "unrun-topics", hierarchical: true, status: "active" });

    const parent = await createTerm(site, taxonomy.id, "Science");
    const child = await createTerm(site, taxonomy.id, "Physics", parent.id);
    assert.deepEqual({ parentId: child.parentId, taxonomyId: child.taxonomyId, status: child.status, version: child.version }, { parentId: parent.id, taxonomyId: taxonomy.id, status: "active", version: 1 });

    const row = await listed(site, taxonomy.id);
    assert.ok(row, "the taxonomy lists");
    assert.equal(row.taxonomy.hierarchical, true, "the boolean survives the dialect");
    assert.deepEqual(
      row.terms.map((term) => ({ id: term.id, parentId: term.parentId, name: term.name })).sort((a, b) => a.name.localeCompare(b.name)),
      [
        { id: child.id, parentId: parent.id, name: "Physics" },
        { id: parent.id, parentId: null, name: "Science" },
      ]
    );

    const renamed = await expectJson<{ term: Term }>(await send(site, "PUT", `${TAX}/terms/${child.id}`, { newName: "Quantum physics" }), 200);
    assert.equal(renamed.term.name, "Quantum physics");
    assert.equal(renamed.term.version, child.version + 1);
    const after = await listed(site, taxonomy.id);
    assert.equal(after?.terms.find((term) => term.id === child.id)?.name, "Quantum physics");
  });

  test(`[unrun] taxonomy [${dialect}]: parent refusals — non-hierarchical, unknown parent, cross-taxonomy parent — are 400 VALIDATION_ERROR and write nothing`, async (t) => {
    const site = await bootSite(t, dialect);
    const flat = await createTaxonomy(site, "unrun-tags", false);
    const tree = await createTaxonomy(site, "unrun-tree", true);
    const flatTerm = await createTerm(site, flat.id, "red");

    assert.deepEqual(await expectJson(await send(site, "POST", `${TAX}/${flat.id}/terms`, { name: "child", parentId: flatTerm.id }), 400), {
      error: `taxonomy '${flat.id}' is not hierarchical; parentId must be null`,
      code: "VALIDATION_ERROR",
    });
    assert.deepEqual(await expectJson(await send(site, "POST", `${TAX}/${tree.id}/terms`, { name: "orphan", parentId: "no-such-term" }), 400), {
      error: "parent term 'no-such-term' was not found",
      code: "VALIDATION_ERROR",
    });
    assert.deepEqual(await expectJson(await send(site, "POST", `${TAX}/${tree.id}/terms`, { name: "crosser", parentId: flatTerm.id }), 400), {
      error: `parent term '${flatTerm.id}' belongs to taxonomy '${flat.id}', not '${tree.id}'`,
      code: "VALIDATION_ERROR",
    });
    assert.deepEqual(await expectJson(await send(site, "POST", `${TAX}/no-such-taxonomy/terms`, { name: "x" }), 404), {
      error: "taxonomy 'no-such-taxonomy' was not found",
      code: "TAXONOMY_NOT_FOUND",
    });

    assert.deepEqual((await listed(site, flat.id))?.terms.map((term) => term.id), [flatTerm.id]);
    assert.deepEqual((await listed(site, tree.id))?.terms, []);
  });

  test(`[unrun] taxonomy [${dialect}]: a parent term with a child is refused 409 TERM_HAS_CHILDREN; trashing the child first then the parent succeeds`, async (t) => {
    const site = await bootSite(t, dialect);
    const taxonomy = await createTaxonomy(site, "unrun-places", true);
    const parent = await createTerm(site, taxonomy.id, "Europe");
    const child = await createTerm(site, taxonomy.id, "France", parent.id);

    assert.deepEqual(await expectJson(await send(site, "DELETE", `${TAX}/terms/${parent.id}`), 409), {
      error: `term '${parent.id}' still has child terms`,
      code: "TERM_HAS_CHILDREN",
      count: 1,
    });

    const childGone = await expectJson<{ trashed: boolean; id: string }>(await send(site, "DELETE", `${TAX}/terms/${child.id}`), 200);
    assert.deepEqual({ trashed: childGone.trashed, id: childGone.id }, { trashed: true, id: child.id });
    // The blocker counts live AND trashed children (registry.ts), so the parent is still blocked.
    assert.deepEqual(await expectJson(await send(site, "DELETE", `${TAX}/terms/${parent.id}`), 409), {
      error: `term '${parent.id}' still has child terms`,
      code: "TERM_HAS_CHILDREN",
      count: 1,
    });
    assert.deepEqual((await listed(site, taxonomy.id))?.terms.map((term) => term.id), [parent.id], "the trashed child is hidden from the list");

    const trash = await expectJson<{ items: Array<{ entityType: string; entityId: string; title: string; subtitle?: string | null }> }>(await send(site, "GET", `/api/admin/v1/workspaces/${site.deps.workspaceId}/trash`), 200);
    assert.deepEqual(
      trash.items.filter((item) => item.entityId === child.id).map((item) => ({ entityType: item.entityType, title: item.title })),
      [{ entityType: "term", title: "France" }]
    );
    assert.deepEqual(await expectJson(await send(site, "DELETE", `${TAX}/terms/no-such-term`), 404), { error: "term 'no-such-term' was not found", code: "TERM_NOT_FOUND" });
  });

  test(`[unrun] taxonomy [${dialect}]: terms assigned to a post are hidden while the term is trashed and come back assigned after restore`, async (t) => {
    const site = await bootSite(t, dialect);
    const taxonomy = await createTaxonomy(site, "unrun-labels", false);
    const keep = await createTerm(site, taxonomy.id, "keep");
    const flip = await createTerm(site, taxonomy.id, "flip");
    const { post } = await expectJson<{ post: { id: string } }>(await send(site, "POST", `${site.ws}/posts`, { title: "Unrun tagged post" }), 201);

    const assigned = await send(site, "POST", `${TAX}/assign-terms`, { contentType: "post", contentId: post.id, termIds: [keep.id, flip.id] });
    assert.equal(assigned.status, 204);
    assert.deepEqual(await assignedTermIds(site, post.id), [keep.id, flip.id].sort());

    await expectJson(await send(site, "DELETE", `${TAX}/terms/${flip.id}`), 200);
    assert.deepEqual(await assignedTermIds(site, post.id), [keep.id], "a trashed term's assignment is hidden, not deleted");

    const restored = await expectJson<unknown>(await send(site, "POST", `${site.ws}/trash/restore`, { items: [{ entityType: "term", entityId: flip.id }] }), 200);
    assert.deepEqual(restored, { restored: 1, results: [{ entityType: "term", entityId: flip.id, outcome: "restored" }] });
    assert.deepEqual(await assignedTermIds(site, post.id), [keep.id, flip.id].sort(), "restore brings the assignment back");

    const unassigned = await send(site, "POST", `${TAX}/unassign-terms`, { contentType: "post", contentId: post.id, termIds: [keep.id] });
    assert.equal(unassigned.status, 204);
    assert.deepEqual(await assignedTermIds(site, post.id), [flip.id]);
  });

  test(`[unrun] taxonomy [${dialect}]: DELETE taxonomy moves it to the Trash and hides it with its terms; restore brings both back`, async (t) => {
    const site = await bootSite(t, dialect);
    const taxonomy = await createTaxonomy(site, "unrun-seasons", false);
    const term = await createTerm(site, taxonomy.id, "winter");

    const trashed = await expectJson<{ trashed: boolean; id: string }>(await send(site, "DELETE", `${TAX}/${taxonomy.id}`), 200);
    assert.deepEqual({ trashed: trashed.trashed, id: trashed.id }, { trashed: true, id: taxonomy.id });
    assert.equal(await listed(site, taxonomy.id), undefined, "a trashed taxonomy is hidden from the list");

    await expectJson(await send(site, "POST", `${site.ws}/trash/restore`, { items: [{ entityType: "taxonomy", entityId: taxonomy.id }] }), 200);
    const back = await listed(site, taxonomy.id);
    assert.equal(back?.taxonomy.status, "active");
    assert.deepEqual(back?.terms.map((row) => row.id), [term.id]);
    assert.deepEqual(await expectJson(await send(site, "DELETE", `${TAX}/no-such-taxonomy`), 404), {
      error: "taxonomy 'no-such-taxonomy' was not found",
      code: "TAXONOMY_NOT_FOUND",
    });
  });
}
