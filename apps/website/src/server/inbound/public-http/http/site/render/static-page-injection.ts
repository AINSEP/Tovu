import type { SiteChatSelection } from "../site-chat-markup.js";
import { siteAssistantMarkup } from "./site-assistant-mount.js";

/**
 * Splices `page-head.ts`'s `serializeHeadElements()` output into an already-complete static-tier
 * document's `<head>` (SPEC-008 T045 gap fix). `renderStaticPage`'s output bypasses `pageShell`
 * entirely — a static theme's page is already a full `<!doctype html>` document, not a body
 * fragment — which meant `extraHead` (the SEO fold's title/canonical/meta/OG/JSON-LD) was silently
 * dropped for every static-tier home page even though the route layer always computed it. Mirrors
 * {@link pageShell}'s own "fold's `<title>` wins" rule: when `extraHead` carries a `<title>`, the
 * theme's own hardcoded one is removed so the page never ships two competing tags. `extraHead`'s
 * elements are inserted immediately before `</head>` (append, not replace) so the theme's own
 * meta/link/script tags survive untouched. A no-op when `extraHead` is empty/absent, or when `html`
 * has no `</head>` to splice into (defensive — every real static page has one; this is the same
 * "never throw, degrade to what's already there" contract `renderStaticPage` itself follows).
 *
 * Exported (2026-08-19 follow-up) so `routes/site/pages.ts` can reuse this SAME splice for the two
 * other static-tier `renderStaticPage` call sites that bypass `renderSite`/`pageShell` entirely and
 * therefore had the identical drop: the marketing `/:slug` theme-page branch (no backing post, so
 * there is no `renderSite` call in the mix at all) and `renderViaTemplate`'s template-picker render.
 * One splice implementation, not a second parallel one — see those call sites' own docs for which
 * static-tier renders were deliberately left OUT (the admin theme-preview iframe and the 404/
 * diagnostic pages) and why.
 *
 * `preserveThemeTitle` lets entry-less static routes keep an authored title when no explicit Site
 * title is set. The fold still supplies all other head elements, and its title is kept when the
 * theme has none. Entry-bearing callers retain the default fold-wins policy.
 * @example injectExtraHeadIntoStaticPage(html, extraHead, { preserveThemeTitle: true })
 */
export function injectExtraHeadIntoStaticPage(
  { html, extraHead }: { html: string; extraHead: string | undefined }, options: { preserveThemeTitle?: boolean } = {},
): string {
  if (!extraHead) return html;
  const withoutOwnTitle = extraHead.includes("<title>") ? removeThemeOwnTitleElement({ html }) : html;
  if (options.preserveThemeTitle && withoutOwnTitle !== html) {
    return insertBeforeUncommentedTag({ html, tag: /<\/head>/gi, markup: removeThemeOwnTitleElement({ html: extraHead }) });
  }
  return insertBeforeUncommentedTag({ html: withoutOwnTitle, tag: /<\/head>/gi, markup: extraHead });
}

/**
 * {@link injectExtraHeadIntoStaticPage}'s sibling for the ADR-054 visitor-chat markup. Every
 * `renderStaticPage` call site bypasses `pageShell()` (see this file's own module doc), so
 * `pageShell`'s `siteAssistantMarkup()` splice never runs for a static-tier page unless each bypass
 * site calls this too — this was the actual gap: `site.assistant.public_enabled` could read `true`
 * and the pageShell-routed tiers would show the widget while every static-tier page (the home route
 * when the active theme is `"static"`, a theme's own marketing pages, and a template-picker render)
 * stayed silently unchanged, because none of them ever called {@link siteAssistantMarkup} at all.
 *
 * Same two insertion points `pageShell` itself uses — the stylesheet link immediately before
 * `</head>`, the mount node + deferred script immediately before `</body>` — just spliced into an
 * already-complete document instead of built into one. A no-op (returns `html` unchanged) when
 * `enabled` is `false`, matching {@link siteAssistantMarkup}'s own "disabled emits nothing, not an
 * inert tag" contract.
 */
