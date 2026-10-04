import type { AdminMenuItem, AdminMenuTarget } from "@/lib/api";
export interface MenuPageChoice { id: string; title: string; status: "draft" | "published"; }
/** Release compatibility: installed DTO types predate the optional JSON content-type hint. */
export type PageMenuTarget = AdminMenuTarget & { entryType?: string };
export type MenuTargetEditorKind = AdminMenuTarget["kind"] | "page";

export function menuTargetEditorKind({ target }: { target: PageMenuTarget }, _optional = {}): MenuTargetEditorKind {
  return target.kind === "entryRef" && target.entryType === "page" ? "page" : target.kind;
}

export function hasPageLinks({ items }: { items: readonly AdminMenuItem[] }, _optional = {}): boolean {
  return items.some((item) => menuTargetEditorKind({ target: item.target }) === "page" || hasPageLinks({ items: item.children ?? [] }));
}

/** The scalar fallbacks are named for the same cyclomatic-complexity reason as MenuEditor's
 * orEmpty helper. Target reshaping belongs in rules, outside the editor's markup. */
function orEmpty(value: string | undefined): string { return value ?? ""; }

export function targetForKind(
  { kind, prev }: { kind: MenuTargetEditorKind; prev: AdminMenuTarget },
  _optional = {},
): PageMenuTarget {
  switch (kind) {
    case "page": return { kind: "entryRef", entryId: orEmpty(prev.entryId), entryType: "page" };
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
