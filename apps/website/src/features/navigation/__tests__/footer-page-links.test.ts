import { kernelStampWatermark } from "#src/platform/db/watermark-kernel";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect, freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import { migrateFooterPageLinks } from "../migrate-footer-page-links.js";
import { resolveMenuDoc } from "../index.js";
import { createMenuPageTargetResolver } from "../page-target-resolver.js";
import { SqlMenuRepo } from "../repo.js";
import { toAdminMenuResponse } from "#src/server/inbound/admin-http/http/menus";
import { SqlPostRepo } from "#src/features/post/repo";
import { postSearchFor } from "#src/features/post/search-index";
import { renderHtmlMenu } from "../html-render.js";
import type { NavMenuDoc } from "../index.js";

test("footer repair counts no conversion or watermark when the database refuses the menu update", async (t) => {
  const kernel = freshSqliteContentKernel();
  t.after(() => kernel.close());
  await seedWorkspaces(kernel, ["ws"]);
  await kernel.run(db => db.insertInto("posts").values({
    id: "about-page", workspace_id: "ws", title: "About", slug: "about", kind: "page", status: "published",
    body_json: "{}", body_html: null, updated_at: "2026-10-04", version: 1, seo_ext_json: null, deleted_at: null,
    template_choice: null, overrides_theme_page: null, member_access_json: null, autosave_json: null,
    created_by_principal_id: null, created_at: null,
  }).execute());
  const doc: NavMenuDoc = { type: "menu", version: 1, items: [
    { id: "menu-item-1", label: "About", target: { kind: "url", href: "/about" } },
  ] };
  await kernel.run(db => db.insertInto("menus").values({
    id: "menu-footer-nav", workspace_id: "ws", slug: "footer-nav", title: "Footer", status: "published",
    doc_json: JSON.stringify(doc), locations_json: "[]", updated_at: "2026-10-04", version: 1,
  }).execute());
  await kernel.run(db => db.insertInto("database_write_watermark").values({ id: 1, value: 7, last_stamped_at: null })
    .onConflict(oc => oc.column("id").doUpdateSet({ value: 7, last_stamped_at: null })).execute());
  // Database fault injection: RAISE(IGNORE) makes the real conditional UPDATE affect zero rows.
  // The repair must account for persisted conversions, never the number it merely planned.
  await kernel.run(db => sql`CREATE TRIGGER refuse_footer_repair BEFORE UPDATE ON menus
    WHEN OLD.id = 'menu-footer-nav' BEGIN SELECT RAISE(IGNORE); END`.execute(db));
  assert.deepEqual(await migrateFooterPageLinks({ stampWatermark: kernelStampWatermark(kernel), kernel }, { now: () => "2026-10-17T12:00:00.000Z" }), { converted: 0 });
  const row = await new SqlMenuRepo(kernel).findById({ workspaceId: "ws", id: "menu-footer-nav" });
  assert.deepEqual(row?.doc, doc);
  assert.equal(row?.version, 1);
  assert.equal((await kernel.run(db => db.selectFrom("database_write_watermark").select("value").where("id", "=", 1).executeTakeFirstOrThrow())).value, 7);
  const marker = await kernel.run(db => db.selectFrom("setting_values_global").select("setting_id")
    .where("setting_id", "=", "tovu.internal.boot_repair.footer_page_links").executeTakeFirst());
  assert.ok(marker);
});

