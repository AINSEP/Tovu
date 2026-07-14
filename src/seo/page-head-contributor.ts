import type { HeadElement, PageHeadContext, PageHeadHook } from "../server/http/site/page-head";
import { getEntryMeta, type GetEntryMetaDeps } from "./seo";

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

      elements.push({ kind: "og", property: "og:title", content: resolved.openGraph.title, priority: 140 });
      elements.push({ kind: "og", property: "og:type", content: resolved.openGraph.type, priority: 141 });
      elements.push({ kind: "og", property: "og:url", content: resolved.openGraph.url, priority: 142 });
      if (resolved.openGraph.image) {
        elements.push({ kind: "og", property: "og:image", content: resolved.openGraph.image, priority: 143 });
      }
      if (resolved.openGraph.description) {
        elements.push({ kind: "og", property: "og:description", content: resolved.openGraph.description, priority: 144 });
      }

      elements.push({ kind: "meta", name: "twitter:card", content: resolved.twitter.card, priority: 150 });
      elements.push({ kind: "meta", name: "twitter:title", content: resolved.twitter.title, priority: 151 });
      if (resolved.twitter.description) {
        elements.push({ kind: "meta", name: "twitter:description", content: resolved.twitter.description, priority: 152 });
      }
      if (resolved.twitter.image) {
        elements.push({ kind: "meta", name: "twitter:image", content: resolved.twitter.image, priority: 153 });
      }
      if (resolved.twitter.site) {
        elements.push({ kind: "meta", name: "twitter:site", content: resolved.twitter.site, priority: 154 });
      }

      for (const jsonLdEntry of resolved.jsonLd) {
        elements.push({ kind: "jsonld", data: jsonLdEntry, priority: 900 });
      }

      if (ctx.entry.ancestors && ctx.entry.ancestors.length > 0) {
        elements.push({
          kind: "jsonld",
          priority: 900,
          data: {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: ctx.entry.ancestors.map((ancestor, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: ancestor.title,
              item: ancestor.url,
            })),
          },
        });
      }

      return elements;
    },
  };
}
