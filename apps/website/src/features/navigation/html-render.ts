import { escapeHtml } from "#src/platform/html/escape";

/** JINI CANDIDATE: framework-free rendering; the host supplies its URL policy as a port. */
export interface HtmlMenuItem {
  readonly label: string;
  readonly href: string | null;
  readonly available: boolean;
  readonly isCurrent: boolean;
  readonly isActive?: boolean | undefined;
  readonly attrs?: {
    readonly description?: string | undefined;
    readonly icon?: string | undefined;
    readonly rel?: string | undefined;
    readonly openInNewTab?: boolean | undefined;
  } | undefined;
  readonly children: readonly HtmlMenuItem[];
}

function renderList(items: readonly HtmlMenuItem[], depth: number, sanitizeHref: (href: string) => string): string {
  const children = items.map((item) => {
    const nested = renderList(item.children, depth + 1, sanitizeHref);
    const linkable = item.available && item.href !== null;
    // Keep unavailable headings only when they still contain available descendants.
    if (!linkable && nested === "") return "";
    const icon = item.attrs?.icon ? `<span data-tovu-menu-icon="${escapeHtml(item.attrs.icon)}"></span>` : "";
    const description = item.attrs?.description ? `<span data-tovu-menu-description>${escapeHtml(item.attrs.description)}</span>` : "";
    const label = `${icon}${escapeHtml(item.label)}${description}`;
    const current = item.isCurrent ? ' aria-current="page"' : "";
    const target = item.attrs?.openInNewTab ? ' target="_blank"' : "";
    const relTokens = new Set((item.attrs?.rel ?? "").split(/\s+/).filter(Boolean));
    if (item.attrs?.openInNewTab) { relTokens.add("noopener"); relTokens.add("noreferrer"); }
    const rel = relTokens.size ? ` rel="${escapeHtml([...relTokens].join(" "))}"` : "";
    const body = linkable
      ? `<a href="${escapeHtml(sanitizeHref(item.href!))}"${current}${target}${rel}>${label}</a>`
      : `<span data-tovu-menu-label>${label}</span>`;
    return `<li data-tovu-menu-item data-depth="${depth}" data-current="${item.isCurrent}" data-active="${item.isActive === true}" data-has-children="${nested !== ""}">${body}${nested}</li>`;
  }).join("");
  return children === "" ? "" : `<ul data-tovu-menu-list data-depth="${depth}">${children}</ul>`;
}

export function renderHtmlMenu(
  { id, items, sanitizeHref }: { id: string; items: readonly HtmlMenuItem[]; sanitizeHref: (href: string) => string },
  _optional = {},
): string {
  const list = renderList(items, 0, sanitizeHref);
  return list === "" ? "" : `<nav data-tovu-menu="${escapeHtml(id)}">${list}</nav>`;
}
