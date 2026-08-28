import type { HeadElement, PageHeadContext, PageHeadEntryRef, PageHeadHook, SeoMeta } from "./types.js";
import { getEntryMeta, type GetEntryMetaDeps } from "./seo.js";

/**
 * @file `seoPageHeadHook` (ADR-PIPE-008 Decision, C-003) — SEO's own
 * `PageHeadHook` implementation. Maps `getEntryMeta`'s resolved `SeoMeta`
 * into ordered `HeadElement[]` per the fixed priority bands
 * (behavior.spec.md §2.1): title=100, meta-desc=110, canonical=120,
 * robots=130, og=140-149, twitter=150-159 (as `kind:"meta"` with a
 * `twitter:*` name — no separate "twitter" `HeadElement` kind exists),
 * jsonld=900. Registered once at `server/app.ts` boot into
 * `page-head.ts`'s registry — never imported directly by `render.ts`.
 */

/** Default contributor-level priority (irrelevant with a single v1 contributor; kept explicit for future ones). */
const DEFAULT_CONTRIBUTOR_PRIORITY = 100;

function robotsContent(noindex: boolean, nofollow: boolean): string {
  return `${noindex ? "noindex" : "index"},${nofollow ? "nofollow" : "follow"}`;
}

/** og:* elements (priority 140-149) — title/type/url always present, image/description only when resolved. */
function buildOpenGraphElements(og: SeoMeta["openGraph"]): HeadElement[] {
  const elements: HeadElement[] = [
    { kind: "og", property: "og:title", content: og.title, priority: 140 },
    { kind: "og", property: "og:type", content: og.type, priority: 141 },
    { kind: "og", property: "og:url", content: og.url, priority: 142 },
  ];
  if (og.image) elements.push({ kind: "og", property: "og:image", content: og.image, priority: 143 });
  if (og.description) elements.push({ kind: "og", property: "og:description", content: og.description, priority: 144 });
  return elements;
}

/** twitter:* meta elements (priority 150-159) — card/title always present, the rest only when resolved. */
function buildTwitterElements(twitter: SeoMeta["twitter"]): HeadElement[] {
  const elements: HeadElement[] = [
    { kind: "meta", name: "twitter:card", content: twitter.card, priority: 150 },
    { kind: "meta", name: "twitter:title", content: twitter.title, priority: 151 },
  ];
  if (twitter.description) elements.push({ kind: "meta", name: "twitter:description", content: twitter.description, priority: 152 });
  if (twitter.image) elements.push({ kind: "meta", name: "twitter:image", content: twitter.image, priority: 153 });
  if (twitter.site) elements.push({ kind: "meta", name: "twitter:site", content: twitter.site, priority: 154 });
  return elements;
}

/** The BreadcrumbList JSON-LD element (priority 900), or `null` when the entry has no ancestors. */
function buildBreadcrumbJsonLd(ancestors: PageHeadEntryRef["ancestors"]): HeadElement | null {
  if (!ancestors || ancestors.length === 0) return null;
  return {
    kind: "jsonld",
    priority: 900,
    data: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: ancestors.map((ancestor, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: ancestor.title,
        item: ancestor.url,
      })),
    },
  };
}

/** Builds SEO's own `PageHeadHook`, closing over the deps `getEntryMeta` needs. */
export function createSeoPageHeadHook(
  deps: GetEntryMetaDeps,
  priority: number = DEFAULT_CONTRIBUTOR_PRIORITY
): PageHeadHook {
  return {
    priority,
    async handle(ctx: PageHeadContext): Promise<HeadElement[]> {
      if (!ctx.entry) {
        // Home / entry-less route: no per-entry meta to resolve — still emit site-level tags.
        return [
          { kind: "title", text: ctx.siteTitle, priority: 100 },
          { kind: "link", rel: "canonical", href: ctx.canonicalUrl, priority: 120 },
        ];
      }

      const resolved = await getEntryMeta(deps, { workspaceId: ctx.workspaceId, entryId: ctx.entry.id });
      const elements: HeadElement[] = [{ kind: "title", text: resolved.title, priority: 100 }];

      if (resolved.description) {
        elements.push({ kind: "meta", name: "description", content: resolved.description, priority: 110 });
      }
      elements.push({ kind: "link", rel: "canonical", href: resolved.canonical, priority: 120 });
      elements.push({
        kind: "meta",
        name: "robots",
        content: robotsContent(resolved.robots.noindex, resolved.robots.nofollow),
        priority: 130,
      });

      elements.push(...buildOpenGraphElements(resolved.openGraph));
      elements.push(...buildTwitterElements(resolved.twitter));

      for (const jsonLdEntry of resolved.jsonLd) {
        elements.push({ kind: "jsonld", data: jsonLdEntry, priority: 900 });
      }

      const breadcrumb = buildBreadcrumbJsonLd(ctx.entry.ancestors);
      if (breadcrumb) elements.push(breadcrumb);

      return elements;
    },
  };
}
