import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { NavItemNode, NavMenuDoc } from "./index.js";
import { postPublicPath } from "#src/platform/routing/routing";

/** Only the seeded footer menus participate. Unmatched/external links stay author-controlled.
 * Menus already persist JSON-in-text/jsonb; this data repair needs no schema migration. */
function pageItems(items: readonly NavItemNode[], pages: ReadonlyMap<string, string>, paths: ReadonlyMap<string, string>): { items: NavItemNode[]; converted: number } {
  let converted = 0;
  const updated = items.map((item) => {
    const current = item.target as NavItemNode["target"] & { entryType?: string; lastKnownHref?: string };
    const pageId = current.kind === "url" ? pages.get(current.href)
      : current.kind === "entryRef" && paths.has(current.entryId) ? current.entryId : undefined;
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

/** Boot-time stored JSON repair, safe to repeat and workspace scoped. Version CAS refuses a
 * concurrent editor write; the next boot retries that row. Draft/trashed pages are deliberately
 * matched too, so their links become refs that the public availability filter can hide. */
export async function migrateFooterPageLinks(
  { kernel }: { kernel: ContentKernel },
  { now = () => new Date().toISOString() }: { now?: () => string } = {},
): Promise<{ converted: number }> {
  return kernel.transaction(async () => {
    await kernel.lockKey("footer_page_links_2026_10_04");
    const menus = await kernel.run((db) => db.selectFrom("menus").selectAll()
      .where("slug", "in", ["footer-nav", "footer-resources"]).where("status", "!=", "trash").execute());
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
      await kernel.run((db) => db.updateTable("database_write_watermark")
        .set((eb) => ({ value: eb("value", "+", 1), last_stamped_at: now() })).where("id", "=", 1).execute());
    }
    return { converted };
  });
}