for (const dialect of eachDialect({ tables: ["menus", "posts", "workspaces", "database_write_watermark", "setting_values_global"], make: (kernel) => kernel })) {
  test(`[${dialect.name}] footer repair fills missing snapshots and preserves authored targets and complete refs`, async (t) => {
    const kernel = dialect.make();
    if (dialect.name === "sqlite") t.after(() => kernel.close());
    await seedWorkspaces(kernel, ["ws"]);
    await kernel.run(db => db.insertInto("posts").values(([
      ["about-page", "about"], ["contact-page", "contact"], ["faq-page", "faq"],
    ] as const).map(([id, slug]) => ({
      id, workspace_id: "ws", title: slug, slug, kind: "page", status: "draft",
      body_json: "{}", body_html: null, updated_at: "2026-10-04", version: 1, seo_ext_json: null, deleted_at: null,
      template_choice: null, overrides_theme_page: null, member_access_json: null, autosave_json: null,
      created_by_principal_id: null, created_at: null,
    }))).execute());
    const doc: NavMenuDoc = { type: "menu", version: 1, items: [
      { id: "menu-item-1", label: "About", target: { kind: "entryRef", entryId: "about-page", entryType: "page", lastKnownHref: "/original-about" }, children: [] },
      { id: "menu-item-2", label: "Contact", target: { kind: "entryRef", entryId: "contact-page", entryType: "page" } },
      { id: "menu-item-4", label: "FAQ", target: { kind: "entryRef", entryId: "faq-page", entryType: "post", lastKnownHref: "/original-faq" } },
      { id: "menu-item-5", label: "Terms of Service", target: { kind: "entryRef", entryId: "missing" } },
      { id: "menu-item-6", label: "Privacy Policy", target: { kind: "url", href: "/privacy-policy" } },
      { id: "menu-item-docs", label: "My Docs", target: { kind: "url", href: "/docs" } },
      { id: "menu-item-articles", label: "Articles", target: { kind: "url", href: "/my-articles" } },
      { id: "menu-item-about", label: "About", target: { kind: "route", route: "home" } },
      { id: "operator-ref", label: "FAQ", target: { kind: "entryRef", entryId: "faq-page", lastKnownHref: "/author-path" } },
    ] };
    const unchanged: NavMenuDoc = { type: "menu", version: 1, items: [doc.items[0]!] };
    await kernel.run(db => db.insertInto("menus").values([
      { id: "menu-footer-nav", slug: "footer-nav", doc_json: JSON.stringify(doc) },
      { id: "d080e7cc-4f22-45bf-9a5a-8de81f2f9249", slug: "footer-resources", doc_json: JSON.stringify(unchanged) },
    ].map(row => ({ ...row, workspace_id: "ws", title: row.slug, status: "published", locations_json: "[]", updated_at: "2026-10-04", version: 1 }))).execute());
    const now = "2026-10-17T12:00:00.000Z";
    assert.deepEqual(await migrateFooterPageLinks({ stampWatermark: kernelStampWatermark(kernel), kernel }, { now: () => now }), { converted: 2 });
    const repo = new SqlMenuRepo(kernel);
    assert.deepEqual((await repo.findById({ workspaceId: "ws", id: "menu-footer-nav" }))?.doc, {
      ...doc, items: doc.items.map(item => item.id === "menu-item-2"
        ? { ...item, target: { kind: "entryRef", entryId: "contact-page", entryType: "page", lastKnownHref: "/contact" } }
        : item.id === "menu-item-4" ? { ...item, target: { kind: "entryRef", entryId: "faq-page", entryType: "page", lastKnownHref: "/original-faq" } } : item),
    });
    const untouched = await repo.findById({ workspaceId: "ws", id: "d080e7cc-4f22-45bf-9a5a-8de81f2f9249" });
    assert.deepEqual(untouched?.doc, unchanged);
    assert.equal(untouched?.version, 1);
    const repaired = await repo.findById({ workspaceId: "ws", id: "menu-footer-nav" });
    assert.equal(repaired?.updatedAt, now);
    assert.equal(repaired?.version, 2);
  });

  test(`[${dialect.name}] footer page conversion is scoped/idempotent, and public refs follow rename/unpublish/trash`, async () => {
    const kernel = dialect.make();
    await seedWorkspaces(kernel, ["ws", "other"]);
    await kernel.run((db) => db.insertInto("database_write_watermark").values({ id: 1, value: 0, last_stamped_at: null })
      .onConflict((conflict) => conflict.column("id").doUpdateSet({ value: 0, last_stamped_at: null })).execute());
    await kernel.run((db) => db.insertInto("posts").values([
      { id: "about-page", workspace_id: "ws", title: "About", slug: "about", kind: "page", status: "published", body_json: "{}", body_html: null, updated_at: "2026-10-04", version: 1, seo_ext_json: null, deleted_at: null, template_choice: null, overrides_theme_page: null, member_access_json: null, autosave_json: null, created_by_principal_id: null, created_at: null },
      { id: "other-contact", workspace_id: "other", title: "Contact", slug: "contact", kind: "page", status: "published", body_json: "{}", body_html: null, updated_at: "2026-10-04", version: 1, seo_ext_json: null, deleted_at: null, template_choice: null, overrides_theme_page: null, member_access_json: null, autosave_json: null, created_by_principal_id: null, created_at: null },
    ]).execute());
    const doc: NavMenuDoc = { type: "menu", version: 1, items: [
      { id: "menu-item-1", label: "About", attrs: { cssClass: "footer-link" }, target: { kind: "url", href: "/about" } },
      { id: "external", target: { kind: "url", href: "https://example.com/about" } },
      { id: "operator-about", label: "Custom About", target: { kind: "url", href: "/about" } },
      { id: "missing", target: { kind: "url", href: "/contact" } },
    ] };
    await kernel.run((db) => db.insertInto("menus").values(["footer-nav", "footer-resources", "header-nav"].map((slug) => ({
      id: slug === "footer-nav" ? "menu-footer-nav" : slug === "footer-resources" ? "d080e7cc-4f22-45bf-9a5a-8de81f2f9249" : slug, workspace_id: "ws", slug, title: slug, status: "published", doc_json: JSON.stringify(slug === "footer-resources"
        ? { ...doc, items: [{ id: "parent", target: { kind: "url", href: "/" }, children: [{ id: "menu-item-about", label: "About", target: { kind: "entryRef", entryId: "about-page" } }] }] }
        : doc), locations_json: "[]", updated_at: "2026-10-04", version: 1,
    }))).execute());
    await kernel.run(db => db.insertInto("menus").values({
      id: "operator-footer", workspace_id: "other", slug: "footer-nav", title: "My footer", status: "published",
      doc_json: JSON.stringify({ ...doc, items: [{ id: "mine", label: "Contact", target: { kind: "url", href: "/contact" } }] }),
      locations_json: "[]", updated_at: "2026-10-04", version: 1,
    }).execute());
    assert.equal((await migrateFooterPageLinks({ stampWatermark: kernelStampWatermark(kernel), kernel })).converted, 2);
    const authored = await kernel.run(db => db.selectFrom("menus").selectAll().where("id", "=", "operator-footer").executeTakeFirstOrThrow());
    assert.equal(authored.version, 1);
    assert.deepEqual(JSON.parse(authored.doc_json).items[0].target, { kind: "url", href: "/contact" });
    const rows = await kernel.run((db) => db.selectFrom("menus").selectAll().execute());
    const footer = rows.find((row) => row.slug === "footer-nav" && row.workspace_id === "ws")!;
    const converted = JSON.parse(footer.doc_json) as NavMenuDoc;
    const pageTarget = { kind: "entryRef", entryId: "about-page", entryType: "page", lastKnownHref: "/about" };
    assert.deepEqual(converted.items[0], { ...doc.items[0], target: pageTarget });
    assert.deepEqual(JSON.parse(rows.find((row) => row.slug === "footer-resources")!.doc_json).items[0].children[0].target, pageTarget);
    const menuRepo = new SqlMenuRepo(kernel);
    const readMenu = await menuRepo.findById({ workspaceId: "ws", id: "menu-footer-nav" });
    assert.ok(readMenu);
    await menuRepo.save(readMenu);
    assert.deepEqual(toAdminMenuResponse((await menuRepo.findById({ workspaceId: "ws", id: "menu-footer-nav" }))!).menu.items[0].target, pageTarget);
    assert.deepEqual(converted.items.slice(1), doc.items.slice(1));
    assert.deepEqual(JSON.parse(rows.find((row) => row.slug === "header-nav")!.doc_json), doc);
    assert.equal(footer.version, 2);
    // An operator restores a raw link after the first repair; future boots must preserve it.
    await kernel.run(db => db.updateTable("menus").set({ doc_json: JSON.stringify(doc), version: 3 })
      .where("id", "=", "menu-footer-nav").execute());
    assert.equal((await migrateFooterPageLinks({ stampWatermark: kernelStampWatermark(kernel), kernel })).converted, 0);
    assert.deepEqual(JSON.parse((await kernel.run(db => db.selectFrom("menus").select("doc_json").where("id", "=", "menu-footer-nav").executeTakeFirstOrThrow())).doc_json), doc);
    // Keep the converted fixture for the public-availability assertions below.
    await kernel.run(db => db.updateTable("menus").set({ doc_json: JSON.stringify(converted), version: 2 })
      .where("id", "=", "menu-footer-nav").execute());
    assert.equal((await kernel.run((db) => db.selectFrom("database_write_watermark").select("value").where("id", "=", 1).executeTakeFirstOrThrow())).value, 1);
    assert.equal((await kernel.run((db) => db.selectFrom("menus").select("version").where("id", "=", "menu-footer-nav").executeTakeFirstOrThrow())).version, 2);
    const postRepo = new SqlPostRepo(kernel, postSearchFor(kernel));
    const resolveTargetHref = createMenuPageTargetResolver({ postRepo });
    const pageOnly = { ...converted, items: [converted.items[0]] };
    const resolve = () => resolveMenuDoc({ doc: pageOnly, context: { workspaceId: "ws", currentPath: "/" }, resolveTargetHref });
    assert.equal((await resolve())[0].href, "/about");
    await kernel.run((db) => db.updateTable("posts").set({ slug: "our-story" }).where("id", "=", "about-page").execute());
    assert.equal((await resolve())[0].href, "/our-story");
    assert.equal((await migrateFooterPageLinks({ stampWatermark: kernelStampWatermark(kernel), kernel })).converted, 0, "a rename does not replace the stored URL snapshot on boot");
    assert.deepEqual((await menuRepo.findById({ workspaceId: "ws", id: "menu-footer-nav" }))?.doc.items[0].target, pageTarget);
    assert.match(renderHtmlMenu({ id: "footer", items: await resolve(), sanitizeHref: (href) => href }), /<a[^>]*href="\/our-story"/);
    await kernel.run((db) => db.updateTable("posts").set({ status: "draft" }).where("id", "=", "about-page").execute());
    assert.equal((await resolve())[0].available, false);
    assert.doesNotMatch(renderHtmlMenu({ id: "footer", items: await resolve(), sanitizeHref: (href) => href }), /About|href=/);
    await kernel.run((db) => db.updateTable("posts").set({ status: "published", deleted_at: "2026-10-04" }).where("id", "=", "about-page").execute());
    assert.equal((await resolve())[0].available, false);
    assert.doesNotMatch(renderHtmlMenu({ id: "footer", items: await resolve(), sanitizeHref: (href) => href }), /About|href=/);
    await kernel.run((db) => db.deleteFrom("posts").where("id", "=", "about-page").execute());
    assert.equal((await resolve())[0].href, "/about", "a routing miss uses the stored URL");
    if (dialect.name === "sqlite") await kernel.close();
  });
  test(`[${dialect.name}] footer repair preserves previously edited seeds and marks completion even with no conversions`, async () => {
    const kernel = dialect.make();
    try {
      await seedWorkspaces(kernel, ["ws"]);
      const doc: NavMenuDoc = { type: "menu", version: 1, items: [
        { id: "menu-item-1", label: "About", target: { kind: "url", href: "/about" } },
      ] };
      await kernel.run(db => db.insertInto("posts").values({
        id: "about-page", workspace_id: "ws", title: "About", slug: "about", kind: "page", status: "published",
        body_json: "{}", body_html: null, updated_at: "2026-10-04", version: 1, seo_ext_json: null, deleted_at: null,
        template_choice: null, overrides_theme_page: null, member_access_json: null, autosave_json: null,
        created_by_principal_id: null, created_at: null,
      }).execute());
      await kernel.run(db => db.insertInto("menus").values({
        id: "menu-footer-nav", workspace_id: "ws", slug: "footer-nav", title: "Footer", status: "published",
        doc_json: JSON.stringify(doc), locations_json: "[]", updated_at: "2026-10-04", version: 5,
      }).execute());
      assert.deepEqual(await migrateFooterPageLinks({ stampWatermark: kernelStampWatermark(kernel), kernel }), { converted: 0 });
      const edited = await kernel.run(db => db.selectFrom("menus").selectAll().where("id", "=", "menu-footer-nav").executeTakeFirstOrThrow());
      assert.equal(edited.version, 5);
      assert.deepEqual(JSON.parse(edited.doc_json), doc);
      // A later restore/import must not turn this completed boot repair into a recurring writer.
      await kernel.run(db => db.updateTable("menus").set({ version: 1 }).where("id", "=", "menu-footer-nav").execute());
      assert.deepEqual(await migrateFooterPageLinks({ stampWatermark: kernelStampWatermark(kernel), kernel }), { converted: 0 });
      const restored = await kernel.run(db => db.selectFrom("menus").selectAll().where("id", "=", "menu-footer-nav").executeTakeFirstOrThrow());
      assert.equal(restored.version, 1);
      assert.deepEqual(JSON.parse(restored.doc_json), doc);
    } finally { if (dialect.name === "sqlite") await kernel.close(); }
  });

}

