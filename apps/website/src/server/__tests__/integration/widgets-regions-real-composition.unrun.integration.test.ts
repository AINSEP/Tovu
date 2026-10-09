// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { builtInThemesDir } from "../../runtime/composition/deps.js";
import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Round 5 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — widgets and widget
 * regions (`routes/widgets/{create,get-by-id,list,region-bind,region-get,regions-list,
 * region-mutate-placements,trash}.ts`) through the REAL site composition on both dialects, ending at
 * the public render.
 *
 * Every widgets route test mounts the hermetic root (in-memory entry + binding repos). Unproven until
 * here: a widget's `config` JSON and a region's placement document round-tripping SQLite/Postgres
 * through the generic `entries` table, the derived `widget_region_bindings` row, the area's version
 * compare-and-set, and the public page resolving the stored placements (`resolvePageWidgets`,
 * `public-http/routes/site/pages.ts` `resolveWidgetsForRender`).
 *
 * No stock theme declares `regions` (`content/themes/*\/*\/theme.json`), so the region render test
 * copies the package's stock `basic-declarative` theme into the site folder as `unrun-regions`, declares one
 * region, puts a `{"type":"region"}` block on its home template, and picks it up through
 * `POST .../themes/rescan` — the route that exists for exactly a theme dropped in after boot. It
 * re-activates the original theme before it ends.
 */

const REGION = "unrun-aside";

interface WidgetDto {
  id: string;
  slug: string;
  title: string;
  status: string;
  widgetType: string;
  config: Record<string, unknown>;
  version: number;
}

interface Placement {
  placementId: string;
  widgetEntryId: string;
  enabled: boolean;
}

interface AreaDto {
  id: string;
  regionKey: string;
  doc: { schemaVersion: number; placements: Placement[] };
  version: number;
}

async function createTextWidget(site: BootedSite, title: string, body: string): Promise<WidgetDto> {
  return (await expectJson<{ widget: WidgetDto }>(await send(site, "POST", `${site.ws}/widgets`, { widgetType: "text", title, config: { body } }), 201)).widget;
}

async function bindRegion(site: BootedSite, regionKey: string = REGION): Promise<AreaDto> {
  return (await expectJson<{ area: AreaDto }>(await send(site, "POST", `${site.ws}/widgets/regions`, { regionKey }), 201)).area;
}

function putPlacements(site: BootedSite, baseVersion: number, placements: Placement[], regionKey: string = REGION): Promise<Response> {
  return send(site, "PUT", `${site.ws}/widgets/regions/${regionKey}`, { baseVersion, placements });
}

function textWidgetHtml(body: string): string {
  return `<div class="widget widget-text">${body}</div>`;
}

async function visit(site: BootedSite, pathname: string): Promise<string> {
  const res = await fetch(`${site.baseUrl}${pathname}`);
  const html = await res.text();
  assert.equal(res.status, 200, html.slice(0, 400));
  return html;
}

/**
 * Copies the package's stock declarative theme into the site as `unrun-regions` with one declared
 * region on its home. Read from the package, not the site: a new site is seeded with `tovu-starter`
 * only (owner, 2026-10-08).
 */
