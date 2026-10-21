import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import { escapeHtml } from "#src/platform/html/escape";
import type { PreviewSwitcher } from "./preview-switcher.js";

interface PreviewPage {
  html: string; config: PreviewSwitcher; activeThemeId: string; currentThemeId: string;
  path: string; origin?: string; preview: boolean; delivery: "live" | "static";
}
type Element = DefaultTreeAdapterMap["element"];
type Node = DefaultTreeAdapterMap["node"];

/** Theme-independent navigation URL, shared by the banner and static manifest. */
export function previewThemePath({ themeId, activeThemeId, path }: { themeId: string; activeThemeId: string; path: string }, _options = {}): string {
  return themeId === activeThemeId ? path : `/_themes/${encodeURIComponent(themeId)}${path}`;
}

const BANNER_CSS = `
:host{all:initial!important;display:block!important;color-scheme:light!important}
.tovu-theme-preview-bar{all:initial;box-sizing:border-box;display:flex;align-items:center;gap:8px;min-height:44px;padding:5px 12px;background:#111827;color:#fff;font:14px/1.4 system-ui,sans-serif;white-space:nowrap;overflow-x:auto;max-width:100%;scrollbar-width:thin}
.tovu-theme-preview-label{all:initial;font:inherit;color:inherit;flex:none}
.tovu-theme-preview-choice{all:initial;box-sizing:border-box;display:inline-block;flex:none;padding:6px 10px;border:1px solid #64748b;border-radius:4px;font:inherit;color:#fff;cursor:pointer;text-decoration:none}
.tovu-theme-preview-choice[aria-current]{background:#fff;color:#111827;border-color:#fff}
.tovu-theme-preview-choice:focus-visible{outline:3px solid #fbbf24;outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;

// Only layout measurement lives in the browser; selection and rendering already happened on the server.
const BANNER_SCRIPT = `(function(){
var host=document.querySelector('.tovu-theme-preview-host');if(!host)return;
var template=host.querySelector('template');
if(!host.shadowRoot&&template){host.attachShadow({mode:'open'}).appendChild(template.content);template.remove();}
var root=document.documentElement,body=document.body;
var spacing=document.getElementById('tovu-theme-preview-spacing');spacing.sheet.disabled=true;
root.style.setProperty('--tovu-theme-preview-base-padding',getComputedStyle(body).paddingTop);spacing.sheet.disabled=false;
var chrome=Array.from(body.querySelectorAll('*')).filter(function(el){
 if(el===host)return false;
 var style=getComputedStyle(el);return (style.position==='fixed'||style.position==='sticky')&&style.top==='0px';
});
function measure(){var height=host.getBoundingClientRect().height;
 root.style.setProperty('--tovu-theme-preview-height',height+'px');
 body.style.setProperty('padding-top','calc(var(--tovu-theme-preview-base-padding) + var(--tovu-theme-preview-height))','important');
 chrome.forEach(function(el){el.style.setProperty('top','var(--tovu-theme-preview-height)','important');});
}
measure();if(typeof ResizeObserver!=='undefined')new ResizeObserver(measure).observe(host);
})();`;

function renderBanner({ config, activeThemeId, currentThemeId, path, delivery }: PreviewPage, _options = {}): string {
  const choices = config.themes.map(theme => {
    const href = delivery === "static" ? previewThemePath({ themeId: theme.themeId, activeThemeId, path }) : `${path}?theme=${encodeURIComponent(theme.themeId)}`;
    return `<a class="tovu-theme-preview-choice" href="${escapeHtml(href)}"${theme.themeId === currentThemeId ? ' aria-current="true"' : ""}>${escapeHtml(theme.label)}</a>`;
  }).join("");
  return `<div class="tovu-theme-preview-host" style="all:initial!important;display:block!important;position:fixed!important;top:0!important;left:0!important;right:0!important;width:100%!important;z-index:2147483647!important"><template shadowrootmode="open"><style>${BANNER_CSS}</style><nav class="tovu-theme-preview-bar" aria-label="Theme preview"><span class="tovu-theme-preview-label">Theme preview</span>${choices}</nav></template></div>`;
}

function attr({ element, name }: { element: Element; name: string }, _options = {}): string | undefined {
  return element.attrs.find(attribute => attribute.name === name)?.value;
}

function isSeoOverride({ element, preview }: { element: Element; preview: boolean }, _options = {}): boolean {
  if (element.tagName === "link") return (attr({ element, name: "rel" }) ?? "").toLowerCase().split(/\s+/).includes("canonical");
  return preview && element.tagName === "meta" && /^(robots|googlebot)$/i.test(attr({ element, name: "name" }) ?? "");
}

/** Relative and same-origin navigation stays in the variant; assets and external URLs stay put. */
function rewriteNavigation({ element, page, prefix }: { element: Element; page: PreviewPage; prefix: string }, _options = {}): void {
  if (element.tagName !== "a" || !prefix) return;
  const href = element.attrs.find(attribute => attribute.name === "href");
  if (!href || href.value.startsWith("#")) return;
  const base = new URL(page.path, page.origin ?? "https://tovu-preview.invalid");
  if (!URL.canParse(href.value, base)) return;
  const target = new URL(href.value, base);
  if (target.origin !== base.origin || /^\/(?:_themes|theme-assets|m|api|admin|agent-icons)(?:\/|$)/.test(target.pathname)) return;
  target.searchParams.delete("theme");
  href.value = prefix + target.pathname + target.search + target.hash;
}

/** Walk the parsed document once; template/script contents remain opaque to navigation rewriting. */
function transformDocument({ document, page }: { document: DefaultTreeAdapterMap["document"]; page: PreviewPage }, _options = {}): void {
  const prefix = page.delivery === "static" ? previewThemePath({ themeId: page.currentThemeId, activeThemeId: page.activeThemeId, path: "" }) : "";
  const pending: Node[] = [document];
  for (let node = pending.pop(); node; node = pending.pop()) {
    if ("tagName" in node) rewriteNavigation({ element: node, page, prefix });
    if ("childNodes" in node) {
      node.childNodes = node.childNodes.filter(child => !("tagName" in child && isSeoOverride({ element: child, preview: page.preview && page.delivery === "static" })));
      for (const child of node.childNodes) pending.push(child);
    }
  }
}

/** Emit normal-URL SEO metadata and a no-script spacing fallback. */
function previewHead({ page }: { page: PreviewPage }, _options = {}): string {
  const canonical = new URL(page.path, page.origin ?? "https://tovu-preview.invalid");
  canonical.searchParams.delete("theme");
  const robots = page.preview && page.delivery === "static" ? '<meta name="robots" content="noindex">' : "";
  const canonicalHref = page.origin ? canonical.href : canonical.pathname + canonical.search;
  return `<link rel="canonical" href="${escapeHtml(canonicalHref)}">${robots}<style id="tovu-theme-preview-spacing">body{padding-top:calc(var(--tovu-theme-preview-base-padding,0px) + var(--tovu-theme-preview-height,44px))!important}</style>`;
}

/** Decorate the real renderer's finished HTML for every theme tier. O(HTML size), no I/O.
 * parse5 owns HTML parsing so script text, unquoted attributes and entity-encoded links stay safe. */
export function decoratePreviewPage(page: PreviewPage, _options = {}): string {
  if (!page.config.enabled) return page.html;
  const document = parse(page.html);
  transformDocument({ document, page });
  // parse() guarantees html/head/body even for fragments; inject into nodes, never script strings.
  const root = document.childNodes.find(node => "tagName" in node && node.tagName === "html") as Element;
  const head = root.childNodes.find(node => "tagName" in node && node.tagName === "head") as Element;
  const body = root.childNodes.find(node => "tagName" in node && node.tagName === "body") as Element;
  insertMarkup({ parent: head, markup: previewHead({ page }) });
  insertMarkup({ parent: body, markup: renderBanner(page), position: "first" });
  insertMarkup({ parent: body, markup: `<script>${BANNER_SCRIPT}</script>` });
  return serialize(document);
}

/** Small, bounded platform fragments are inserted into the parsed renderer document. */
function insertMarkup({ parent, markup, position = "last" }: { parent: Element; markup: string; position?: "first" | "last" }, _options = {}): void {
  const nodes = parseFragment(markup).childNodes;
  for (const node of nodes) node.parentNode = parent;
  if (position === "first") parent.childNodes.unshift(...nodes);
  else parent.childNodes.push(...nodes);
}