/** One sqlite seed footer whose items walk every repair branch; the stored JSON is pinned byte for byte. */
async function repairOneSeedFooter(items: readonly unknown[]): Promise<{ converted: number; docJson: string; version: number }> {
  const kernel = freshSqliteContentKernel();
  try {
    await seedWorkspaces(kernel, ["ws"]);
    await kernel.run(db => db.insertInto("posts").values((["about", "faq"] as const).map((slug) => ({
      id: `${slug}-page`, workspace_id: "ws", title: slug, slug, kind: "page", status: "published",
      body_json: "{}", body_html: null, updated_at: "2026-10-04", version: 1, seo_ext_json: null, deleted_at: null,
      template_choice: null, overrides_theme_page: null, member_access_json: null, autosave_json: null,
      created_by_principal_id: null, created_at: null,
    }))).execute());
    await kernel.run(db => db.insertInto("menus").values({
      id: "menu-footer-nav", workspace_id: "ws", slug: "footer-nav", title: "Footer", status: "published",
      doc_json: JSON.stringify({ type: "menu", version: 1, items }), locations_json: "[]", updated_at: "2026-10-04", version: 1,
    }).execute());
    const { converted } = await migrateFooterPageLinks({ stampWatermark: kernelStampWatermark(kernel), kernel }, { now: () => "2026-10-17T12:00:00.000Z" });
    const row = await kernel.run(db => db.selectFrom("menus").select(["doc_json", "version"]).where("id", "=", "menu-footer-nav").executeTakeFirstOrThrow());
    return { converted, docJson: row.doc_json, version: row.version };
  } finally { await kernel.close(); }
}

