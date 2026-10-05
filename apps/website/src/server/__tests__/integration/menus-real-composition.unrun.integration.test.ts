// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #4 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — navigation menus through
 * the REAL site composition on both dialects.
 *
 * `admin-menus-routes.test.ts` and `admin-menu-page-roundtrip.test.ts` drive these routes over the
 * hermetic `createRouteDeps()` root only; `features/navigation/__tests__/repo.sqlite*.test.ts` prove
 * the repo on SQLite. A menu's item tree is a nested document stored as JSON, so a Postgres JSONB
 * column (key reordering, `undefined` vs absent) and the compare-and-set `expectedVersion` path are
 * exactly what the hermetic root cannot see.
 */

const TREE = [
  { id: "item-home", label: "Home", target: { kind: "url", href: "/" } },
  {
    id: "item-docs",
    label: "Docs",
    target: { kind: "url", href: "/docs" },
    children: [{ id: "item-docs-start", label: "Start here", target: { kind: "url", href: "/docs/start" } }],
  },
];

interface MenuDto {
  id: string;
  slug: string;
  title: string;
  status: string;
  items: unknown[];
  locations: string[];
  version: number;
}

async function createMenu(site: BootedSite): Promise<MenuDto> {
  return (await expectJson<{ menu: MenuDto }>(await send(site, "POST", `${site.ws}/menus`, { title: "Unrun Main", slug: "unrun-main", items: TREE }), 201)).menu;
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] menus [${dialect}]: a nested item tree written through the admin API reads back identically, by id and in the list`, async (t) => {
    const site = await bootSite(t, dialect);
    const created = await createMenu(site);
    assert.deepEqual({ slug: created.slug, title: created.title, items: created.items, locations: created.locations }, { slug: "unrun-main", title: "Unrun Main", items: TREE, locations: [] });

    const one = await expectJson<{ menu: MenuDto }>(await send(site, "GET", `${site.ws}/menus/${created.id}`), 200);
    assert.deepEqual(one.menu, created, "the stored row round-trips unchanged");

    const listed = await expectJson<{ menus: MenuDto[] }>(await send(site, "GET", `${site.ws}/menus`), 200);
    assert.deepEqual(listed.menus.filter((menu) => menu.id === created.id), [created]);
  });

  test(`[unrun] menus [${dialect}]: PUT replaces the tree at the current version; a stale expectedVersion is 409 and leaves the stored tree alone`, async (t) => {
    const site = await bootSite(t, dialect);
    const created = await createMenu(site);
    const nextTree = [{ id: "item-about", label: "About", target: { kind: "url", href: "/about" } }];

    const replaced = await expectJson<{ menu: MenuDto }>(
      await send(site, "PUT", `${site.ws}/menus/${created.id}`, { items: nextTree, expectedVersion: created.version }),
      200
    );
    assert.deepEqual(replaced.menu.items, nextTree);
    assert.equal(replaced.menu.version, created.version + 1);

    const stale = await send(site, "PUT", `${site.ws}/menus/${created.id}`, { items: [], expectedVersion: created.version });
    assert.equal(stale.status, 409, await stale.clone().text());
    const reread = await expectJson<{ menu: MenuDto }>(await send(site, "GET", `${site.ws}/menus/${created.id}`), 200);
    assert.deepEqual(reread.menu.items, nextTree, "the stale write changed nothing");
  });

  test(`[unrun] menus [${dialect}]: DELETE moves the menu out of the list and GET by id then 404s`, async (t) => {
    const site = await bootSite(t, dialect);
    const created = await createMenu(site);

    const trashed = await expectJson<{ trashed: boolean; id: string }>(await send(site, "DELETE", `${site.ws}/menus/${created.id}`), 200);
    assert.deepEqual({ trashed: trashed.trashed, id: trashed.id }, { trashed: true, id: created.id });

    const listed = await expectJson<{ menus: MenuDto[] }>(await send(site, "GET", `${site.ws}/menus`), 200);
    assert.equal(listed.menus.some((menu) => menu.id === created.id), false);
    const gone = await expectJson<{ error: string }>(await send(site, "GET", `${site.ws}/menus/${created.id}`), 404);
    assert.equal(gone.error, `menu '${created.id}' was not found`);
  });
}
