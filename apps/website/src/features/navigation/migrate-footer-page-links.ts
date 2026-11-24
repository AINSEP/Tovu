import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { NavItemNode, NavMenuDoc } from "./index.js";
import { postPublicPath } from "#src/platform/routing/index";

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

type StoredTarget = NavItemNode["target"] & { entryType?: string; lastKnownHref?: string };
/** Workspace pages by public path (`pages`) and public path by page id (`paths`). */
interface PageIndex { readonly pages: ReadonlyMap<string, string>; readonly paths: ReadonlyMap<string, string> }

/** The page an untouched seed item should point at; `undefined` when the item is author-owned or unmatched. */
function seedPageId({ item, target, index }: { item: NavItemNode; target: StoredTarget; index: PageIndex }, _options = {}): string | undefined {
  if (!Object.hasOwn(SEED_LINKS, item.id)) return undefined;
  const seeded = SEED_LINKS[item.id];
  if (seeded === undefined || seeded[0] !== item.label) return undefined;
  if (target.kind === "url") return seeded[1] === target.href ? index.pages.get(target.href) : undefined;
  return target.kind === "entryRef" && index.paths.has(target.entryId) ? target.entryId : undefined;
}

/** The page ref replacing `target`, or `undefined` when it needs no repair. */
function repairedTarget({ target, pageId, index }: { target: StoredTarget; pageId: string | undefined; index: PageIndex }) {
  if (!pageId) return undefined;
  if (target.kind === "url") return { kind: "entryRef" as const, entryId: pageId, entryType: "page", lastKnownHref: target.href };
  // Earlier boots converted URLs without a URL snapshot; repair those refs too. Keep an
  // existing snapshot across renames, since it records the last URL known to its author.
  if (target.entryType === "page" && target.lastKnownHref) return undefined;
  return { kind: "entryRef" as const, entryId: pageId, entryType: "page", lastKnownHref: target.lastKnownHref || index.paths.get(pageId) };
}

function repairItem({ item, index }: { item: NavItemNode; index: PageIndex }): { item: NavItemNode; converted: number } {
  const target = item.target as StoredTarget;
  const repaired = repairedTarget({ target, pageId: seedPageId({ item, target, index }), index });
  const children = item.children ? pageItems({ items: item.children, index }) : undefined;
  return {
    item: { ...item, ...(repaired ? { target: repaired } : {}), ...(children ? { children: children.items } : {}) },
    converted: (repaired ? 1 : 0) + (children?.converted ?? 0),
  };
}

/** Only the untouched seeded footer menus participate. Unmatched/external links stay author-controlled.
 * Menus already persist JSON-in-text/jsonb; this data repair needs no schema migration. */
function pageItems({ items, index }: { items: readonly NavItemNode[]; index: PageIndex }): { items: NavItemNode[]; converted: number } {
  const repaired = items.map((item) => repairItem({ item, index }));
  return { items: repaired.map((result) => result.item), converted: repaired.reduce((sum, result) => sum + result.converted, 0) };
}

/** Once-per-site stored JSON repair, workspace scoped. Version CAS refuses a
 * concurrent editor write; edited menus remain author-controlled. Draft/trashed pages are deliberately
 * matched too, so their links become refs that the public availability filter can hide. */
export async function migrateFooterPageLinks(
  { kernel, stampWatermark }: { kernel: ContentKernel; stampWatermark: () => Promise<void> },
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
      const byPath = new Map(pages.map((page) => [postPublicPath({ slug: page.slug }), page.id]));
      const byId = new Map(pages.map((page) => [page.id, postPublicPath({ slug: page.slug })]));
      const doc = JSON.parse(menu.doc_json) as NavMenuDoc;
      const result = pageItems({ items: doc.items, index: { pages: byPath, paths: byId } });
      if (!result.converted) continue;
      const written = await kernel.run((db) => db.updateTable("menus")
        .set({ doc_json: JSON.stringify({ ...doc, items: result.items }), version: menu.version + 1, updated_at: now() })
        .where("id", "=", menu.id).where("workspace_id", "=", menu.workspace_id)
        .where("version", "=", menu.version).where("status", "!=", "trash").executeTakeFirst());
      if (Number(written.numUpdatedRows) > 0) converted += result.converted;
    }
    if (converted > 0) {
      await stampWatermark();
    }
    // Reserved settings row, like the unreadable-owner repair: no schema or public definition.
    await kernel.run((db) => db.insertInto("setting_values_global").values({
      setting_id: REPAIR_SETTING_ID, value_json: JSON.stringify({ completedAt: now() }), state: "set",
      def_version: 0, seq: 0, updated_by: "system:boot-repair", updated_at: now(), origin_plugin_id: null,
    }).execute());
    return { converted };
  });
}
