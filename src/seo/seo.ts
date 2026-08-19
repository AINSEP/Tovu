import type { JsonValue } from "@jini-ai/cms/core";
import type { PostKind, PostRecord, PostRepoPort } from "../features/post/index.js";
import { getEffective, type SettingsRepoPort } from "../features/settings/index.js";
import { urlFor } from "../routing/index.js";
import type { RouteResolverDeps } from "../routing/index.js";
import { SeoEntryNotFoundError } from "./errors.js";
import { getSeoSettings, type GetSeoSettingsDeps } from "./settings.js";
import { resolveSeoImageRef, type ResolveSeoImageRefDeps } from "./media.js";
import type { SeoAnalysis, SeoExtFields, SeoIssue, SeoMeta } from "./types.js";

/**
 * @file `getEntryMeta`/`analyzeEntry` (ADR-PIPE-008 Decision, C-001/C-002) —
 * the pure effective-meta evaluator, per-field precedence (behavior.spec.md
 * §1.1): override ▸ site default ▸ derived. Consumed identically by the
 * admin preview, the public render (via `page-head-contributor.ts`), and
 * `analyzeEntry` — the one evaluator, no back door (INV-09). Never writes
 * anything — reads only, via injected deps.
 */

const SEO_NAMESPACE = "site.seo";

/** Content-type -> JSON-LD `@type` map (behavior.spec.md §1.1/§3; REQ-07). */
const CONTENT_TYPE_SCHEMA_MAP: Record<PostKind, string> = {
  post: "Article",
  page: "WebPage",
};

function isJsonObjectLike(value: unknown): value is { type?: unknown; text?: unknown; content?: unknown[] } {
  return typeof value === "object" && value !== null;
}

/** Plain-text extraction over a TipTap/ProseMirror-style doc (for the derived-excerpt fallback). */
function extractPlainText(node: unknown): string {
  if (!isJsonObjectLike(node)) return "";
  const parts: string[] = [];
  if (typeof node.text === "string") parts.push(node.text);
  if (Array.isArray(node.content)) {
    for (const child of node.content) parts.push(extractPlainText(child));
  }
  return parts.join(" ");
}

const EXCERPT_MAX_LENGTH = 160;

function deriveExcerpt(post: PostRecord): string | undefined {
  const text = extractPlainText(post.bodyJson).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > EXCERPT_MAX_LENGTH ? `${text.slice(0, EXCERPT_MAX_LENGTH).trim()}…` : text;
}

function parseOverrides(post: PostRecord): SeoExtFields {
  if (!post.seoExtJson) return {};
  try {
    return JSON.parse(post.seoExtJson) as SeoExtFields;
  } catch {
    return {};
  }
}

/**
 * behavior.spec.md §1.1's `robots.noindex` row needs to know whether the
 * workspace's `default_robots_noindex` was EXPLICITLY configured (site
 * default present) vs. still resting on the ledger's own schema default
 * (site default effectively absent) — `getSeoSettings` alone can't
 * distinguish these (it only returns the resolved value, per
 * `settings.ts`'s doc comment), so this reads the raw `getEffective`
 * `sourceLayer` directly. Only `noindex` needs this: `nofollow`'s derived
 * and default outcomes are identical (`false`), so no test/behavior depends
 * on distinguishing them there.
 */
async function isDefaultRobotsNoindexExplicitlySet(settingsRepo: SettingsRepoPort, workspaceId: string): Promise<boolean> {
  const resolved = await getEffective(
    { repo: settingsRepo },
    { namespace: SEO_NAMESPACE, key: "default_robots_noindex", scopeContext: { workspaceId } }
  );
  return resolved !== null && resolved.sourceLayer !== "default";
}

export interface GetEntryMetaDeps {
  postRepo: PostRepoPort;
  settingsRepo: SettingsRepoPort;
  media: ResolveSeoImageRefDeps;
}

export interface GetEntryMetaInput {
  workspaceId: string;
  entryId: string;
}

/**
 * Resolves the effective `SeoMeta` for one entry (override ▸ site default ▸
 * derived, per field — behavior.spec.md §1.1). Never partial.
 *
 * @complexity O(1) — one post read, one settings resolution (8 bounded
 * `getEffective` reads), up to 2 media lookups.
 */