export function injectSiteAssistantIntoStaticPage({ html, enabled }: { html: string; enabled: SiteChatSelection }, _optional = {}): string {
  const { head, body } = siteAssistantMarkup({ enabled });
  if (!head && !body) return html;
  const withHead = insertBeforeUncommentedTag({ html, tag: /<\/head>/gi, markup: head });
  return insertBeforeUncommentedTag({ html: withHead, tag: /<\/body>/gi, markup: body });
}

/**
 * Insert `markup` immediately before the first `tag` match that is real markup rather than a mention
 * inside an HTML comment; returns `html` unchanged when there is none. `tag` must be global so its
 * `lastIndex` walks the candidates.
 *
 * A plain `html.replace(/<\/body>/i, ...)` was a live bug: kUInetic's pre-JS cloak comment in the
 * tovu-theme head said `</body>` literally, so the visitor-chat mount and script were spliced into
 * that comment and the site chat FAB never loaded. Same lesson as {@link removeThemeOwnTitleElement}.
 *
 * @complexity O(n·k) over `html`'s length and the number of `tag` occurrences — k is 1 or 2 for any
 * real template.
 */
export function insertBeforeUncommentedTag({ html, tag, markup }: { html: string; tag: RegExp; markup: string }, _optional = {}): string {
  for (let match = tag.exec(html); match !== null; match = tag.exec(html)) {
    if (isInsideHtmlComment({ html, index: match.index })) continue;
    return html.slice(0, match.index) + markup + html.slice(match.index);
  }
  return html;
}

/**
 * True when `index` falls inside an HTML comment. Walks `<!--`/`-->` pairs from the start rather
 * than pattern-matching around `index`, because only a left-to-right scan can tell an opener that is
 * still open at `index` from one that already closed before it. An unterminated `<!--` is treated as
 * swallowing everything after it, which is exactly what a browser's parser does.
 *
 * @complexity O(n) over `html`'s length.
 */
function isInsideHtmlComment({ html, index }: { html: string; index: number }, _optional = {}): boolean {
  const CLOSE = "-->";
  let cursor = 0;
  for (;;) {
    const open = html.indexOf("<!--", cursor);
    if (open === -1 || open > index) return false;
    const close = html.indexOf(CLOSE, open + "<!--".length);
    if (close === -1 || index < close + CLOSE.length) return true;
    cursor = close + CLOSE.length;
  }
}

/**
 * Remove the document's own `<title>` element — the FIRST one that is real markup rather than an
 * incidental mention inside an HTML comment.
 *
 * The naive `html.replace(/<title>[\s\S]*?<\/title>/i, "")` this replaces was a live bug, not a
 * hypothetical one: `themes/static/basic/render/pages/page-shell.html`'s head opens with a comment
 * explaining its title placeholder, and that prose says `<title>` literally. The unanchored pattern
 * matched the mention inside the comment and ran its lazy tail to the real `</title>` further down,
 * deleting the comment's own `-->` along the way. Every head element after it — the theme-token
 * `<style>`, the `theme.css` link, the theme-toggle script — then parsed as comment text, so
 * `/contact`, `/team`, `/faq` and `/terms-of-service` served completely unstyled pages that looked
 * blank above the fold. Scanning for the first *uncommented* occurrence is the same lesson
 * {@link injectPageTitle} (`features/theme/static-render.ts`) already learned on this very template;
 * that one anchors on the placeholder's exact element text, which is unavailable here because this
 * runs after the placeholder has been substituted with a real title.
 *
 * Skipping only the OPEN tag (not a whole candidate element) matters: a lazy whole-element match
 * starting inside the comment consumes the real title as its tail, so a scan that rejected whole
 * matches would find no second candidate and leave two competing `<title>` tags on the page.
 *
 * @complexity O(n·k) worst case over `html`'s length and the number of `<title>` occurrences — k is
 * 1 or 2 for any real template.
 */
function removeThemeOwnTitleElement({ html }: { html: string }, _optional = {}): string {
  const openTag = /<title>/gi;
  for (let open = openTag.exec(html); open !== null; open = openTag.exec(html)) {
    if (isInsideHtmlComment({ html, index: open.index })) continue;
    const closeTag = /<\/title>/gi;
    closeTag.lastIndex = open.index + open[0].length;
    const close = closeTag.exec(html);
    if (close === null) return html;
    return html.slice(0, open.index) + html.slice(close.index + close[0].length);
  }
  return html;
}