function writeRegionTheme(site: BootedSite): void {
  const source = path.join(builtInThemesDir(), "declarative", "basic-declarative");
  const target = path.join(site.siteDir, "themes", "declarative", "unrun-regions");
  assert.ok(fs.existsSync(path.join(source, "theme.json")), `the package ships the stock declarative theme at ${source}`);
  fs.cpSync(source, target, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(target, "theme.json"), "utf8")) as Record<string, unknown>;
  fs.writeFileSync(path.join(target, "theme.json"), JSON.stringify({ ...manifest, id: "unrun-regions", name: "Unrun Regions", regions: [REGION] }, null, 2));
  fs.writeFileSync(
    path.join(target, "render", "pages", "home.json"),
    JSON.stringify({ type: "doc", content: [{ type: "region", key: REGION }] }, null, 2)
  );
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] widgets [${dialect}]: a text widget's config round-trips the dialect; a bad config or an unregistered type is 400 and creates nothing`, async (t) => {
    const site = await bootSite(t, dialect);
    const widget = await createTextWidget(site, "Unrun Text", "Line one\nLine two");
    assert.deepEqual(
      { title: widget.title, status: widget.status, widgetType: widget.widgetType, config: widget.config },
      { title: "Unrun Text", status: "active", widgetType: "text", config: { body: "Line one\nLine two" } }
    );

    const one = await expectJson<{ widget: WidgetDto }>(await send(site, "GET", `${site.ws}/widgets/${widget.id}`), 200);
    assert.deepEqual(one.widget, widget, "a read-back returns exactly the created row");
    const listed = await expectJson<{ widgets: WidgetDto[] }>(await send(site, "GET", `${site.ws}/widgets?widgetType=text`), 200);
    assert.deepEqual(listed.widgets.filter((row) => row.id === widget.id), [widget]);

    const badConfig = await expectJson<{ code: string }>(
      await send(site, "POST", `${site.ws}/widgets`, { widgetType: "text", title: "No body", config: { heading: "x" } }),
      400
    );
    assert.equal(badConfig.code, "WIDGETS_CONFIG_VALIDATION_ERROR");
    const unregistered = await expectJson<{ code: string; details: { widgetType: string } }>(
      await send(site, "POST", `${site.ws}/widgets`, { widgetType: "unrun-carousel", title: "Nope", config: {} }),
      400
    );
    assert.deepEqual({ code: unregistered.code, details: unregistered.details }, { code: "WIDGETS_TYPE_UNREGISTERED", details: { widgetType: "unrun-carousel" } });
    assert.deepEqual(await expectJson(await send(site, "POST", `${site.ws}/widgets`, { title: "No type" }), 400), {
      error: "widgetType and title are required strings",
      code: "VALIDATION_ERROR",
    });

    const after = await expectJson<{ widgets: WidgetDto[] }>(await send(site, "GET", `${site.ws}/widgets`), 200);
    assert.deepEqual(after.widgets.filter((row) => ["No body", "Nope", "No type"].includes(row.title)), []);
  });

  test(`[unrun] widgets [${dialect}]: binding a region is idempotent; placements persist in order, reorder at the area version, and a stale version is 409`, async (t) => {
    const site = await bootSite(t, dialect);
    const first = await createTextWidget(site, "Unrun First", "first");
    const second = await createTextWidget(site, "Unrun Second", "second");

    const area = await bindRegion(site);
    assert.deepEqual({ regionKey: area.regionKey, placements: area.doc.placements }, { regionKey: REGION, placements: [] });
    const again = await bindRegion(site);
    assert.equal(again.id, area.id, "a second bind of the same key returns the existing area, never a duplicate");

    const p1 = { placementId: randomUUID(), widgetEntryId: first.id, enabled: true };
    const p2 = { placementId: randomUUID(), widgetEntryId: second.id, enabled: true };
    const placed = (await expectJson<{ area: AreaDto }>(await putPlacements(site, area.version, [p1, p2]), 200)).area;
    assert.deepEqual(placed.doc.placements, [p1, p2]);
    assert.equal(placed.version, area.version + 1);

    const region = await expectJson<{ area: AreaDto; placements: Array<Placement & { widgetTitle: string | null; widgetType: string | null; broken: boolean }> }>(
      await send(site, "GET", `${site.ws}/widgets/regions/${REGION}`),
      200
    );
    assert.deepEqual(region.placements, [
      { ...p1, widgetTitle: "Unrun First", widgetType: "text", broken: false },
      { ...p2, widgetTitle: "Unrun Second", widgetType: "text", broken: false },
    ]);

    const reordered = (await expectJson<{ area: AreaDto }>(await putPlacements(site, placed.version, [p2, p1]), 200)).area;
    assert.deepEqual(reordered.doc.placements, [p2, p1], "placement ids survive a reorder (stable locators)");

    const stale = await expectJson<{ code: string; details: { currentVersion: number } }>(await putPlacements(site, placed.version, [p1]), 409);
    assert.deepEqual({ code: stale.code, details: stale.details }, { code: "WIDGETS_AREA_CONFLICT", details: { currentVersion: reordered.version } });

    const { regions } = await expectJson<{ regions: Array<{ regionKey: string; areaEntryId: string; placementCount: number }> }>(
      await send(site, "GET", `${site.ws}/widgets/regions`),
      200
    );
    const row = regions.find((entry) => entry.regionKey === REGION);
    assert.deepEqual({ areaEntryId: row?.areaEntryId, placementCount: row?.placementCount }, { areaEntryId: area.id, placementCount: 2 }, "the stale write changed nothing");
  });

  test(`[unrun] widgets [${dialect}]: placements naming a missing widget, duplicate placement ids, and an unbound region are refused`, async (t) => {
    const site = await bootSite(t, dialect);
    const widget = await createTextWidget(site, "Unrun Only", "only");
    const area = await bindRegion(site);

    const missing = await expectJson<{ code: string }>(
      await putPlacements(site, area.version, [{ placementId: randomUUID(), widgetEntryId: randomUUID(), enabled: true }]),
      404
    );
    assert.equal(missing.code, "WIDGETS_INSTANCE_NOT_FOUND");

    const dup = randomUUID();
    assert.deepEqual(
      await expectJson(
        await putPlacements(site, area.version, [
          { placementId: dup, widgetEntryId: widget.id, enabled: true },
          { placementId: dup, widgetEntryId: widget.id, enabled: false },
        ]),
        400
      ),
      {
        error: "each placement must be { placementId: string, widgetEntryId: string, enabled: boolean }, with no duplicate placementId",
        code: "VALIDATION_ERROR",
      }
    );

    assert.deepEqual(
      await expectJson(await putPlacements(site, 1, [{ placementId: randomUUID(), widgetEntryId: widget.id, enabled: true }], "unrun-unbound"), 404),
      { error: "region 'unrun-unbound' is not bound", code: "WIDGETS_AREA_NOT_FOUND" }
    );
    assert.deepEqual(await expectJson(await send(site, "POST", `${site.ws}/widgets/regions`, { regionKey: "   " }), 400), {
      error: "regionKey is required",
      code: "VALIDATION_ERROR",
    });

    const region = await expectJson<{ area: AreaDto }>(await send(site, "GET", `${site.ws}/widgets/regions/${REGION}`), 200);
    assert.deepEqual({ placements: region.area.doc.placements, version: region.area.version }, { placements: [], version: area.version });
  });

  test(`[unrun] widgets [${dialect}]: a theme-declared region renders its enabled widgets in stored order on the public home; reorder, disable and trash show up on the next request`, async (t) => {
    const site = await bootSite(t, dialect);
    const before = await expectJson<{ settings: { activeThemeId: string } }>(await send(site, "GET", `${site.ws}/presentation`), 200);
    const original = before.settings.activeThemeId;
    t.after(async () => {
      await send(site, "PATCH", `${site.ws}/presentation`, { activeThemeId: original }).catch(() => undefined);
    });

    writeRegionTheme(site);
    const rescan = await expectJson<{ added: string[]; availableThemeIds: string[]; duplicateIds: unknown[] }>(
      await send(site, "POST", `${site.ws}/themes/rescan`),
      200
    );
    assert.deepEqual(rescan.added, ["unrun-regions"]);
    assert.ok(rescan.availableThemeIds.includes("unrun-regions"), "the copied theme loads as valid");
    await expectJson(await send(site, "PATCH", `${site.ws}/presentation`, { activeThemeId: "unrun-regions" }), 200);

    // The seeded Page claiming "/" wins over a theme's home template. Trash it through the real
    // route so this fixture exercises the declared region, as widgets-site-serving.test.ts does.
    const pages = await expectJson<{ posts: Array<{ post: { id: string; slug: string } }> }>(await send(site, "GET", `${site.ws}/pages`), 200);
    const rootPage = pages.posts.find(({ post }) => post.slug === "/");
    assert.ok(rootPage, "fixture: initSite seeds the Page claiming the root slug");
    await expectJson(await send(site, "DELETE", `${site.ws}/pages/${rootPage.post.id}`), 200);

    const first = await createTextWidget(site, "Unrun First", "Unrun first widget");
    const second = await createTextWidget(site, "Unrun Second", "Unrun second widget");
    const area = await bindRegion(site);
    const regionOpen = `<div class="widget-region widget-region--${REGION}">`;
    assert.ok(!(await visit(site, "/")).includes(regionOpen), "an empty region renders nothing, not even its wrapper");

    const p1 = { placementId: randomUUID(), widgetEntryId: first.id, enabled: true };
    const p2 = { placementId: randomUUID(), widgetEntryId: second.id, enabled: true };
    const v1 = (await expectJson<{ area: AreaDto }>(await putPlacements(site, area.version, [p1, p2]), 200)).area;
    assert.ok(
      (await visit(site, "/")).includes(`${regionOpen}${textWidgetHtml("Unrun first widget")}${textWidgetHtml("Unrun second widget")}</div>`),
      "both widgets render in stored order inside the region wrapper"
    );

    const v2 = (await expectJson<{ area: AreaDto }>(await putPlacements(site, v1.version, [p2, p1]), 200)).area;
    assert.ok((await visit(site, "/")).includes(`${regionOpen}${textWidgetHtml("Unrun second widget")}${textWidgetHtml("Unrun first widget")}</div>`));

    await expectJson(await putPlacements(site, v2.version, [{ ...p2, enabled: false }, p1]), 200);
    const disabled = await visit(site, "/");
    assert.ok(disabled.includes(`${regionOpen}${textWidgetHtml("Unrun first widget")}</div>`), "a disabled placement is skipped");
    assert.ok(!disabled.includes("Unrun second widget"));

    const trashed = await expectJson<{ trashed: boolean; id: string }>(await send(site, "POST", `${site.ws}/widgets/${first.id}/trash`), 200);
    assert.deepEqual({ trashed: trashed.trashed, id: trashed.id }, { trashed: true, id: first.id });
    const afterTrash = await visit(site, "/");
    assert.ok(!afterTrash.includes("Unrun first widget"), "a trashed widget's content is never served");
    assert.ok(
      afterTrash.includes(`${regionOpen}<div class="widget widget-placeholder" aria-hidden="true"></div></div>`),
      "REQ-28: its placement degrades to the placeholder instead of breaking the page"
    );

    await expectJson(await send(site, "PATCH", `${site.ws}/presentation`, { activeThemeId: original }), 200);
    assert.ok(!(await visit(site, "/")).includes(regionOpen), "the original theme declares no region, so none renders after the revert");
  });

  test(`[unrun] widgets [${dialect}]: a widget embedded in an html Page's body by data-embed-config renders on the live page`, async (t) => {
    const site = await bootSite(t, dialect);
    const widget = await createTextWidget(site, "Unrun Inline", "Unrun inline widget");
    const { post } = await expectJson<{ post: { id: string } }>(
      await send(site, "POST", `${site.ws}/pages`, { title: "Unrun Embed Host", slug: "unrun-embed-host", status: "published" }),
      201
    );
    const html = `<p>Unrun lead paragraph</p><div data-embed-config='{"type":"widget","id":"${widget.id}"}'></div>`;
    await expectJson(await send(site, "PUT", `${site.ws}/pages/${post.id}/html`, { html }), 200);

    const live = await visit(site, "/unrun-embed-host");
    assert.ok(live.includes("Unrun lead paragraph"));
    assert.ok(live.includes(textWidgetHtml("Unrun inline widget")), "the bare marker div is replaced by the resolved widget");
    assert.ok(!live.includes(`"id":"${widget.id}"`), "no raw marker reaches a visitor");
  });
}
