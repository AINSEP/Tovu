/**
 * @file One shared composer for the deps bag every widgets write-path function needs
 * (`Jini/packages/cms/src/widgets/write-service.ts`/`Jini/packages/cms/src/widgets/embed-service.ts`/`Jini/packages/cms/src/widgets/region-area-service.ts`).
 *
 * Replaces what used to be ~11 independently hand-built copies of this same object: 9 admin HTTP
 * routes under `server/routes/admin/widgets/` plus two separately-written, identically-named
 * `widgetsDeps()` helpers (`tool-registrations.ts`'s AI-tool surface and this same directory's own
 * `agent-tools.ts` AI-gateway surface) — see `ADS-memory/.local-artifacts/agent-reports/
 * 20260803-jini-outbox-contract.md` and `20260803-widget-delete-outbox-bug.md` for why that mattered:
 * every one of those ~11 call sites independently forgot to bridge the raw infra `outbox` port into
 * the narrower one `createEntry`/`updateEntry` declare locally (`features/entries/write-service.ts`'s
 * own header documents that bridge, `toEntryOutbox`), so every widget create/update/trash/purge threw
 * `NOT NULL constraint failed: outbox_events.id` against the real SQLite outbox — invisible against
 * the in-memory test double, which silently accepts any shape. `entries`/`content-types`/`taxonomy`
 * each compose their own deps bag in exactly ONE place; widgets never had for its own reason. This
 * file is that one place. One composer means a future fix (or a future new dependency this bag
 * needs) lands once, not on however many call sites happen to exist that day.
 *
 * Deliberately does NOT wrap `outbox` — it stays the raw, full-`DomainEvent` port here, exactly as
 * received from the route/tool layer. Bridging happens inside each domain function, at its own
 * chokepoint call (`toEntryOutbox` for `createEntry`/`updateEntry`, `toContentTypeOutbox` for
 * `registerContentType` via `Jini/packages/cms/src/widgets/entry-payload.ts`'s content-type seeding) — a single widgets function
 * can reach more than one chokepoint needing a DIFFERENT bridge (`createWidgetInstance` calls
 * `createEntry` directly AND, via `ensureWidgetContentTypesRegistered`, `registerContentType`), so
 * pre-wrapping here would either pick the wrong bridge for one of them or require this composer to
 * know about call sites it has no business knowing about.
 *
 * Declared structurally (matching the discipline `tool-registrations.ts` already established for its
 * now-retired local `WidgetsToolDeps`) rather than importing `server/routes/types`'s `RouteDeps` —
 * keeps this module free of a back-edge into the composition root. `RouteDeps` already carries every
 * field this shape needs, so every existing caller passes its own deps object straight through
 * unchanged.
 */
import type { Clock } from "@jini-ai/core/primitives";
import type { EntryRefsRepoPort } from "../../contracts/core/entry-refs/ports.js";
import type { AuthorizeFn, ChangeSetRepoPort, OutboxPort } from "@jini-ai/cms/core";
import { ContentTypeAlreadyExistsError, NoopContentTypeIndexProvisioner, registerContentType, toContentTypeOutbox, type ContentTypeRepoPort } from "@jini-ai/cms/content-types";
import { createEntry, importEntry, updateEntry, toEntryOutbox, VersionConflictError, type EntryListPort, type EntryRepoPort } from "@jini-ai/cms/entries";
import { isTrashed, updatePost, restorePostForward, findPublishedPostById, findPublishedPostBySlug, PostVersionConflictError, PostNotFoundError, type PostRecord, type BeforeSaveHookPort, type ForgetRemovedPostFn, type PostRepoPort } from "../post/index.js";
import { findMediaByIdOrSlug, getLatestTransformDefinition } from "@jini-ai/cms/media";
import { CORE_PUBLIC_TRANSFORM_NAME } from "../media/bootstrap.js";
import { extractEntryRefs } from "../../contracts/core/entry-refs/extractor.js";
import { toSlug } from "../../platform/html/slug.js";
import type { WidgetHostPorts } from "@jini-ai/cms/widgets";
import type { RemoveWidgetFn, WidgetRegionBindingRepoPort } from "@jini-ai/cms/widgets";

