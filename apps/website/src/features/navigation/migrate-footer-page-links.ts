import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { NavItemNode, NavMenuDoc } from "./index.js";
import { kernelStampWatermark } from "#src/platform/db/watermark-kernel";
import { postPublicPath } from "#src/platform/routing/routing";

const REPAIR_SETTING_ID = "tovu.internal.boot_repair.footer_page_links";

// These are the seed's stable item identities, labels and URLs, not every matching page URL.
// A newly authored menu with the same slug is not a seed, and an edited seed is author-owned.
const SEED_LINKS: Readonly<Record<string, readonly [string, string]>> = {
  "menu-item-1": ["About", "/about"], "menu-item-2": ["Contact", "/contact"],
  "menu-item-4": ["FAQ", "/faq"], "menu-item-5": ["Terms of Service", "/terms-of-service"],
  "menu-item-6": ["Privacy Policy", "/privacy-policy"],
  "menu-item-docs": ["Docs", "/docs"], "menu-item-articles": ["Articles", "/articles"], "menu-item-about": ["About", "/about"],
};
const SEED_MENU_IDS = ["menu-footer-nav", "d080e7cc-4f22-45bf-9a5a-8de81f2f9249"];

/** Only the untouched seeded footer menus participate. Unmatched/external links stay author-controlled.
 * Menus already persist JSON-in-text/jsonb; this data repair needs no schema migration. */
function pageItems(items: readonly NavItemNode[], pages: ReadonlyMap<string, string>, paths: ReadonlyMap<string, string>): { items: NavItemNode[]; converted: number } {
  let converted = 0;
  const updated = items.map((item) => {
    const current = item.target as NavItemNode["target"] & { entryType?: string; lastKnownHref?: string };
    const seeded = SEED_LINKS[item.id];
    const seedItem = seeded !== undefined && seeded[0] === item.label;
    const seedUrl = seedItem && current.kind === "url" && seeded[1] === current.href;
    const pageId = current.kind === "url" ? (seedUrl ? pages.get(current.href) : undefined)
      : seedItem && current.kind === "entryRef" && paths.has(current.entryId) ? current.entryId : undefined;
    // Earlier boots converted URLs without a URL snapshot; repair those refs too. Keep an
    // existing snapshot across renames, since it records the last URL known to its author.
    const repair = Boolean(pageId && (current.kind === "url" || current.entryType !== "page" || !current.lastKnownHref));
    const lastKnownHref = current.kind === "url" ? current.href : current.lastKnownHref || (pageId ? paths.get(pageId) : undefined);
    const children = item.children ? pageItems(item.children, pages, paths) : undefined;
    converted += (repair ? 1 : 0) + (children?.converted ?? 0);
    return { ...item, ...(repair ? { target: { kind: "entryRef" as const, entryId: pageId!, entryType: "page", lastKnownHref } } : {}),
      ...(children ? { children: children.items } : {}) };
  });
  return { items: updated, converted };
}

/** Once-per-site stored JSON repair, workspace scoped. Version CAS refuses a
 * concurrent editor write; edited menus remain author-controlled. Draft/trashed pages are deliberately
 * matched too, so their links become refs that the public availability filter can hide. */
export async function migrateFooterPageLinks(
  { kernel }: { kernel: ContentKernel },
  { now = () => new Date().toISOString() }: { now?: () => string } = {},
): Promise<{ converted: number }> {
  return kernel.transaction(async () => {
    await kernel.lockKey("footer_page_links_2026_10_04");
    const marker = await kernel.run((db) => db.selectFrom("setting_values_global").select("setting_id")
      .where("setting_id", "=", REPAIR_SETTING_ID).executeTakeFirst());
    if (marker) return { converted: 0 };
    const menus = await kernel.run((db) => db.selectFrom("menus").selectAll()
      .where("slug", "in", ["footer-nav", "footer-resources"]).where("id", "in", SEED_MENU_IDS)
      .where("version", "=", 1).where("status", "!=", "trash").execute());
    let converted = 0;
    for (const menu of menus) {
      const pages = await kernel.run((db) => db.selectFrom("posts").select(["id", "slug"])
        .where("workspace_id", "=", menu.workspace_id).where("kind", "=", "page").execute());
      const byPath = new Map(pages.map((page) => [postPublicPath(page.slug), page.id]));
      const byId = new Map(pages.map((page) => [page.id, postPublicPath(page.slug)]));
      const doc = JSON.parse(menu.doc_json) as NavMenuDoc;
      const result = pageItems(doc.items, byPath, byId);
      if (!result.converted) continue;
      const written = await kernel.run((db) => db.updateTable("menus")
        .set({ doc_json: JSON.stringify({ ...doc, items: result.items }), version: menu.version + 1, updated_at: now() })
        .where("id", "=", menu.id).where("workspace_id", "=", menu.workspace_id)
        .where("version", "=", menu.version).where("status", "!=", "trash").executeTakeFirst());
      if (Number(written.numUpdatedRows) > 0) converted += result.converted;
    }
    if (converted > 0) {
      await kernelStampWatermark(kernel)();
    }
    // Reserved settings row, like the unreadable-owner repair: no schema or public definition.
    await kernel.run((db) => db.insertInto("setting_values_global").values({
      setting_id: REPAIR_SETTING_ID, value_json: JSON.stringify({ completedAt: now() }), state: "set",
      def_version: 0, seq: 0, updated_by: "system:boot-repair", updated_at: now(), origin_plugin_id: null,
    }).execute());
    return { converted };
  });
}