const UNTOUCHED_ITEMS = [
  { id: "menu-item-1", label: "About", target: { kind: "url", href: "/faq" } },
  { id: "menu-item-2", label: "Contact", target: { kind: "url", href: "/contact" } },
  { id: "menu-item-4", label: "Not FAQ", target: { kind: "url", href: "/faq" } },
  { id: "authored", label: "About", target: { kind: "url", href: "/about" } },
  { id: "menu-item-about", label: "About", target: { kind: "entryRef", entryId: "about-page", entryType: "page", lastKnownHref: "/kept" } },
  { id: "menu-item-docs", label: "Docs", target: { kind: "entryRef", entryId: "not-a-page" } },
  { id: "menu-item-articles", label: "Articles", target: { kind: "route", route: "home" } },
  { id: "menu-item-5", target: { kind: "url", href: "/terms-of-service" } },
];

test("footer repair leaves every author-owned or unmatched item byte-identical and writes nothing", async () => {
  const result = await repairOneSeedFooter(UNTOUCHED_ITEMS);
  assert.deepEqual(result, { converted: 0, docJson: JSON.stringify({ type: "menu", version: 1, items: UNTOUCHED_ITEMS }), version: 1 });
});

test("footer repair converts each repairable seed shape, recursing into children, in stored key order", async () => {
  const result = await repairOneSeedFooter([
    { id: "menu-item-1", label: "About", attrs: { cssClass: "x" }, target: { kind: "url", href: "/about" }, children: [] },
    { id: "menu-item-4", label: "FAQ", target: { kind: "entryRef", entryId: "faq-page", entryType: "page", extra: "dropped" } },
    { id: "menu-item-about", label: "About", target: { kind: "entryRef", entryId: "about-page", entryType: "post", lastKnownHref: "/snapshot" } },
    { target: { kind: "url", href: "/" }, id: "parent", children: [
      { id: "menu-item-about", label: "About", target: { kind: "entryRef", entryId: "about-page", entryType: "page", lastKnownHref: "" } },
    ] },
  ]);
  assert.equal(result.converted, 4);
  assert.equal(result.version, 2);
  assert.equal(result.docJson, JSON.stringify({ type: "menu", version: 1, items: [
    { id: "menu-item-1", label: "About", attrs: { cssClass: "x" }, target: { kind: "entryRef", entryId: "about-page", entryType: "page", lastKnownHref: "/about" }, children: [] },
    { id: "menu-item-4", label: "FAQ", target: { kind: "entryRef", entryId: "faq-page", entryType: "page", lastKnownHref: "/faq" } },
    { id: "menu-item-about", label: "About", target: { kind: "entryRef", entryId: "about-page", entryType: "page", lastKnownHref: "/snapshot" } },
    { target: { kind: "url", href: "/" }, id: "parent", children: [
      { id: "menu-item-about", label: "About", target: { kind: "entryRef", entryId: "about-page", entryType: "page", lastKnownHref: "/about" } },
    ] },
  ] }));
});

test("an unlabelled item whose id is an Object.prototype key remains author-owned", async () => {
  const result = await repairOneSeedFooter([{ id: "constructor", target: { kind: "entryRef", entryId: "about-page" } }]);
  assert.equal(result.converted, 0);
  assert.equal(result.docJson, JSON.stringify({ type: "menu", version: 1, items: [
    { id: "constructor", target: { kind: "entryRef", entryId: "about-page" } },
  ] }));
});
