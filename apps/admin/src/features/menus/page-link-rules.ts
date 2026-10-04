import type { AdminMenuItem, AdminMenuTarget } from "@/lib/api";
export interface MenuPageChoice { id: string; title: string; status: "draft" | "published"; publicPath?: string; }
/** Release compatibility: installed DTO types predate the optional JSON content-type hint. */
export type PageMenuTarget = AdminMenuTarget & { entryType?: string; lastKnownHref?: string };
export type MenuTargetEditorKind = AdminMenuTarget["kind"] | "page";

export function menuTargetEditorKind({ target, pages }: { target: PageMenuTarget; pages?: readonly MenuPageChoice[] }, _optional = {}): MenuTargetEditorKind {
  return target.kind === "entryRef" && (target.entryType === "page" ||
    (target.entryType === undefined && pages?.some((page) => page.id === target.entryId))) ? "page" : target.kind;
}

export function hasPageLinks({ items }: { items: readonly AdminMenuItem[] }, _optional = {}): boolean {
  // Legacy refs need the catalogue before their editor kind is known; waiting for the hint
  // first prevented the Page picker from ever recovering a migrated unhinted reference.
  return items.some((item) => {
    const target: PageMenuTarget = item.target;
    return (target.kind === "entryRef" && (target.entryType === undefined || target.entryType === "page")) ||
      hasPageLinks({ items: item.children ?? [] });
  });
}

export function pageTargetForChoice(
  { entryId, pages, previous }: { entryId: string; pages?: readonly MenuPageChoice[]; previous?: PageMenuTarget },
  _optional = {},
): PageMenuTarget {
  const lastKnownHref = pages?.find((page) => page.id === entryId)?.publicPath ??
    (previous?.entryId === entryId ? previous.lastKnownHref : undefined);
  return { kind: "entryRef", entryId, entryType: "page", ...(lastKnownHref ? { lastKnownHref } : {}) };
}

/** Refresh the URL snapshot on every save, including unchanged/nested legacy page refs.
 * A failed catalogue read retains existing metadata; it never guesses a path from a label/id. */
export function pageItemsForSave(
  { items, pages }: { items: readonly AdminMenuItem[]; pages?: readonly MenuPageChoice[] },
  _optional = {},
): AdminMenuItem[] {
  return items.map((item) => ({ ...item,
    target: menuTargetEditorKind({ target: item.target, pages }) === "page"
      ? pageTargetForChoice({ entryId: item.target.entryId ?? "", pages, previous: item.target }) : item.target,
    ...(item.children ? { children: pageItemsForSave({ items: item.children, pages }) } : {}),
  }));
}

/** The scalar fallbacks are named for the same cyclomatic-complexity reason as MenuEditor's
 * orEmpty helper. Target reshaping belongs in rules, outside the editor's markup. */
function orEmpty(value: string | undefined): string { return value ?? ""; }

export function targetForKind(
  { kind, prev }: { kind: MenuTargetEditorKind; prev: PageMenuTarget },
  _optional = {},
): PageMenuTarget {
  switch (kind) {
    case "page": {
      const lastKnownHref = prev.lastKnownHref || prev.href;
      return { kind: "entryRef", entryId: orEmpty(prev.entryId), entryType: "page",
        ...(lastKnownHref ? { lastKnownHref } : {}) };
    }
    case "url": return { kind, href: orEmpty(prev.href) };
    case "route": return { kind, route: orEmpty(prev.route) };
    case "entryRef": return { kind, entryId: orEmpty(prev.entryId) };
    case "termRef": return { kind, termId: orEmpty(prev.termId), taxonomy: orEmpty(prev.taxonomy) };
  }
}

export function pageLinkState(
  { entryId, label, pages, t }: { entryId?: string; label?: string; pages?: readonly MenuPageChoice[]; t: (key: string) => string },
  _optional = {},
) {
  const selected = pages?.find((page) => page.id === entryId);
  const unavailable = Boolean(entryId && pages && (!selected || selected.status !== "published"));
  return {
    value: entryId ?? "",
    unavailable,
    choices: [
      { id: "", title: t("Choose a page…") },
      ...(entryId && !selected ? [{ id: entryId, title: label || t("Page not published") }] : []),
      ...(pages ?? []),
    ],
  };
}
