import { kernelStampWatermark } from "@jini-ai/db/watermark/kernel";
import { WRITE_WATERMARK_TABLES } from "#src/platform/db/write-watermark-tables";
import { SqlMenuRepo } from "@jini-ai/cms/navigation/sql";
import { NAVIGATION_TABLES } from "#src/platform/db/content-tables";
import { schemaErasedKernel } from "#src/platform/db/content-kernel";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect, freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import { migrateFooterPageLinks } from "../migrate-footer-page-links.js";
import { resolveMenuDoc, type NavMenuDoc } from "@jini-ai/cms/navigation";
import { createMenuPageTargetResolver } from "../page-target-resolver.js";
import { toAdminMenuResponse } from "@jini-ai/cms/admin-http/http/menus";
import { SqlPostRepo } from "#src/features/post/repo";
import { postSearchFor } from "@jini-ai/cms/posts/sql";
import { renderHtmlMenu } from "#src/platform/html/menu-render";

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
