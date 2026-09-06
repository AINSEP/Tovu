import type { UUID } from "@jini-ai/cms/core";
import type {
  AssetRenditionRepoPort,
  MediaRecord,
  MediaRepoPort,
  TransformDefinitionRecord,
  TransformDefinitionRepoPort,
  TransformFormat,
} from "../media/index.js";

/**
 * @file `resolveSeoImageRef` (ADR-PIPE-008 Decision §6, C-013, EC-07;
 * EC-07's "never generates" clause AMENDED 2026-09-05 — see the ADR's
 * Amendments section) — media-ref-to-URL resolution for
 * `ogImage`/`twitterImage`. Read-only, over `media`'s existing repos (no new
 * port). Never throws — resolves `undefined` on any lookup miss (deleted
 * asset, trashed asset, unregistered transform) so the rest of the head
 * render never breaks over one bad image reference.
 *
 * Does NOT require a rendition to already exist. It always composes the URL
 * for the LATEST registered version of `transformName` (`buildSeoImageUrl`
 * below), whether or not that exact rendition row has been generated yet.
 * This is safe because the public serving route
 * (`routes/site/media-rendition.ts` -> `resolveMediaRendition` ->
 * `isLatestTransformVersion`) always allows anonymous lazy generation for a
 * not-yet-generated rendition of the latest registered version — the same
 * "latest" this function selects — so every URL this function emits is
 * guaranteed servable on first fetch. `assetRenditionRepo` stays on
 * {@link ResolveSeoImageRefDeps} unused by this function today (kept for
 * shape stability / potential future consumers, e.g. an admin preview that
 * wants to know whether a rendition already exists) rather than removed as
 * part of this change.
 */

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

function isAbsoluteUrl(value: string): boolean {
  return ABSOLUTE_URL_PATTERN.test(value) || value.startsWith("//");
}

/** Cosmetic only (ADR-027 §4 — never participates in the rendition lookup itself). */
const EXT_BY_TRANSFORM_FORMAT: Record<TransformFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
};

export interface ResolveSeoImageRefDeps {
  mediaRepo: MediaRepoPort;
  assetRenditionRepo: AssetRenditionRepoPort;
  transformDefinitionRepo: TransformDefinitionRepoPort;
}

export interface ResolveSeoImageRefInput {
  workspaceId: UUID;
  /** Either `"{assetId}:{transformName}"` or an already-absolute URL. */
  ref: string;
}

/** Splits `"{assetId}:{transformName}"` out of a ref string, or `null` when the ref is not that shape. */
function parseMediaRefParts(ref: string): { assetId: string; transformName: string } | null {
  const separatorIndex = ref.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === ref.length - 1) return null;
  return { assetId: ref.slice(0, separatorIndex), transformName: ref.slice(separatorIndex + 1) };
}

/** The asset, or `null` when it does not exist or is trashed (EC-07 fail-soft miss). */
async function resolveVisibleAsset(deps: ResolveSeoImageRefDeps, workspaceId: UUID, assetId: string): Promise<MediaRecord | null> {
  const asset = await deps.mediaRepo.findById({ workspaceId, id: assetId });
  if (!asset || asset.status === "trashed") return null;
  return asset;
}

/** The highest-`version` registered definition for `transformName`, or `null` when none is registered. */
async function resolveLatestTransformVersion(
  deps: ResolveSeoImageRefDeps,
  workspaceId: UUID,
  transformName: string
): Promise<TransformDefinitionRecord | null> {
  const versions = await deps.transformDefinitionRepo.listByName({ workspaceId, name: transformName });
  if (versions.length === 0) return null;
  return versions.reduce((a, b) => (b.version > a.version ? b : a));
}

/** The `/m/{assetId}/{transformName}.v{version}/image.{ext}` URL contract (ADR-027 §4). */
function buildSeoImageUrl(assetId: string, transformName: string, latest: TransformDefinitionRecord): string {
  const ext = EXT_BY_TRANSFORM_FORMAT[latest.params.format] ?? latest.params.format;
  return `/m/${assetId}/${transformName}.v${latest.version}/image.${ext}`;
}

/**
 * Resolves an `ogImage`/`twitterImage` field to a URL, or `undefined` on any
 * miss. Returns `ref` unchanged when it is already an absolute URL; otherwise
 * returns the site-relative `/m/{assetId}/...` URL contract (ADR-027 §4) —
 * NOT necessarily absolute (this function has no origin to join, by design;
 * `seo.ts`'s `resolveShareImages` is the one caller and absolutizes the
 * result via `toAbsoluteUrl`, since `og:image`/`twitter:image` must be
 * absolute for crawlers, same as `og:url`).
 *
 * Does not check whether a rendition row already exists (AMENDED 2026-09-05
 * — see this file's header doc for the safety argument): the emitted URL
 * always targets the latest registered transform version, which the public
 * `/m/` route always lazily generates on first anonymous fetch.
 *
 * @complexity O(1) — bounded repo lookups (one asset read, one transform-
 * version listing).
 */
export async function resolveSeoImageRef(
  deps: ResolveSeoImageRefDeps,
  input: ResolveSeoImageRefInput
): Promise<string | undefined> {
  const ref = input.ref?.trim();
  if (!ref) return undefined;
  if (isAbsoluteUrl(ref)) return ref;

  const parts = parseMediaRefParts(ref);
  if (!parts) return undefined;
  const { assetId, transformName } = parts;

  const asset = await resolveVisibleAsset(deps, input.workspaceId, assetId);
  if (!asset) return undefined;

  const latest = await resolveLatestTransformVersion(deps, input.workspaceId, transformName);
  if (!latest) return undefined;

  return buildSeoImageUrl(assetId, transformName, latest);
}
