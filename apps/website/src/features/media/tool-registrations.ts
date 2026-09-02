/**
 * @file Media's agent-tool registrations — re-exported from `@jini-ai/cms/media`, plus this host's
 * OWN `publicUrl` resolution wired on top (2026-09-02).
 *
 * A shim rather than a rewrite of the one importer, deliberately.
 * `assistant/tool-registrations.ts` imports every not-yet-converted domain as a single uniform block
 * of `../<domain>/tool-registrations` lines. Pointing only media somewhere else would make the one
 * ported domain the odd line out, and would invite the next reader to "restore consistency" by
 * reaching past a barrel rather than through it. When more domains move, this file and its
 * siblings retire together.
 *
 * Converted to the tool-contribution registry 2026-08-17, on a RETRY: first tried in Stage 2 batch 2
 * and reverted the same session. At that time, a plain importer grep of this file itself found
 * nothing risky (only `assistant/tool-registrations.ts`), but `check:architecture`'s module graph is
 * per-directory: `src/widgets/resolver-service.ts` value-imports `CORE_PUBLIC_TRANSFORM_NAME` from
 * `../media/bootstrap` and `getLatestTransformDefinition` from `../media/index`, and `assistant`
 * still statically depended on `widgets` (`assistant/tool-registrations.ts`'s own `DOMAIN_SLICES`)
 * at the time — group B ran the `media` conversion attempt in its own isolated worktree, before
 * group A's separate, parallel `widgets` conversion had merged. Adding a `media -> assistant`
 * registry edge back then closed a real 3-module cycle: `assistant, media, widgets` (confirmed via
 * `check:architecture --list`: largest strongly-connected component, runtime-only, went 0 -> 3).
 *
 * Re-verified this session, after both batches had merged into `general-work`: `widgets` is now
 * converted too (`widgets/tool-registrations.ts`'s own `contributeWidgetsTools()`), which already
 * removed the `assistant -> widgets` static edge that closed the cycle above. `resolver-service.ts`'s
 * value-imports into `media/bootstrap`/`media/index` are unchanged and still exist, but with
 * `assistant` no longer reaching `widgets` statically, they no longer round-trip back to `assistant`.
 * `check:architecture` confirms 0 module cycles with this conversion in place — see this repo's own
 * commit history for the before/after run in the same worktree.
 *
 * ## `publicUrl` (2026-09-02)
 *
 * `@jini-ai/cms/media`'s `buildMediaRegistrations` gained an OPTIONAL, batch-shaped
 * `MediaToolDeps.resolvePublicUrls` hook (see that package's `media/tool-registrations.ts` header for
 * why it stayed generic there — the `/m/{assetId}/{transformName}.v{version}/...` URL contract is
 * ADR-027, a HOST decision, not a `@jini-ai/cms` one). This file is where that hook gets a REAL
 * implementation for Tovu specifically: {@link resolveMediaPublicUrls} builds the same
 * `/m/{assetId}/public.v{version}/image.{ext}` URL `features/seo/media.ts`'s own `buildSeoImageUrl`
 * already produces for `ogImage`/`twitterImage` (same contract, same "public" core transform), or
 * `/m/{assetId}/original` for a video asset (`routes/site/media-rendition.ts`'s
 * `registerMediaOriginalVideoRoute` — the byte-passthrough route that exists specifically because
 * video can't go through the image-transform pipeline).
 *
 * Image-vs-video is answered from `mediaContentTypeStore` (`content-type-store.ts`) — the SAME port
 * the admin Media screen's Images/Videos tabs already use, batch-shaped (`getMany`) so a
 * `media_list_assets` call with N assets costs one query, not N. Deliberately NOT the backfilling
 * variant `routes/admin/media/content-type.ts`'s `resolveContentTypes` uses (that function lives in
 * `server/inbound/admin-http/routes/media/`, a route-layer module this feature-layer file has no
 * business importing from — routes depend on features, never the reverse): an asset with no recorded
 * content type yet (pre-existing row from before this store existed, never opened once through the
 * admin Media screen since) is treated as "not confirmed video" and gets the image-transform URL,
 * same as every recognized image type. This is directionally correct for the overwhelming majority of
 * assets (every fresh upload records its type immediately — `routes/admin/media/upload.ts`,
 * `media-generation/tool-registrations.ts`'s own `media_generate_asset` handler does the same) and is
 * a disclosed, narrow scope adjustment, not a silent gap: a genuinely never-typed VIDEO asset would
 * get a `publicUrl` that 404s/500s at request time until an operator opens the Media screen once
 * (which backfills it for good).
 *
 * `resolvePublicUrls` is exported so `features/media-generation/tool-registrations.ts` can resolve
 * `media_generate_asset`'s own response through the exact same logic (a batch of one) instead of a
 * second, drifting implementation.
 */
