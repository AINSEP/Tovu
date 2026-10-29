import { createHash } from "node:crypto";
import { escapeHtml } from "#src/platform/html/escape";

/** JINI CANDIDATE: framework-free rendering; the host supplies its URL policy as a port. */
export interface HtmlMenuItem {
  readonly label: string;
  readonly href: string | null;
  readonly available: boolean;
  readonly isCurrent: boolean;
  readonly isActive?: boolean;
  readonly attrs?: {
    readonly description?: string;
    readonly icon?: string;
    readonly rel?: string;
    readonly openInNewTab?: boolean;
  };
  readonly children: readonly HtmlMenuItem[];
}

type MenuAttrs = NonNullable<HtmlMenuItem["attrs"]>;
type SanitizeHref = (href: string) => string;

/** A URL scheme (`https:`, `javascript:`) or an authority prefix (`//`, `\\`, `/\`). */
const SCHEME_OR_AUTHORITY = /^(?:[a-z][a-z0-9+.-]*:|[\\/]{2})/i;
/** Backslashes, C0 controls and space anywhere in the href. */
const UNSAFE_HREF_CHARACTER = /[\\\u0000- ]/;

function isSiteRelative(href: string): boolean {
  return href !== "" && !SCHEME_OR_AUTHORITY.test(href) && !UNSAFE_HREF_CHARACTER.test(href);
}

/**
 * Advertises site-relative links with bounded names retaining the full path's identity.
 * The browser rechecks origin against its actual base URL before executing a navigation tool.
 * External links remain ordinary links. Pure; returns escaped HTML attributes. O(toolName length).
 */
function renderToolAttrs({ href, toolName, label }: { href: string; toolName: string; label: string }, _options = {}): string {
  const name = toolName.length <= 128 ? toolName : `${toolName.slice(0, 63)}_${createHash("sha256").update(toolName).digest("hex")}`;
  return isSiteRelative(href)
    ? ` data-toolname="${escapeHtml(name)}" data-tooldescription="${escapeHtml(label)}"` : "";
}

function renderLabel({ label, attrs }: { label: string; attrs: MenuAttrs }): string {
  const icon = attrs.icon ? `<span data-tovu-menu-icon="${escapeHtml(attrs.icon)}"></span>` : "";
  const description = attrs.description ? `<span data-tovu-menu-description>${escapeHtml(attrs.description)}</span>` : "";
  return `${icon}${escapeHtml(label)}${description}`;
}

function renderRel({ attrs }: { attrs: MenuAttrs }): string {
  const relTokens = new Set((attrs.rel ?? "").split(/\s+/).filter(Boolean));
  if (attrs.openInNewTab) { relTokens.add("noopener"); relTokens.add("noreferrer"); }
  return relTokens.size ? ` rel="${escapeHtml([...relTokens].join(" "))}"` : "";
}

function renderAnchor({ item, attrs, href, toolName, label }: {
  item: HtmlMenuItem; attrs: MenuAttrs; href: string; toolName: string; label: string;
}): string {
  const current = item.isCurrent ? ' aria-current="page"' : "";
  const target = attrs.openInNewTab ? ' target="_blank"' : "";
  const tool = renderToolAttrs({ href, toolName, label: item.label });
  return `<a href="${escapeHtml(href)}"${current}${target}${renderRel({ attrs })}${tool}>${label}</a>`;
}

function renderItem({ item, index, depth, sanitizeHref, toolPrefix }: {
  item: HtmlMenuItem; index: number; depth: number; sanitizeHref: SanitizeHref; toolPrefix: string;
}): string {
  const toolName = `${toolPrefix}_${index}`;
  const nested = renderList({ items: item.children, depth: depth + 1, sanitizeHref, toolPrefix: toolName });
  const authoredHref = item.available ? item.href : null;
  // Keep unavailable headings only when they still contain available descendants.
  if (authoredHref === null && nested === "") return "";
  const attrs = item.attrs ?? {};
  const label = renderLabel({ label: item.label, attrs });
  const body = authoredHref === null
    ? `<span data-tovu-menu-label>${label}</span>`
    : renderAnchor({ item, attrs, href: sanitizeHref(authoredHref), toolName, label });
  return `<li data-tovu-menu-item data-depth="${depth}" data-current="${item.isCurrent}" data-active="${item.isActive === true}" data-has-children="${nested !== ""}">${body}${nested}</li>`;
}

function renderList({ items, depth, sanitizeHref, toolPrefix }: {
  items: readonly HtmlMenuItem[]; depth: number; sanitizeHref: SanitizeHref; toolPrefix: string;
}): string {
  const children = items.map((item, index) => renderItem({ item, index, depth, sanitizeHref, toolPrefix })).join("");
  return children === "" ? "" : `<ul data-tovu-menu-list data-depth="${depth}">${children}</ul>`;
}

export function renderHtmlMenu(
  { id, items, sanitizeHref }: { id: string; items: readonly HtmlMenuItem[]; sanitizeHref: SanitizeHref },
): string {
  const list = renderList({ items, depth: 0, sanitizeHref, toolPrefix: `menu_${id.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64)}` });
  return list === "" ? "" : `<nav data-tovu-menu="${escapeHtml(id)}">${list}</nav>`;
}
