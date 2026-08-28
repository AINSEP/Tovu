import type { ISODateTime, JsonObject, UUID } from "@jini-ai/cms/core";
import type { ThemeTier } from "#src/features/theme/index";

/**
 * @file The `page.head` render seam (ADR-PIPE-008 Decision §2).
 *
 * Purpose:
 * Owned by the render layer, NOT by the `seo` feature module (ADR-032's own
 * Open item 3 named this exact gap and deferred seam ownership to "the theme-
 * contract owner" — this file takes that role). A small, core-owned, in-module
 * ordered registry, the same shape `routing.ts` already uses for
 * `registerResolvePhase`/`registerNamedRoute`: a typed register function + a
 * fold function, not a port (ADR-006/ADR-009 §3 — hooks/registries are exempt
 * from rule-of-two).
 *
 * `HeadElement` is the canonical render IR (never raw HTML strings — the
 * largest theme-injection surface, INV-03). `serializeHeadElements` is the
 * ONE place IR becomes a string; every value is escaped there.
 */

// ---------------------------------------------------------------------------
// IR types
// ---------------------------------------------------------------------------

/** JSON-LD is a plain JSON object graph (schema.org). */
export type JsonLd = JsonObject;

interface HeadElementBase {
  /**
   * behavior.spec.md §2.1's fixed priority bands (title=100, meta-desc=110,
   * canonical=120, robots=130, og=140-149, twitter=150-159 (as `kind:"meta"`
   * with a `twitter:*` name), jsonld=900). Also the §5.2/§6.1 dedup
   * last-writer-wins comparator: among two colliding `HeadElementKey`s, the
   * numerically highest `priority` wins.
   */
  readonly priority: number;
}

/**
 * One `<head>` contribution as a canonical render-IR node — serializable
 * descriptors, never raw HTML strings (INV-03). Deduped by `HeadElementKey`
 * (behavior.spec.md §5.1). Twitter card tags are `kind:"meta"` with a
 * `name` like `"twitter:card"` — no separate "twitter" kind exists.
 */
export type HeadElement =
  | (HeadElementBase & { readonly kind: "title"; readonly text: string })
  | (HeadElementBase & { readonly kind: "meta"; readonly name: string; readonly content: string })
  | (HeadElementBase & { readonly kind: "og"; readonly property: string; readonly content: string })
  | (HeadElementBase & {
      readonly kind: "link";
      readonly rel: string;
      readonly href: string;
      readonly hreflang?: string;
    })
  | (HeadElementBase & { readonly kind: "jsonld"; readonly data: JsonLd });

/** Stable dedup key for a HeadElement (behavior.spec.md §5.1). */
export type HeadElementKey = string;

/**
 * A serializable snapshot of the entry being rendered. NOT a live `PostRecord`
 * — core extracts this at the render seam and hands it to contributors by
 * value.
 */
export interface PageHeadEntryRef {
  id: UUID;
  type: string;
  slug: string;
  title: string;
  status: string;
  publishedAt?: ISODateTime;
  updatedAt: ISODateTime;
  /** The already-extracted, validated `seo_ext_json` bag (serialized, not live). */
  ext: Record<string, unknown>;
  /** Plain-text excerpt derived from `bodyJson` by core (for auto-descriptions). */
  excerpt?: string;
  /** Ancestor chain (root-first) for `BreadcrumbList` JSON-LD, when applicable. */
  ancestors?: ReadonlyArray<{ title: string; url: string }>;
}

/** Everything a `page.head` contributor needs, by value. */
export interface PageHeadContext {
  workspaceId: UUID;
  route: string;
  contentType?: string;
  entry?: PageHeadEntryRef;
  canonicalUrl: string;
  siteTitle: string;
  locale?: string;
  themeTier?: ThemeTier;
}

/**
 * A `page.head` contributor: async-only, explicit priority (contributor-level
 * ordering — see the element-level `priority` above for the fine-grained
 * dedup/ordering rule within/between contributors' own output).
 */