export async function getEntryMeta(deps: GetEntryMetaDeps, input: GetEntryMetaInput): Promise<SeoMeta> {
  const post = await deps.postRepo.findById({ workspaceId: input.workspaceId, id: input.entryId });
  if (!post) throw new SeoEntryNotFoundError(`entry '${input.entryId}' was not found`);

  const overrides = parseOverrides(post);
  const settings = await getSeoSettings({ settingsRepo: deps.settingsRepo } satisfies GetSeoSettingsDeps, {
    workspaceId: input.workspaceId,
  });

  // --- title: override, else titleTemplate applied to entry.title (never empty — entry.title is
  // itself validated non-empty at the post write chokepoint, and %s substitution never drops it). ---
  const title = overrides.title ?? settings.titleTemplate.replaceAll("%s", post.title);

  // --- description: override > site default > derived excerpt > omitted. ---
  const description = overrides.description ?? settings.defaultDescription ?? deriveExcerpt(post);

  // --- canonical: override (accepted cross-domain as-is, EC-10) > routing-resolved. Never invents
  // a local origin (INV-07) — a draft (routing.urlFor returns null for non-published entries) falls
  // back to the bare relative path rather than fabricating an absolute URL. ---
  const routingResolverDeps: RouteResolverDeps = { postRepo: deps.postRepo };
  const routed = await urlFor({
    deps: routingResolverDeps,
    target: { kind: "entryRef", entryId: post.id, contentType: post.kind },
    ctx: { workspaceId: input.workspaceId },
  });
  const canonical = overrides.canonical ?? routed?.canonicalUrl ?? `/${post.slug}`;

  // --- robots: override > site default > derived (draft-safety fallback for noindex, EC-11). ---
  let noindex: boolean;
  if (overrides.noindex !== undefined) {
    noindex = overrides.noindex;
  } else if (await isDefaultRobotsNoindexExplicitlySet(deps.settingsRepo, input.workspaceId)) {
    noindex = settings.defaultRobots.noindex;
  } else {
    noindex = post.status !== "published";
  }
  const nofollow = overrides.nofollow ?? settings.defaultRobots.nofollow ?? false;

  // --- openGraph/twitter image refs resolve through media (fail-soft, EC-07). ---
  const ogImageRef = overrides.ogImage ?? settings.defaultOgImage;
  const ogImage = ogImageRef ? await resolveSeoImageRef(deps.media, { workspaceId: input.workspaceId, ref: ogImageRef }) : undefined;
  const twitterImageRef = overrides.twitterImage ?? settings.defaultOgImage;
  const twitterImage = twitterImageRef
    ? await resolveSeoImageRef(deps.media, { workspaceId: input.workspaceId, ref: twitterImageRef })
    : undefined;

  const ogType = overrides.ogType ?? (post.kind === "page" ? "website" : "article");
  const schemaType = overrides.schemaType ?? CONTENT_TYPE_SCHEMA_MAP[post.kind];

  const jsonLdEntry: Record<string, JsonValue> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    ...(post.kind === "post" ? { headline: title } : { name: title }),
  };
  if (description) jsonLdEntry.description = description;

  return {
    title,
    description,
    canonical,
    robots: { noindex, nofollow },
    openGraph: {
      title: overrides.ogTitle ?? title,
      description: overrides.ogDescription ?? description,
      type: ogType,
      url: canonical,
      image: ogImage,
      siteName: undefined,
    },
    twitter: {
      card: overrides.twitterCard ?? "summary_large_image",
      title: overrides.twitterTitle ?? title,
      description: overrides.twitterDescription ?? description,
      image: twitterImage,
      site: settings.twitterSite,
    },
    jsonLd: [jsonLdEntry],
  };
}

/** REQ-14 — SEO analysis over `getEntryMeta`'s resolved result (pure decision, no additional I/O). */
export async function analyzeEntry(
  deps: GetEntryMetaDeps,
  input: GetEntryMetaInput
): Promise<SeoAnalysis> {
  const resolved = await getEntryMeta(deps, input);
  const issues: SeoIssue[] = [];

  if (!resolved.title) {
    issues.push({ code: "missing_title", severity: "error", message: "Title is missing.", field: "title" });
  }
  if (!resolved.description) {
    issues.push({
      code: "missing_description",
      severity: "warning",
      message: "Description is missing.",
      field: "description",
    });
  }

  const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 20);

  return { entryId: input.entryId, score, issues, resolved };
}