/** The exact slice of a route/tool layer's own deps bag this domain's write-path needs. */
export interface WidgetsRouteDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  /** Keep the kernel clock intact so every composed write-path dependency retains `nowMs`. */
  clock: Clock;
  idGen: { newId(): string };
  outbox: OutboxPort;
  entryRepo: EntryRepoPort & EntryListPort;
  contentTypeRepo: ContentTypeRepoPort;
  entryRefsRepo: EntryRefsRepoPort;
  widgetBindingRepo: WidgetRegionBindingRepoPort;
  /** REQ-44 — a post/page embed host writes through the same chokepoint the live editor uses. */
  postRepo: PostRepoPort;
  /** Required by `restorePostForward`, which `Jini/packages/cms/src/widgets/embed-service.ts`'s `rollback` calls — see
   *  {@link import("@jini-ai/cms/widgets").EmbedServiceDeps.forgetRemovedPost}. */
  forgetRemovedPost: ForgetRemovedPostFn;
  changeSets: ChangeSetRepoPort;
  pluginBeforeSaveHook: BeforeSaveHookPort;
  /** Moves a widget to the Trash — `bindRemoveEntity(trash, "widget")` at composition. */
  removeWidget: RemoveWidgetFn;
}

/**
 * Binds A6's host operations to their existing owners. Post writes capture the full host repo;
 * the Jini read view must never be spread into a replacement for its prototype methods.
 * Without a captured repo (read-only render/entry fixtures), the supplied repo is still the same
 * full host instance. The assertions below widen only its TypeScript view, never its runtime data.
 * @complexity O(1) construction; callbacks retain the owning operation's cost and error contract.
 */
export function buildWidgetHostPorts(required: { postRepo?: PostRepoPort }, _optional: Record<string, never> = {}): WidgetHostPorts {
  return {
    entries: {
      createEntry, updateEntry, importEntry, toEntryOutbox,
      isVersionConflict: (error) => error instanceof VersionConflictError,
    },
    contentTypes: {
      registerContentType, toContentTypeOutbox,
      createIndexProvisioner: () => new NoopContentTypeIndexProvisioner(),
      alreadyExists: (error) => error instanceof ContentTypeAlreadyExistsError ? { tombstoned: error.tombstoned } : null,
    },
    posts: {
      isTrashed,
      isVersionConflict: (error): error is PostVersionConflictError => error instanceof PostVersionConflictError,
      isNotFound: (error) => error instanceof PostNotFoundError,
      updatePost: ({ deps, input }, optional = {}) => updatePost({
        deps: { ...deps, repo: required.postRepo ?? deps.repo as PostRepoPort }, input,
      }, optional),
      restorePostForward: ({ deps, input }, optional = {}) => restorePostForward({
        deps: { ...deps, repo: required.postRepo ?? deps.repo as PostRepoPort },
        input: { ...input, prior: input.prior as PostRecord },
      }, optional),
      findPublishedPostById: ({ deps, input }, optional = {}) => findPublishedPostById({
        deps: { repo: required.postRepo ?? deps.repo as PostRepoPort }, input,
      }, optional),
      findPublishedPostBySlug: ({ deps, input }, optional = {}) => findPublishedPostBySlug({
        deps: { repo: required.postRepo ?? deps.repo as PostRepoPort }, input,
      }, optional),
    },
    media: { findMediaByIdOrSlug, getLatestTransformDefinition, publicTransformName: CORE_PUBLIC_TRANSFORM_NAME },
    entryRefs: { extract: extractEntryRefs },
    slugify: toSlug,
  };
}

/** Shared dependency bag for `Jini/packages/cms/src/widgets/write-service.ts`/`Jini/packages/cms/src/widgets/embed-service.ts` calls — every one of them takes this identical shape. */
export function buildWidgetsDeps(routeDeps: WidgetsRouteDeps, _optional: Record<string, never> = {}) {
  const deps = {
    entryRepo: routeDeps.entryRepo,
    contentTypeRepo: routeDeps.contentTypeRepo,
    entryRefsRepo: routeDeps.entryRefsRepo,
    postRepo: routeDeps.postRepo,
    forgetRemovedPost: routeDeps.forgetRemovedPost,
    changeSets: routeDeps.changeSets,
    beforeSaveHook: routeDeps.pluginBeforeSaveHook,
    clock: routeDeps.clock,
    ids: routeDeps.idGen,
    authorize: routeDeps.authorize,
    outbox: routeDeps.outbox,
    remove: routeDeps.removeWidget,
  };
  // Preserve the established enumerable deps shape (deps.unit.test.ts) while passing A6's new
  // host seam directly. The host is wiring, not a route/tool payload or a repository snapshot.
  return Object.defineProperty(deps, "host", { value: buildWidgetHostPorts({ postRepo: routeDeps.postRepo }, {}) }) as typeof deps & { host: WidgetHostPorts };
}

/** `Jini/packages/cms/src/widgets/region-area-service.ts` calls additionally need `bindingRepo` — same base shape, one extra field. */
export function buildWidgetsRegionDeps(routeDeps: WidgetsRouteDeps, _optional: Record<string, never> = {}) {
  const base = buildWidgetsDeps(routeDeps, {});
  const deps = { ...base, bindingRepo: routeDeps.widgetBindingRepo };
  return Object.defineProperty(deps, "host", { value: base.host }) as typeof deps;
}