export interface PageHeadHook {
  readonly priority: number;
  handle(ctx: PageHeadContext): Promise<HeadElement[]>;
}

// ---------------------------------------------------------------------------
// Registry (mirrors routing.ts's phaseRegistry/namedRoutes shape)
// ---------------------------------------------------------------------------

let contributors: PageHeadHook[] = [];

/** Core-only registration, called once at composition-root boot. */
export function registerPageHeadContributor(hook: PageHeadHook): void {
  contributors.push(hook);
}

/** Test-only reset of the module-level registry (mirrors `routing.ts`'s test helpers). */
export function resetPageHeadRegistryForTests(): void {
  contributors = [];
}

function headElementKey(element: HeadElement): HeadElementKey {
  switch (element.kind) {
    case "title":
      return "title";
    case "meta":
      return `meta:${element.name}`;
    case "og":
      return `og:${element.property}`;
    case "link":
      return `link:${element.rel}`;
    case "jsonld": {
      const type = element.data["@type"];
      return `jsonld:${typeof type === "string" ? type : "untyped"}`;
    }
  }
}

/**
 * Awaits every registered contributor sorted by ascending contributor
 * `priority` (stable — ties preserve registration order), drops (never
 * rethrows) a throwing contributor's output (REQ-16/EC-06 fail-closed-per-
 * contributor fold), dedups by `HeadElementKey` with last-writer-wins-by-
 * (element)-priority + later-registration tie-break (behavior.spec.md
 * §5.2/§6.1), and returns the final array ordered ascending by each winning
 * element's own `priority` (the INV-required final-order guarantee).
 */
export async function foldPageHead(ctx: PageHeadContext): Promise<HeadElement[]> {
  const sortedContributors = [...contributors].sort((a, b) => a.priority - b.priority);

  const flattened: HeadElement[] = [];
  for (const contributor of sortedContributors) {
    try {
      const elements = await contributor.handle(ctx);
      flattened.push(...elements);
    } catch {
      // Fail-closed-per-contributor: a throwing contributor never breaks the fold.
    }
  }

  // Ascending by element priority (stable) so that, for a colliding key, the
  // highest-priority element is processed (and therefore wins the Map slot) last.
  flattened.sort((a, b) => a.priority - b.priority);

  const winners = new Map<HeadElementKey, HeadElement>();
  for (const element of flattened) {
    winners.set(headElementKey(element), element);
  }

  return [...winners.values()].sort((a, b) => a.priority - b.priority);
}

// ---------------------------------------------------------------------------
// Serialization — the one place IR becomes a string (INV-03)
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * A jsonld payload is `JSON.stringify`-serialized, never string-concatenated
 * (INV-03) — `<` is additionally escaped to `<` so a value containing a
 * literal `</script>` can never break out of the surrounding tag.
 */
function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function serializeElement(element: HeadElement): string {
  switch (element.kind) {
    case "title":
      return `<title>${escapeHtml(element.text)}</title>`;
    case "meta":
      return `<meta name="${escapeHtml(element.name)}" content="${escapeHtml(element.content)}"/>`;
    case "og":
      return `<meta property="${escapeHtml(element.property)}" content="${escapeHtml(element.content)}"/>`;
    case "link": {
      const hreflang = element.hreflang ? ` hreflang="${escapeHtml(element.hreflang)}"` : "";
      return `<link rel="${escapeHtml(element.rel)}" href="${escapeHtml(element.href)}"${hreflang}/>`;
    }
    case "jsonld":
      return `<script type="application/ld+json">${serializeJsonLd(element.data)}</script>`;
  }
}

/** Turns the final `HeadElement[]` into escaped `<head>` tag markup. */
export function serializeHeadElements(elements: HeadElement[]): string {
  return elements.map(serializeElement).join("");
}
