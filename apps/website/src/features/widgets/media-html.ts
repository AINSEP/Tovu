/** Parser-backed page-body policy, also used by media Raw HTML. Temporary host placement:
 * new Jini exports cannot be imported by the running server until its dist is rebuilt. */
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { parseEmbedHtmlAttributes } from '@jini-ai/cms/widgets/markers';
import type { JsonObject } from '@jini-ai/core/primitives';

type Element = DefaultTreeAdapterMap['element'];
type Child = DefaultTreeAdapterMap['childNode'];
const SAFE_ELEMENTS = new Set('a abbr address article aside audio b blockquote br button caption cite code col colgroup dd details dfn div dl dt em figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i img input label li main nav ol option p picture pre section select small source span style strong sub summary sup table tbody td template textarea tfoot th thead time tr track u ul video wbr'.split(' '));
// Content attributes run through the SAME value checks as the shared allowlist's URL attribute.
// Names are fixed here, never taken from input; script-bearing attributes remain disallowed.
// tool* are WebMCP declarative form attributes (themes carry them; owner, 2026-09-17).
const CONTENT_ATTRIBUTES = new Set('src srcset href alt width height controls preload sizes type name value method action for required disabled checked selected multiple placeholder rows cols min max step colspan rowspan datetime open download target rel autocomplete minlength fetchpriority toolname tooldescription toolautosubmit toolparamtitle toolparamdescription'.split(' '));
// Inline SVG icons (shape + paint only). No script/style/foreignObject/a/use/image/animate/set:
// those execute, load external resources, or rewrite attributes after this check runs.
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SVG_ELEMENTS = new Set('svg g path rect circle ellipse line polyline polygon defs title desc linearGradient radialGradient stop clipPath mask'.split(' '));
// Presentation/geometry names only (parse5 keeps SVG camelCase). Values still pass the URL-value check.
const SVG_ATTRIBUTES = new Set('viewBox preserveAspectRatio focusable d points x y x1 y1 x2 y2 cx cy r rx ry width height transform fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity clip-path clip-rule clipPathUnits mask maskUnits vector-effect offset stop-color stop-opacity gradientUnits gradientTransform fx fy pathLength'.split(' '));
function safeAttribute(attr: Element['attrs'][number], options: { styleContext?: 'stylesheet' } = {}): boolean {
  if (attr.namespace || attr.prefix) return false;
  if (SVG_ATTRIBUTES.has(attr.name)) return safeAttribute({ name: 'poster', value: attr.value });
  if (attr.name === 'srcset') {
    for (const source of attr.value.split(',')) {
      const url = source.trim().split(/\s+/)[0];
      if (!url) return false;
      try { if (!['http:', 'https:'].includes(new URL(url, 'https://media.invalid/').protocol)) return false; }
      catch { return false; }
    }
  }
  const policyName = CONTENT_ATTRIBUTES.has(attr.name) ? 'poster' : attr.name;
  const text = `${policyName}="${attr.value.replace(/"/g, '&quot;')}"`;
  return Object.hasOwn(parseEmbedHtmlAttributes({ text }, options).attributes, policyName);
}

/** Sanitize parsed, entity-decoded HTML without regex tag rewriting. O(n) time/output space.
 * Safe data/aria/class/style use the shared embed attribute policy; foreign/executable subtrees drop. */
export function sanitizePageHtml({ html }: { html: string }, _optional: Record<string, never> = {}): string {
  const root = parseFragment(html);
  const parents: { parent: DefaultTreeAdapterMap['documentFragment'] | Element; depth: number }[] = [{ parent: root, depth: 0 }];
  while (parents.length) {
    const { parent, depth } = parents.pop()!;
    parent.childNodes = parent.childNodes.filter(child => {
      if (!('tagName' in child)) return child.nodeName === '#text';
      // Bound native serializer recursion as well as our own traversal on imported HTML.
      if (depth >= 128) return false;
      const allowed = child.namespaceURI === 'http://www.w3.org/1999/xhtml' ? SAFE_ELEMENTS : child.namespaceURI === SVG_NAMESPACE ? SVG_ELEMENTS : undefined;
      if (!allowed?.has(child.tagName)) return false;
      if (child.tagName === 'style') {
        const css = child.childNodes.map(node => 'value' in node ? node.value : '').join('');
        // A stylesheet may use Unicode glyph escapes; the inline-attribute policy rejects them.
        // Validate with the shared stylesheet context without changing the authored rule bytes.
        if (!safeAttribute({ name: 'style', value: css }, { styleContext: 'stylesheet' })) return false;
      }
      child.attrs = child.attrs.filter(attr => safeAttribute(attr));
      // A collection marker's authored <template> keeps its item markup in the inert `content`
      // fragment, not childNodes: hold that markup to the same element/attribute rules.
      parents.push({ parent: 'content' in child ? child.content : child, depth: depth + 1 });
      return true;
    });
  }
  return serialize(root);
}

