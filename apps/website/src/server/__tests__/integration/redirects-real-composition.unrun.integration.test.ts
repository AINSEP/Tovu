// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #4 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — Redirects, admin write →
 * live site → Trash → restore, through the REAL site composition on both dialects.
 *
 * Every existing redirects route test (`redirects-create.test.ts`, `redirects-site-serving.test.ts`,
 * `redirects-auth.test.ts`) mounts the routes on the hermetic `createRouteDeps()` root, whose
 * redirect repo is in memory. The Kysely repo is dialect-tested on its own
 * (`features/redirects/__tests__/repo.dialects.test.ts`), but the seam between them — the site
 * composition's phase-handler registration (`deps.ts` `registerRedirectsPhaseHandlers`) resolving a
 * rule the admin route just wrote to SQLite/Postgres, and the redirect Trash adapter disabling and
 * re-enabling it — runs nowhere.
 */

const RULE = { matchType: "exact", fromPattern: "/unrun-old-path", toTarget: "/unrun-new-path", statusCode: 301, override: true };

interface RedirectDto {
  id: string;
  matchType: string;
  fromPattern: string;
  toTarget: string;
  statusCode: number;
  status: string;
  override: boolean;
  version: number;
}

async function visit(site: BootedSite, pathname: string): Promise<{ status: number; location: string | null }> {
  const res = await fetch(`${site.baseUrl}${pathname}`, { redirect: "manual" });
  await res.arrayBuffer();
  return { status: res.status, location: res.headers.get("location") };
}

async function createRule(site: BootedSite, body: Record<string, unknown> = RULE): Promise<RedirectDto> {
  return (await expectJson<{ data: RedirectDto }>(await send(site, "POST", `${site.ws}/redirects`, body), 201)).data;
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] redirects [${dialect}]: a rule written through the admin API is persisted, listed, and served by the live site`, async (t) => {
    const site = await bootSite(t, dialect);
    assert.equal((await visit(site, RULE.fromPattern)).status, 404, "nothing lives at the source path before the rule exists");

    const created = await createRule(site);
    assert.deepEqual(
      { matchType: created.matchType, fromPattern: created.fromPattern, toTarget: created.toTarget, statusCode: created.statusCode, override: created.override, status: created.status },
      { matchType: "exact", fromPattern: RULE.fromPattern, toTarget: RULE.toTarget, statusCode: 301, override: true, status: "active" }
    );

    const listed = await expectJson<{ data: RedirectDto[] }>(await send(site, "GET", `${site.ws}/redirects`), 200);
    assert.deepEqual(listed.data.map((rule) => rule.id), [created.id]);
    const one = await expectJson<{ data: RedirectDto }>(await send(site, "GET", `${site.ws}/redirects/${created.id}`), 200);
    assert.deepEqual(one.data, created, "a read-back after the write returns the same row (booleans and numbers survive the dialect)");

    assert.deepEqual(await visit(site, RULE.fromPattern), { status: 301, location: RULE.toTarget });
  });

  test(`[unrun] redirects [${dialect}]: PATCH changes the served status code; a second exact rule for the same path is 409 REDIRECT_CONFLICT`, async (t) => {
    const site = await bootSite(t, dialect);
    const created = await createRule(site);

    const patched = await expectJson<{ data: RedirectDto }>(await send(site, "PATCH", `${site.ws}/redirects/${created.id}`, { statusCode: 302 }), 200);
    assert.equal(patched.data.statusCode, 302);
    assert.equal(patched.data.version, created.version + 1);
    assert.deepEqual(await visit(site, RULE.fromPattern), { status: 302, location: RULE.toTarget });

    const duplicate = await expectJson<{ code: string; error: string }>(await send(site, "POST", `${site.ws}/redirects`, { ...RULE, toTarget: "/somewhere-else" }), 409);
    assert.deepEqual(duplicate, { code: "REDIRECT_CONFLICT", error: `an active exact rule for '${RULE.fromPattern}' already exists` });
  });

  test(`[unrun] redirects [${dialect}]: DELETE moves the rule to the Trash and the site stops redirecting; restoring it from the Trash brings the redirect back`, async (t) => {
    const site = await bootSite(t, dialect);
    const created = await createRule(site);

    const tombstoned = await expectJson<{ data: RedirectDto }>(await send(site, "DELETE", `${site.ws}/redirects/${created.id}`), 200);
    assert.equal(tombstoned.data.status, "disabled");
    assert.equal((await visit(site, RULE.fromPattern)).status, 404, "a trashed rule no longer redirects");

    const trash = await expectJson<{ items: Array<{ entityType: string; entityId: string; title: string }> }>(await send(site, "GET", `${site.ws}/trash`), 200);
    const rows = trash.items.filter((item) => item.entityId === created.id);
    assert.deepEqual(rows.map((row) => ({ entityType: row.entityType, title: row.title })), [{ entityType: "redirect", title: RULE.fromPattern }]);

    const editWhileTrashed = await expectJson<{ code: string }>(await send(site, "PATCH", `${site.ws}/redirects/${created.id}`, { statusCode: 307 }), 409);
    assert.equal(editWhileTrashed.code, "ENTITY_IN_TRASH");

    const restored = await expectJson<unknown>(
      await send(site, "POST", `${site.ws}/trash/restore`, { items: [{ entityType: "redirect", entityId: created.id }] }),
      200
    );
    assert.deepEqual(restored, { restored: 1, results: [{ entityType: "redirect", entityId: created.id, outcome: "restored" }] });
    assert.deepEqual(await visit(site, RULE.fromPattern), { status: 301, location: RULE.toTarget }, "the restored rule redirects again");
  });

  test(`[unrun] redirects [${dialect}]: an invalid status code is 400 VALIDATION_ERROR and writes nothing`, async (t) => {
    const site = await bootSite(t, dialect);
    const refused = await expectJson<{ code: string }>(await send(site, "POST", `${site.ws}/redirects`, { ...RULE, statusCode: 200 }), 400);
    assert.equal(refused.code, "VALIDATION_ERROR");
    const listed = await expectJson<{ data: RedirectDto[] }>(await send(site, "GET", `${site.ws}/redirects`), 200);
    assert.deepEqual(listed.data, []);
  });
}
