// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap 5 of ADS-memory/reports/2026-10-04-integration-test-gaps.md, through the REAL site
 * composition on both dialects:
 *  - two saves of the same entry (and of the same menu) sent AT ONCE with the same base version:
 *    exactly one lands (200), the other gets the 409 VERSION_CONFLICT body naming the version that
 *    beat it. The guard is the repos' conditional `UPDATE ... WHERE version = ?`
 *    (`features/entries/repo.ts`, `features/navigation/repo.ts`); the sequential stale-version case is
 *    covered (`collections-entries-` / `menus-real-composition`), the simultaneous one is not, and it
 *    is the one where a read-then-write check would let both through. On Postgres the second
 *    UPDATE waits on the first's row lock and re-checks `version`; on SQLite the writes serialize.
 *  - `GET /api/admin/v1/database/timeline` refuses a bad `limit` or an undecodable `cursor` with
 *    400 VALIDATION_ERROR and the exact message (Tovu 1c134a148), instead of a 500 or a silent
 *    restart from the newest row.
 */

const TYPE = { key: "unrun_race", label: "Unrun Race", fields: [] };

interface EntryDto {
  id: string;
  title: string;
  version: number;
}

interface MenuDto {
  id: string;
  items: unknown[];
  version: number;
}

/** Sends both requests before awaiting either, and returns them as [winner, loser] by status. */
async function race(first: Promise<Response>, second: Promise<Response>): Promise<{ winner: Response; loser: Response; winnerIndex: 0 | 1 }> {
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], `exactly one save wins: got ${a.status} and ${b.status}`);
  return a.status === 200 ? { winner: a, loser: b, winnerIndex: 0 } : { winner: b, loser: a, winnerIndex: 1 };
}

async function createEntry(site: BootedSite): Promise<EntryDto> {
  await expectJson(await send(site, "POST", "/api/admin/v1/content-types", TYPE), 201);
  return (await expectJson<{ entry: EntryDto }>(await send(site, "POST", "/api/admin/v1/entries", { type: TYPE.key, slug: "race", title: "Race" }), 201)).entry;
}