interface RawMediaRequired {
  html: string;
  media: Readonly<Record<string, JsonObject>>;
  renderMedia: (required: { props: JsonObject }, optional?: Record<string, never>) => string;
}

/** Resolve from the existing media IR, never fabricate a URL from an unknown slug. Canonical
 * metadata/rendering belongs to the injected host media renderer. O(n + a) for HTML and assets. */
export function renderMediaRawHtml({ html, media, renderMedia }: RawMediaRequired, { reportIssue = ({ slug }) => console.warn('[media] unknown slug in raw HTML', { slug }) }: { reportIssue?: (required: { slug: string }, optional?: Record<string, never>) => void } = {}): string {
  const rendered = new Map<string, Element | undefined>();
  const resolve = (slug: string): Element | undefined => {
    if (rendered.has(slug)) return rendered.get(slug);
    const props = Object.hasOwn(media, slug) ? media[slug] : undefined;
    const fragment = props ? parseFragment(renderMedia({ props: { ...props, galleryResponsive: true } })) : undefined;
    const element = fragment?.childNodes.find((node): node is Element => 'tagName' in node && ['img', 'video', 'audio'].includes(node.tagName));
    rendered.set(slug, element);
    if (!element) reportIssue({ slug });
    return element;
  };
  const root = parseFragment(sanitizePageHtml({ html }));
  const visit = (node: Child): boolean => {
    if ('value' in node && node.nodeName === '#text') {
      let found = true;
      node.value = node.value.replace(/\{\{media:([^{}]+)\}\}/g, (_token, slug: string) => {
        const src = resolve(slug)?.attrs.find(attr => attr.name === 'src')?.value;
        if (!src) found = false;
        return src ?? '';
      });
      return found;
    }
    if (!('tagName' in node)) return false;
    const slug = node.attrs.find(attr => attr.name === 'data-media-slug')?.value;
    if (slug !== undefined) {
      const canonical = resolve(slug);
      if (!canonical || !['img', 'video', 'audio', 'source'].includes(node.tagName)) return false;
      if (node.tagName !== 'source' && node.tagName !== canonical.tagName) {
        console.warn('[media] media kind does not match Raw HTML element', { slug, tag: node.tagName, mediaTag: canonical.tagName });
        return false;
      }
      // A data-media-slug denotes library source ownership; authored alt still overrides the fallback.
      const metadata = new Set(['src', 'srcset', 'width', 'height', 'alt']);
      const authoredAlt = node.attrs.find(attr => attr.name === 'alt');
      node.attrs = node.attrs.filter(attr => !metadata.has(attr.name));
      node.attrs.push(...canonical.attrs.filter(attr => metadata.has(attr.name) && !(attr.name === 'alt' && authoredAlt)));
      if (authoredAlt) node.attrs.push(authoredAlt);
    }
    for (const attr of node.attrs) {
      let found = true;
      attr.value = attr.value.replace(/\{\{media:([^{}]+)\}\}/g, (_token, key: string) => {
        const src = resolve(key)?.attrs.find(item => item.name === 'src')?.value;
        if (!src) found = false;
        return src ?? '';
      });
      if (!found) return false;
    }
    return true;
  };
  // Iterative tree walk: deeply nested owner/import HTML cannot consume the JS call stack.
  const dropped = new Set<Child>();
  const elements: Element[] = [];
  const stack: { node: Child; parent: Element | DefaultTreeAdapterMap['documentFragment'] }[] = root.childNodes.map(node => ({ node, parent: root }));
  while (stack.length) {
    const { node, parent } = stack.pop()!;
    if (!visit(node)) {
      dropped.add(node);
      if (node.nodeName === '#text' && 'tagName' in parent) dropped.add(parent);
      continue;
    }
    if ('tagName' in node) {
      elements.push(node);
      for (const child of node.childNodes) stack.push({ node: child, parent: node });
    }
  }
  for (const element of elements.reverse()) {
    const count = element.childNodes.length;
    element.childNodes = element.childNodes.filter(child => !dropped.has(child));
    if (['audio', 'video', 'picture'].includes(element.tagName) && count && !element.childNodes.length && !element.attrs.some(attr => attr.name === 'src')) dropped.add(element);
  }
  root.childNodes = root.childNodes.filter(node => !dropped.has(node));
  return sanitizePageHtml({ html: serialize(root) });
}
