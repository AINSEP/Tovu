import type { CmsPublishPorts } from "@jini-ai/cms/publish/content/publish-ports";
import type { ActiveThemePublishPorts, RemovePostFn } from "#src/platform/publish-contracts";
import type { FileBlobIndexPort } from "@jini-ai/cms/publish/transfer";

/**
 * @file The port bag of THIS product's publishable types: the CMS capability's bag
 * (`CmsPublishPorts`, which owns every slice whose port types come from `@jini-ai/cms`) plus the
 * slices that only this host can type.
 *
 * The publish engine (`type-registry.ts`) is generic over the bag a host hands it: it never reads a
 * field of it, it only passes `deps.ports` on to the handler each registered type builds. This file
 * is the one place that names what this site's types need, so the engine's own files import nothing
 * from the post, media, navigation, taxonomy, entries, content-type or theme features.
 *
 * ## `PublishContentDeps.ports`: one typed bag, keyed by `entityType` (F2)
 *
 * The keyed-bag contract, and why one bag replaced a dozen flat optional fields, lives with its
 * owner (`PublishPorts` in `@jini-ai/core/contracts/site/publish-ports`). {@link TovuPublishPorts}
 * is that bag for this site, one key per registered type, so a root that forgets a type's ports is a
 * type error at exactly one place ({@link PublishContentDeps} for `pack`/`inspect`/`precheck`
 * callers, or `apply-loop.ts`'s `PublishContentApplyDeps` for the apply path).
 *
 * `ports` itself stays `Partial` here — a caller that only ever exports/plans (never applies) still
 * has no use for supplying every type's ports, the same "absent behaves like it always did" contract
 * the old per-type optional fields carried — but each individual port's OWN shape is exhaustive for
 * that type, so a root that does supply a port can no longer misspell or half-supply one of its fields.
 *
 * Host-only slices: `post.remove` (the host's own trash primitive), `theme-files` and `active-theme`
 * (themes live in this product). Every other slice is a `@jini-ai/cms` type; the factory-built ones
 * are built through ONE function, `server/runtime/composition/content-publish-ports.ts`'s
 * `buildContentPublishPorts`, so a new key is one edit there.
 */
export type TovuPublishPorts = CmsPublishPorts & {
  readonly post: {
    /** Apply-only — `retire()`'s address-clash overwrite (`retirePostForReplacement`). */
    readonly remove?: RemovePostFn;
  };
  readonly "theme-files": {
    readonly themesDir: string;
    /** Apply-only — called right after `apply()` swaps a tree into {@link themesDir} (and again
     *  after a rollback swaps it back), so the running site's in-memory `DiscoveredTheme.pages`/
     *  `partials` re-render without a restart (2026-09-24, hosted production site). A composition root binds it
     *  to `rescanThemes` over its own `RouteDeps.themes` array. */
    readonly onReplaced?: () => void | Promise<void>;
    /** The process-wide `sha256 -> {absPath, size}` map a file-tree `pack()` fills as it walks a
     *  tree (`file-blob-index.ts`) — MUST be the same shared instance across every caller in one
     *  process (never rebuilt per request); see that module's own header. */
    readonly fileBlobIndex?: FileBlobIndexPort;
  };
  /** `themes` is the root's live array (`rescanThemes` refills it in place after `theme-files` applies). */
  readonly "active-theme": ActiveThemePublishPorts;
};