const timeline = (site: BootedSite, query: string): Promise<Response> => send(site, "GET", `/api/admin/v1/database/timeline?${query}`);

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] concurrent saves [${dialect}]: two simultaneous entry saves on the same base version — one 200, one 409 VERSION_CONFLICT, and the stored entry is the winner's`, async (t) => {
    const site = await bootSite(t, dialect);
    const entry = await createEntry(site);
    const titles = ["Left writer", "Right writer"];

    const { winner, loser, winnerIndex } = await race(
      send(site, "PUT", `/api/admin/v1/entries/${entry.id}`, { title: titles[0], expectedVersion: entry.version }),
      send(site, "PUT", `/api/admin/v1/entries/${entry.id}`, { title: titles[1], expectedVersion: entry.version })
    );
    const won = (await expectJson<{ entry: EntryDto }>(winner, 200)).entry;
    assert.deepEqual({ title: won.title, version: won.version }, { title: titles[winnerIndex], version: entry.version + 1 });
    assert.deepEqual(await expectJson(loser, 409), {
      error: `expected version ${entry.version} for entry '${entry.id}', found ${entry.version + 1}`,
      code: "VERSION_CONFLICT",
    });

    const listed = (await expectJson<{ items: EntryDto[] }>(await send(site, "GET", `/api/admin/v1/entries?type=${TYPE.key}`), 200)).items;
    assert.deepEqual(
      listed.map((row) => ({ id: row.id, title: row.title, version: row.version })),
      [{ id: entry.id, title: titles[winnerIndex], version: entry.version + 1 }],
      "the losing write changed nothing"
    );
  });

  test(`[unrun] concurrent saves [${dialect}]: two simultaneous menu tree saves on the same base version — one 200, one 409 VERSION_CONFLICT, and the stored tree is the winner's`, async (t) => {
    const site = await bootSite(t, dialect);
    const menu = (
      await expectJson<{ menu: MenuDto }>(
        await send(site, "POST", `${site.ws}/menus`, { title: "Race Menu", slug: "race-menu", items: [{ id: "item-home", label: "Home", target: { kind: "url", href: "/" } }] }),
        201
      )
    ).menu;
    const trees = [
      [{ id: "item-left", label: "Left", target: { kind: "url", href: "/left" } }],
      [{ id: "item-right", label: "Right", target: { kind: "url", href: "/right" } }],
    ];

    const { winner, loser, winnerIndex } = await race(
      send(site, "PUT", `${site.ws}/menus/${menu.id}`, { items: trees[0], expectedVersion: menu.version }),
      send(site, "PUT", `${site.ws}/menus/${menu.id}`, { items: trees[1], expectedVersion: menu.version })
    );
    const won = (await expectJson<{ menu: MenuDto }>(winner, 200)).menu;
    assert.deepEqual({ items: won.items, version: won.version }, { items: trees[winnerIndex], version: menu.version + 1 });
    assert.deepEqual(await expectJson(loser, 409), {
      error: `menu '${menu.id}' was modified concurrently (expected version ${menu.version}, found ${menu.version + 1})`,
      code: "VERSION_CONFLICT",
    });

    const reread = (await expectJson<{ menu: MenuDto }>(await send(site, "GET", `${site.ws}/menus/${menu.id}`), 200)).menu;
    assert.deepEqual({ items: reread.items, version: reread.version }, { items: trees[winnerIndex], version: menu.version + 1 }, "the losing write changed nothing");
  });

  test(`[unrun] list validation [${dialect}]: the database timeline refuses a bad limit or an undecodable cursor with 400 VALIDATION_ERROR and the exact message`, async (t) => {
    const site = await bootSite(t, dialect);

    const limitMessage = "'limit' must be an integer between 1 and 200";
    for (const limit of ["0", "-1", "2.5", "abc"]) {
      assert.deepEqual(await expectJson(await timeline(site, `limit=${limit}`), 400), { error: limitMessage, code: "VALIDATION_ERROR" }, `limit=${limit}`);
    }
    assert.deepEqual(await expectJson(await timeline(site, "limit=201"), 400), { error: "requested limit 201 exceeds the server cap of 200", code: "VALIDATION_ERROR" });

    for (const cursor of ["garbage", "not-a-date::row-1", "2026-10-04T00:00:00.000Z::"]) {
      assert.deepEqual(
        await expectJson(await timeline(site, `cursor=${encodeURIComponent(cursor)}`), 400),
        { error: "invalid cursor", code: "VALIDATION_ERROR" },
        `cursor=${cursor}`
      );
    }

    // Controls: a valid page, and the cursor it hands back, are both 200.
    const first = await expectJson<{ items: Array<{ id: string }>; nextCursor: string | null }>(await timeline(site, "limit=1"), 200);
    assert.ok(first.items.length <= 1);
    if (first.nextCursor !== null) {
      const next = await expectJson<{ items: Array<{ id: string }> }>(await timeline(site, `limit=1&cursor=${encodeURIComponent(first.nextCursor)}`), 200);
      assert.notDeepEqual(next.items.map((row) => row.id), first.items.map((row) => row.id), "the cursor advances instead of restarting");
    }

    // A date-only toDate covers the whole day (1c134a148): today's rows are all still listed.
    const today = new Date().toISOString().slice(0, 10);
    const all = await expectJson<{ items: Array<{ id: string }> }>(await timeline(site, `fromDate=${today}`), 200);
    const throughToday = await expectJson<{ items: Array<{ id: string }> }>(await timeline(site, `fromDate=${today}&toDate=${today}`), 200);
    assert.deepEqual(throughToday.items.map((row) => row.id), all.items.map((row) => row.id));
  });
}
