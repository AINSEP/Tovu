import type { JsonValue } from "@jini-ai/cms/core";
import type { PostKind, PostRecord, PostRepoPort } from "../post/index.js";
import { getEffective, type SettingsRepoPort } from "../settings/index.js";
import { urlFor } from "../../platform/routing/index.js";
import type { RouteResolverDeps } from "../../platform/routing/index.js";
import { SeoEntryNotFoundError } from "./errors.js";
import { getSeoSettings, type GetSeoSettingsDeps } from "./settings.js";
import { resolveSeoImageRef, type ResolveSeoImageRefDeps } from "./media.js";
import type { OpenGraphType, SeoAnalysis, SeoExtFields, SeoIssue, SeoMeta } from "./types.js";

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

type ResolvedSeoSettings = Awaited<ReturnType<typeof getSeoSettings>>;

/** canonical: override (accepted cross-domain as-is, EC-10) > routing-resolved. Never invents a
 *  local origin (INV-07) — a draft falls back to the bare relative path rather than fabricating an
 *  absolute URL. */
async function resolveCanonical(deps: GetEntryMetaDeps, post: PostRecord, overrides: SeoExtFields, workspaceId: string): Promise<string> {
  const routingResolverDeps: RouteResolverDeps = { postRepo: deps.postRepo };
  const routed = await urlFor({
    deps: routingResolverDeps,
    target: { kind: "entryRef", entryId: post.id, contentType: post.kind },
    ctx: { workspaceId },
  });
  return overrides.canonical ?? routed?.canonicalUrl ?? `/${post.slug}`;
}

/** robots: override > site default > derived (draft-safety fallback for noindex, EC-11). */
async function resolveRobots(
  deps: GetEntryMetaDeps,
  post: PostRecord,
  overrides: SeoExtFields,
  settings: ResolvedSeoSettings,
  workspaceId: string
): Promise<{ noindex: boolean; nofollow: boolean }> {
  let noindex: boolean;
  if (overrides.noindex !== undefined) {
    noindex = overrides.noindex;
  } else if (await isDefaultRobotsNoindexExplicitlySet(deps.settingsRepo, workspaceId)) {
    noindex = settings.defaultRobots.noindex;
  } else {
    noindex = post.status !== "published";
  }
  const nofollow = overrides.nofollow ?? settings.defaultRobots.nofollow ?? false;
  return { noindex, nofollow };
}

/** openGraph/twitter image refs resolve through media (fail-soft, EC-07). */
async function resolveShareImages(
  deps: GetEntryMetaDeps,
  overrides: SeoExtFields,
  settings: ResolvedSeoSettings,
  workspaceId: string
): Promise<{ ogImage: string | undefined; twitterImage: string | undefined }> {
  const ogImageRef = overrides.ogImage ?? settings.defaultOgImage;
  const ogImage = ogImageRef ? await resolveSeoImageRef(deps.media, { workspaceId, ref: ogImageRef }) : undefined;
  const twitterImageRef = overrides.twitterImage ?? settings.defaultOgImage;
  const twitterImage = twitterImageRef ? await resolveSeoImageRef(deps.media, { workspaceId, ref: twitterImageRef }) : undefined;
  return { ogImage, twitterImage };
}

/** title: override, else titleTemplate applied to entry.title. description: override > site default >
 *  derived excerpt > omitted. */
function resolveTitleAndDescription(
  post: PostRecord,
  overrides: SeoExtFields,
  settings: ResolvedSeoSettings
): { title: string; description: string | undefined } {
  // title is never empty — entry.title is itself validated non-empty at the post write
  // chokepoint, and %s substitution never drops it.
  const title = overrides.title ?? settings.titleTemplate.replaceAll("%s", post.title);
  const description = overrides.description ?? settings.defaultDescription ?? deriveExcerpt(post);
  return { title, description };
}

/** ogType/schemaType (REQ-07): override, else derived from the entry's content kind. */
function resolveContentTypeFields(
  post: PostRecord,
  overrides: SeoExtFields
): { ogType: OpenGraphType; schemaType: string } {
  const ogType = overrides.ogType ?? (post.kind === "page" ? "website" : "article");
  const schemaType = overrides.schemaType ?? CONTENT_TYPE_SCHEMA_MAP[post.kind];
  return { ogType, schemaType };
}

function buildOpenGraph(
  overrides: SeoExtFields,
  title: string,
  description: string | undefined,
  ogType: OpenGraphType,
  canonical: string,
  ogImage: string | undefined
): SeoMeta["openGraph"] {
  return {
    title: overrides.ogTitle ?? title,
    description: overrides.ogDescription ?? description,
    type: ogType,
    url: canonical,
    image: ogImage,
    siteName: undefined,
  };
}

function buildTwitter(
  overrides: SeoExtFields,
  title: string,
  description: string | undefined,
  twitterImage: string | undefined,
  settings: ResolvedSeoSettings
): SeoMeta["twitter"] {
  return {
    card: overrides.twitterCard ?? "summary_large_image",
    title: overrides.twitterTitle ?? title,
    description: overrides.twitterDescription ?? description,
    image: twitterImage,
    site: settings.twitterSite,
  };
}

/** JSON-LD `@type` (REQ-07) plus the headline/name field, which differs by content kind. */
function buildJsonLdEntry(post: PostRecord, schemaType: string, title: string, description: string | undefined): Record<string, JsonValue> {
  const jsonLdEntry: Record<string, JsonValue> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    ...(post.kind === "post" ? { headline: title } : { name: title }),
  };
  if (description) jsonLdEntry.description = description;
  return jsonLdEntry;
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

  const { title, description } = resolveTitleAndDescription(post, overrides, settings);
  const canonical = await resolveCanonical(deps, post, overrides, input.workspaceId);
  const { noindex, nofollow } = await resolveRobots(deps, post, overrides, settings, input.workspaceId);
  const { ogImage, twitterImage } = await resolveShareImages(deps, overrides, settings, input.workspaceId);
  const { ogType, schemaType } = resolveContentTypeFields(post, overrides);

  return {
    title,
    description,
    canonical,
    robots: { noindex, nofollow },
    openGraph: buildOpenGraph(overrides, title, description, ogType, canonical, ogImage),
    twitter: buildTwitter(overrides, title, description, twitterImage, settings),
    jsonLd: [buildJsonLdEntry(post, schemaType, title, description)],
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