import type { ToolContributor } from "#src/assistant/index";
import { buildMediaRegistrations, mediaDerivedRisk, type MediaRecord, type MediaToolDeps, type TransformDefinitionRepoPort } from "@jini-ai/cms/media";
import type { AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";
import type { ToolRegistration } from "@jini-ai/cms/core";
import { CORE_PUBLIC_TRANSFORM_NAME } from "./bootstrap.js";
import { getLatestTransformDefinition } from "./index.js";
import type { MediaContentTypeStorePort } from "./content-type-store.js";

export { buildMediaRegistrations, mediaDerivedRisk, type MediaToolDeps };

/** Cosmetic only (ADR-027 §4 — never participates in the rendition lookup itself) — duplicated from
 *  `features/seo/media.ts`'s identical local copy rather than shared, per this codebase's own
 *  "duplicate the tiny thing, don't reach across files for it" convention (see e.g.
 *  `custom-credentials/agent-tools.ts`'s header for the same reasoning applied elsewhere). */
const EXT_BY_TRANSFORM_FORMAT: Record<string, string> = { jpeg: "jpg", png: "png", webp: "webp", gif: "gif" };

/** The exact deps {@link resolveMediaPublicUrls} needs beyond `MediaToolDeps`'s own fields — both
 *  OPTIONAL so a test double (or a future host reusing `buildMediaRegistrationsForTovu` without
 *  wiring these) degrades to `publicUrl: null` for every asset rather than throwing; see that
 *  function's own doc. `RouteDeps` (this host's real composition-root deps bag) always supplies both
 *  in production — `mediaContentTypeStore`/`transformDefinitionRepo` are established `RouteDeps`
 *  fields (`server/routes/types.ts`), not new wiring this file introduces. */
export interface MediaPublicUrlDeps {
  mediaContentTypeStore?: Pick<MediaContentTypeStorePort, "getMany">;
  transformDefinitionRepo?: TransformDefinitionRepoPort;
}

/**
 * Batch-resolves each of `assets`' `/m/...` public URL — the real implementation behind
 * `MediaToolDeps.resolvePublicUrls` for this host. See this file's header for the full contract
 * (image vs. video, the no-backfill disclosed scope adjustment, why this lives here and not in a
 * route module).
 *
 * @returns a map from `MediaRecord.id` to its resolved URL, or `null` for a trashed asset, an asset
 * with no registered "public" core transform yet (boot has not run `ensureCoreMediaTransform`), or
 * any other unresolvable case — never a link a visitor would 404 on by construction, mirroring
 * `features/post/tool-registrations.ts`'s own `resolvePublicUrl` contract.
 * @complexity O(1) queries regardless of `assets.length`: one batched content-type lookup, one latest-
 * transform-version lookup (workspace-wide, not per-asset).
 */
export async function resolveMediaPublicUrls(
  deps: MediaPublicUrlDeps & { workspaceId: string },
  assets: readonly MediaRecord[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (!deps.mediaContentTypeStore || !deps.transformDefinitionRepo) {
    for (const asset of assets) result.set(asset.id, null);
    return result;
  }

  const active = assets.filter((asset) => asset.status !== "trashed");
  for (const asset of assets) {
    if (asset.status === "trashed") result.set(asset.id, null);
  }
  if (active.length === 0) return result;

  const sha256s = [...new Set(active.map((asset) => asset.source.sha256))];
  const contentTypes = await deps.mediaContentTypeStore.getMany({ workspaceId: deps.workspaceId, sha256s });

  const latest = await getLatestTransformDefinition({
    deps: { transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME },
  });

  for (const asset of active) {
    const contentType = contentTypes.get(asset.source.sha256);
    if (contentType?.startsWith("video/")) {
      result.set(asset.id, `/m/${asset.id}/original`);
      continue;
    }
    if (!latest) {
      // Boot never ran `ensureCoreMediaTransform` (or this is a test double with no transform
      // registered) — no "public" transform to point at yet.
      result.set(asset.id, null);
      continue;
    }
    const ext = EXT_BY_TRANSFORM_FORMAT[latest.params.format] ?? latest.params.format;
    result.set(asset.id, `/m/${asset.id}/${CORE_PUBLIC_TRANSFORM_NAME}.v${latest.version}/image.${ext}`);
  }
  return result;
}

/**
 * `buildMediaRegistrations` wired with this host's real `resolvePublicUrls` implementation
 * ({@link resolveMediaPublicUrls}) — this is what `contributeMediaTools` below registers, in place of
 * passing `buildMediaRegistrations` straight through.
 */
function buildMediaRegistrationsForTovu(
  routeDeps: MediaToolDeps & MediaPublicUrlDeps,
  _surfaces: AssistantSurfaceDeps
): ToolRegistration[] {
  return buildMediaRegistrations({ ...routeDeps, resolvePublicUrls: (assets) => resolveMediaPublicUrls(routeDeps, assets) });
}

/**
 * Contributes Media's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildMediaRegistrations`/
 * `mediaDerivedRisk` by name (only `MediaToolDeps` as an erased `import type`); this is the seam that
 * replaced it — see this file's own header above for why the earlier attempt closed a cycle and why
 * this retry does not.
 */
export function contributeMediaTools(): ToolContributor {
  return { domain: "media", build: buildMediaRegistrationsForTovu, risk: mediaDerivedRisk };
}
