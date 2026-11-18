import type { BeforeSaveHookPort, ForgetRemovedPostFn, PostRepoPort, RemovePostFn } from "#src/features/post/contracts";
import type { AssetBlobRepoPort, BlobStorePort, MediaContentTypeStorePort, VersionedMediaRepoPort } from "#src/features/media/index";
import type { MenuRepoPort, NavLocationBindingRepoPort } from "#src/features/navigation/index";
import type { RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import type { FormDefinitionRepoPort } from "@jini-ai/cms/forms";
import type { ContentTypeListPort, ContentTypeRepoPort, IndexProvisionerPort } from "#src/features/content-types/index";
import type {
  ContentLookupPort,
  ContentTypeTaxonomyPolicyPort,
  EntryTermRepoPort,
  ImportableTaxonomyRepoPort,
  ImportableTermRepoPort,
  TaxonomyListPort,
  TaxonomyRepoPort,
  TaxonomyRevisionRepoPort,
  TermListPort,
  TermRepoPort,
  UnassignableEntryTermRepoPort,
} from "#src/features/taxonomy/index";
import type { EntryTermReadPort, TaxonomyPublishReadPort, TermPublishReadPort } from "@jini-ai/cms/taxonomy";
import type { EntryListPort, EntryRepoPort } from "#src/features/entries/index";
import type { EntryRefsRepoPort } from "#src/contracts/core/entry-refs/ports";
import type { WidgetRegionBindingRepoPort } from "@jini-ai/cms/widgets";
import type { EntryPublishReadPort } from "@jini-ai/cms/entries";
import type { EntryListExcludingTypesPort } from "@jini-ai/cms/widgets/resolvers";
import type { FileBlobIndexPort } from "./file-blob-index.js";
import type { PrincipalRepoPort } from "@jini-ai/user-management";
import type { PresentationSettingsRepoPort } from "@jini-ai/cms/presentation";
import type { SettingsRepoPort } from "@jini-ai/core/settings";
import type { DiscoveredTheme } from "#src/features/theme/catalog";

/**
 * @file The port bag of THIS product's publishable types.
 *
 * The publish engine (`type-registry.ts`) is generic over the bag a host hands it: it never reads a
 * field of it, it only passes `deps.ports` on to the handler each registered type builds. This file
 * is the one place that names what this site's types need, so the engine's own files import nothing
 * from the post, media, navigation, taxonomy, entries, content-type or theme features.
 *
 * ## `PublishContentDeps.ports`: one typed bag, keyed by `entityType` (F2)
 *
 * Every registered type used to widen `PublishContentDeps` with its own flat, individually-optional
 * field (`mediaRepo`, `redirectsWriteDeps`, `menuRepo`, `navLocationBindingRepo`, …) — about a dozen
 * of them accumulated one type at a time, each threaded by hand through `routes/publish-content/
 * deps.ts`, `tool-registrations.ts`, both composition roots, and `publish-content-seed-hash.ts`.
 * `media` shipped with a real `apply()` for a while before it could actually travel, because every
 * one of those builders forgot three of the fields and nothing complained — the fields were
 * OPTIONAL, so a missing one silently degraded `pack`/`inspect`/`precheck` to "nothing to report"
 * (see each handler's own `if (!deps.mediaRepo) return;`-shaped guard) instead of failing anywhere.
 *
 * {@link TovuPublishPorts} replaces that with ONE interface, one line per registered type, so a
 * root that forgets a type's ports is a type error at exactly one place ({@link PublishContentDeps}
 * for `pack`/`inspect`/`precheck` callers, or `apply-loop.ts`'s `PublishContentApplyDeps` for the
 * apply path) instead of an N-file scavenger hunt. `ports` itself stays `Partial` here — a caller
 * that only ever exports/plans (never applies) still has no use for supplying every type's ports,
 * the same "absent behaves like it always did" contract the old per-type optional fields carried —
 * but each individual port's OWN shape is exhaustive for that type, so a root that does supply a
 * port can no longer misspell or half-supply one of its fields.
 */
export interface TovuPublishPorts {
  readonly post: {
    readonly repo: PostRepoPort;
    /** Apply-only — `apply()`'s rollback path (drops the Trash index row when the write it undoes
     *  was a trash). Never read by `pack`/`inspect`/`precheck`. */
    readonly forgetRemoved?: ForgetRemovedPostFn;
    /** Apply-only — `retire()`'s address-clash overwrite (`retirePostForReplacement`). */
    readonly remove?: RemovePostFn;
  };
  readonly media: {
    readonly repo: VersionedMediaRepoPort;
    readonly assetBlobRepo: AssetBlobRepoPort;
    readonly blobStore: BlobStorePort;
    /** Where an imported blob's sniffed type is recorded — what the embed resolver reads to render a
     *  video as `<video>` rather than an image. */
    readonly contentTypeStore: MediaContentTypeStorePort;
  };
  /** `features/redirects/publish-content.ts`'s one real dependency: the same write-chokepoint deps
   *  bag `createRedirect`/`updateRedirect` themselves take. */
  readonly redirect: RedirectsWriteDeps;
  readonly menu: {
    readonly repo: MenuRepoPort;
    readonly bindingRepo: NavLocationBindingRepoPort;
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
  // Factory-built types (`repo-handler.ts`) below — every root builds these through ONE function,
  // `server/runtime/composition/content-publish-ports.ts`'s `buildContentPublishPorts`, so a new line here is one edit there.
  readonly form: { readonly repo: FormDefinitionRepoPort };
  readonly "content-type": { readonly repo: ContentTypeRepoPort & ContentTypeListPort; readonly indexProvisioner: IndexProvisionerPort };
  readonly taxonomy: TaxonomyPublishPorts;
  readonly term: TaxonomyPublishPorts;
  readonly "collection-entry": EntryPublishPorts;
  readonly widget: WidgetPublishPorts;
  readonly "widget-area": WidgetPublishPorts;
  /** `set` needs `principals` in its deps; a workspace-scope write never reads it. */
  readonly "site-setting": { readonly settings: SettingsRepoPort; readonly principals: PrincipalRepoPort };
  /** `themes` is the root's live array (`rescanThemes` refills it in place after `theme-files` applies). */
  readonly "active-theme": { readonly presentation: PresentationSettingsRepoPort; readonly themes: readonly DiscoveredTheme[] };
  /**
   * Host hooks a handler may run. Not an entity type: the engine never reads this field, one
   * handler does (`features/post/publish-content.ts`'s apply). It lives in the host's bag, and not
   * on the engine's deps, because the hook's contract (`BeforeSaveHookPort`) belongs to the post
   * feature. Absent behaves exactly like `CreatePostDeps.beforeSaveHook` absent: no plugin `ext`
   * patch is applied and no plugin can refuse the write. See `post.ts`'s own docs.
   */
  readonly hooks?: { readonly beforeSave?: BeforeSaveHookPort };
}

/** `widget` and `widget-area` share one bag: the widgets write-service deps minus the gateway fields. */
export interface WidgetPublishPorts {
  readonly entries: EntryRepoPort & EntryListPort & EntryPublishReadPort;
  readonly contentTypes: ContentTypeRepoPort;
  readonly entryRefs: EntryRefsRepoPort;
  readonly bindings: WidgetRegionBindingRepoPort;
  /** A `contact-form` widget names its form by id; the form travels by slug (`widgets/publish-content.ts`). */
  readonly forms: FormDefinitionRepoPort;
}

/** `collection-entry`'s bag: the entry repo (trash-inclusive read), the owning-type lookup and the term bag. */
export interface EntryPublishPorts {
  readonly entries: EntryRepoPort & EntryListExcludingTypesPort & EntryPublishReadPort;
  readonly contentTypes: ContentTypeRepoPort;
  /** An entry's categories/tags (`termIds`) read and sync through the taxonomy bag. */
  readonly terms: TaxonomyPublishPorts;
}

/** `taxonomy` and `term` share one bag: the Jini taxonomy write-service deps, minus the gateway
 *  fields `PublishContentDeps` already carries. */
export interface TaxonomyPublishPorts {
  readonly taxonomies: TaxonomyRepoPort & TaxonomyListPort & ImportableTaxonomyRepoPort & TaxonomyPublishReadPort;
  readonly terms: TermRepoPort & TermListPort & ImportableTermRepoPort & TermPublishReadPort;
  /** Also read and unassigned: post/page/entry `termIds` sync through these (`taxonomy/publish-term-ids.ts`). */
  readonly entryTerms: EntryTermRepoPort & UnassignableEntryTermRepoPort & EntryTermReadPort;
  readonly revisions: TaxonomyRevisionRepoPort;
  readonly stampWatermark: () => Promise<void> | void;
  /** Resolves posts/pages and collection entries (Jini `createContentLookup`). */
  readonly contentLookup: ContentLookupPort;
  /** Which collection types take terms: every live one (`server/runtime/composition/content-publish-ports.ts`). */
  readonly contentTypeTaxonomyPolicy: ContentTypeTaxonomyPolicyPort;
}
