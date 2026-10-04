import assert from "node:assert/strict";
import test from "node:test";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
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

for (const dialect of eachDialect({ tables: ["menus", "posts", "workspaces", "database_write_watermark"], make: (kernel) => kernel })) {
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
      { id: "about", label: "About", attrs: { cssClass: "footer-link" }, target: { kind: "url", href: "/about" } },
      { id: "external", target: { kind: "url", href: "https://example.com/about" } },
      { id: "missing", target: { kind: "url", href: "/contact" } },
    ] };
    await kernel.run((db) => db.insertInto("menus").values(["footer-nav", "footer-resources", "header-nav"].map((slug) => ({
      id: slug, workspace_id: "ws", slug, title: slug, status: "published", doc_json: JSON.stringify(slug === "footer-resources"
        ? { ...doc, items: [{ id: "parent", target: { kind: "url", href: "/" }, children: [{ id: "legacy", target: { kind: "entryRef", entryId: "about-page" } }] }] }
        : doc), locations_json: "[]", updated_at: "2026-10-04", version: 1,
    }))).execute());
    assert.equal((await migrateFooterPageLinks({ kernel })).converted, 2);
    const rows = await kernel.run((db) => db.selectFrom("menus").selectAll().execute());
    const footer = rows.find((row) => row.slug === "footer-nav")!;
    const converted = JSON.parse(footer.doc_json) as NavMenuDoc;
    const pageTarget = { kind: "entryRef", entryId: "about-page", entryType: "page", lastKnownHref: "/about" };
    assert.deepEqual(converted.items[0], { ...doc.items[0], target: pageTarget });
    assert.deepEqual(JSON.parse(rows.find((row) => row.slug === "footer-resources")!.doc_json).items[0].children[0].target, pageTarget);
    const menuRepo = new SqlMenuRepo(kernel);
    const readMenu = await menuRepo.findById({ workspaceId: "ws", id: "footer-nav" });
    assert.ok(readMenu);
    await menuRepo.save(readMenu);
    assert.deepEqual(toAdminMenuResponse((await menuRepo.findById({ workspaceId: "ws", id: "footer-nav" }))!).menu.items[0].target, pageTarget);
    assert.deepEqual(converted.items.slice(1), doc.items.slice(1));
    assert.deepEqual(JSON.parse(rows.find((row) => row.slug === "header-nav")!.doc_json), doc);
    assert.equal(footer.version, 2);
    assert.equal((await migrateFooterPageLinks({ kernel })).converted, 0);
    assert.equal((await kernel.run((db) => db.selectFrom("database_write_watermark").select("value").where("id", "=", 1).executeTakeFirstOrThrow())).value, 1);
    assert.equal((await kernel.run((db) => db.selectFrom("menus").select("version").where("id", "=", "footer-nav").executeTakeFirstOrThrow())).version, 2);
    const postRepo = new SqlPostRepo(kernel, postSearchFor(kernel));
    const resolveTargetHref = createMenuPageTargetResolver({ postRepo });
    const pageOnly = { ...converted, items: [converted.items[0]] };
    const resolve = () => resolveMenuDoc({ doc: pageOnly, context: { workspaceId: "ws", currentPath: "/" }, resolveTargetHref });
    assert.equal((await resolve())[0].href, "/about");
    await kernel.run((db) => db.updateTable("posts").set({ slug: "our-story" }).where("id", "=", "about-page").execute());
    assert.equal((await resolve())[0].href, "/our-story");
    assert.equal((await migrateFooterPageLinks({ kernel })).converted, 0, "a rename does not replace the stored URL snapshot on boot");
    assert.deepEqual((await menuRepo.findById({ workspaceId: "ws", id: "footer-nav" }))?.doc.items[0].target, pageTarget);
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
}
