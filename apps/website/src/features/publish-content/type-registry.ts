import type { BeforeSaveHookPort, ForgetRemovedPostFn, PostRepoPort, RemovePostFn } from "#src/features/post/post";
import type { AssetBlobRepoPort, BlobStorePort, VersionedMediaRepoPort } from "#src/features/media/index";
import type { MenuRepoPort, NavLocationBindingRepoPort } from "#src/features/navigation/index";
import type { RedirectsWriteDeps } from "#src/features/redirects/redirects";
import type { FileBlobIndexPort } from "./file-blob-index.js";
import type { AuthorizeFn, ChangeSetRepoPort, ClockPort, OutboxPort } from "@jini-ai/cms/core";

/**
 * @file Task 2 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §3.
 *
 * The publishable-type registry: the seam a resource-owning feature (`post`/`page` today; later —
 * per plan §3's own "adding a type later" closing line — `media`, `forms`, taxonomy `term`s, …)
 * contributes ITS OWN "how do I pack/inspect/precheck/apply myself" implementation into, so the
 * publish-content planner (Task 5+) can stay one generic pipeline over a growing set of resources
 * instead of one bespoke branch per resource.
 *
 * ## The trap this file exists to avoid (plan §3, stated precisely)
 *
 * This codebase has TWO registry shapes, and only one of them is safe here:
 *  - Append-only + read-once-at-startup: `ToolRegistry`, routing's `phaseRegistry`. A filter or
 *    consumer that reads the list once, at module load or at boot, never sees anything registered
 *    afterward — `append_only_module_registries` (project memory) records two real bugs from exactly
 *    this shape.
 *  - Register-by-key, replace-on-duplicate, listed FRESH at every consumption:
 *    `assistant/tool-contribution-registry.ts` and `assistant/duplicate-resource-registry.ts`. This
 *    file is modeled directly on the latter (nearly verbatim) — same module-level ordered array,
 *    same `register*`/`list*`/`reset*ForTests` trio, same "last registration wins, replacing by key
 *    rather than appending" semantics for accidental double-registration.
 *
 * `buildPublishContentCatalog()` MUST read the registry fresh every run (Task 5+), never capture a
 * prior catalog — a type registered after that first read must still be picked up on the next run.
 * The registry mechanics test file (`__tests__/type-registry.test.ts`) pins this property.
 *
 * ## Why `features/publish-content/` owns this file, not `assistant/`
 *
 * Unlike `tool-contribution-registry.ts` (AI-tool surface, naturally owned by `assistant/`), this
 * registry has nothing to do with the assistant's tool catalog — it exists purely for the Publish
 * Content HTTP feature. It gets its own feature directory rather than living inside `features/post/`
 * or any other single resource's directory, for the same reason `duplicate-resource-registry.ts`
 * lives in a shared location rather than inside whichever resource happened to need it first: it is
 * a cross-resource seam, not one resource's private concern.
 *
 * ## Registration discipline (plan §3's five rules)
 *
 * 1. Registration happens at a COMPOSITION ROOT only — a `install*` function that calls
 *    `registerPublishContentContributor` for every known type, called once during boot. A feature
 *    (e.g. `features/post`) returns DATA (`contributePostPublish(): PublishContentContributor`)
 *    and imports only this module's TYPES; it never imports `registerPublishContentContributor`
 *    itself. That split is load-bearing, not style: `features/post -> assistant` VALUE edges have
 *    previously closed real module cycles and had to be removed by injecting the dependency instead
 *    (see `duplicate-resource-registry.ts`'s own header for that exact history) — a
 *    `features/post -> features/publish-content` value edge would reopen the identical risk.
 *    `__tests__/post-no-direct-registry-import.boundary.test.ts` enforces this for `features/post`
 *    specifically.
 * 2. `buildPublishContentCatalog()` reads contributors AT PUBLISH TIME, never at module load — see
 *    the trap above.
 * 3. Never "register on import". Nothing in this file, or in any feature's own
 *    `contribute<Type>Transport()` function, runs merely because that feature's module was imported.
 *    Every registration is an explicit call made by a composition root.
 * 4. Apply order is derived from each handler's own `dependsOn` at publish time (a topological sort
 *    — Task 5+'s job), never hardcoded into the planner. Adding "media before post" is then a
 *    property of the media contributor's own `dependsOn`, not an edit to shared planning code.
 * 5. A type absent from the registry is absent from the bundle and from the report — silence is
 *    never "nothing changed" (Task 4's export route is built as an ALLOWLIST of registered types for
 *    exactly this reason: plan §5 risk #8).
 *
 * ## `PublishContentDeps` — deliberately narrow today, meant to grow
 *
 * Mirrors `assistant/tool-registrations.ts`'s own `AssistantToolRegistryDeps`: a wide deps bag
 * assembled from every registered type's OWN deps needs via type-only imports, so this registry
 * module itself never has to know what any particular resource needs to build its handler. Today
 * only `post`/`page` contribute (both backed by the same `PostRepoPort`), so the bag is exactly
 * their shape; the next type to land (media, forms, taxonomy `term`) widens this interface rather
 * than replacing it, the same incremental way `AssistantToolRegistryDeps` grew to ~30 domains' worth
 * of fields one contributor at a time.
 */
export interface PublishContentDeps {
  /** Every publish-content operation is scoped to one workspace (plan §1.1's mount-path
   *  convention: `/api/admin/v1/workspaces/:workspaceId/...`) — carried here rather than threaded
   *  as a per-call parameter, the same choice `PostToolDeps`/`RouteDeps` already make for every
   *  other workspace-scoped deps bag in this codebase. */
  readonly workspaceId: string;
  readonly postRepo: PostRepoPort;
  readonly clock: ClockPort;
  readonly idGen: { newId(): string };
  /** Optional — absent behaves exactly like `CreatePostDeps.outbox`/`beforeSaveHook` absent: no
   *  status-transition event fires, no plugin `ext` patch is applied. See `post.ts`'s own docs. */
  readonly outbox?: OutboxPort;
  readonly beforeSaveHook?: BeforeSaveHookPort;
  /**
   * Task 8 (plan §4 task 8) — added when `apply()` finally got a real implementation. Every
   * `pack`/`inspect`/`precheck` caller (Task 4's export route, Task 5/7's planner/gated-hooks) never
   * reads these, so they stay OPTIONAL rather than widening every existing `PublishContentDeps`
   * builder (`routes/publish-content/deps.ts`'s shared `toPublishContentDeps`) into supplying values
   * it has no use for — the same "absent behaves like it always did" convention {@link outbox}/
   * {@link beforeSaveHook} already establish on this interface. Only a real
   * `PublishContentApplyPort` (`features/publish-content/apply-loop.ts`) supplies them, because
   * only `apply()` (never `pack`/`inspect`/`precheck`) needs to route a write through the command
   * gateway (plan §1.4). A handler whose `apply()` is reached without these wired throws loudly
   * rather than silently skipping the gateway — see `features/post/publish-content.ts`'s own guard.
   */
  readonly changeSets?: ChangeSetRepoPort;
  readonly authorize?: AuthorizeFn;
  /**
   * Task 12 (plan §4 task 12) — `media`'s own ports, widening this bag for the first non-`post`/
   * `page` contributor (this interface's own header, "`PublishContentDeps` — deliberately narrow
   * today, meant to grow", anticipates exactly this). All three arrive together (one type's real
   * deps, not three independently-optional knobs) and stay OPTIONAL for the identical reason
   * {@link outbox}/{@link beforeSaveHook}/{@link changeSets} already are: a `PublishContentDeps`
   * builder that has no use for media stays unchanged, and `features/media/publish-content.ts`'s
   * `pack`/`inspect`/`precheck` degrade to "nothing to report" rather than throwing when absent
   * (see that file's own doc).
   *
   * **That silent degradation is exactly why optional is dangerous for the apply path, and why the
   * callers that matter no longer get a choice.** Media was a registered type with a real `apply()`
   * for a while before it could actually travel, because every builder omitted these three and
   * nothing complained. Both the route bag
   * (`routes/publish-content/deps.ts`'s `toPublishContentDeps`) and the apply bag
   * (`apply-loop.ts`'s `toPublishContentApplyDeps`) now require them, so the omission is a compile
   * error at the composition roots while this interface stays permissive for focused callers.
   */
  /**
   * The post domain's Trash-index forget, needed only by `apply()`'s rollback path — the same
   * OPTIONAL-here/required-at-the-builders posture {@link changeSets}/{@link authorize} carry, and
   * for the same reason: `pack`/`inspect`/`precheck` never compensate anything. `apply()` guards on
   * it explicitly (`features/post/publish-content.ts`) rather than degrading silently.
   */
  readonly forgetRemovedPost?: ForgetRemovedPostFn;
  /**
   * S4 (`publish-overwrite-live-plan-2026-09-24.md` §4/§5) — the post domain's own Trash primitive,
   * needed only by `retire()`'s address-clash overwrite (`features/post/publish-content.ts`), which
   * wraps `retirePostForReplacement` (`post.ts`) the same way {@link forgetRemovedPost} is needed
   * only by `apply()`'s rollback. Optional here for the identical "absent behaves like it always
   * did" reason every other apply-only port on this interface already is; required at the apply
   * bag (`apply-loop.ts`'s `PublishContentApplyDeps`), not here.
   */
  readonly removePost?: RemovePostFn;
  readonly mediaRepo?: VersionedMediaRepoPort;
  readonly assetBlobRepo?: AssetBlobRepoPort;
  readonly blobStore?: BlobStorePort;
  /**
   * S2 (`redirect` publish type) — `features/redirects/publish-content.ts`'s one real dependency:
   * the same write chokepoint deps bag `createRedirect`/`updateRedirect` themselves take. Optional
   * for the identical reason {@link mediaRepo}/{@link assetBlobRepo}/{@link blobStore} already are —
   * `features/redirects/publish-content.ts`'s `pack`/`inspect`/`precheck` degrade to "nothing to
   * report" when absent (see that file's own doc), and only `apply()` requires it wired (enforced at
   * the apply bag, `apply-loop.ts`'s `PublishContentApplyDeps`, not here).
   */
  readonly redirectsWriteDeps?: RedirectsWriteDeps;
  /**
   * S3 (`menu` publish type) — `features/navigation/publish-content.ts`'s two real dependencies:
   * the same `MenuRepoPort`/`NavLocationBindingRepoPort` pair every real menu route already reads
   * off `RouteDeps` (`server/routes/types.ts:1175-1177`). Optional for the identical reason
   * {@link redirectsWriteDeps}/{@link mediaRepo} already are — `pack`/`inspect`/`precheck` degrade
   * to "nothing to report" when either is absent (see that file's own doc), and only `apply()`
   * requires both wired (enforced at the apply bag, `apply-loop.ts`'s `PublishContentApplyDeps`, not
   * here). Unlike `redirectsWriteDeps`, both composition roots also thread these through the ROUTE
   * and TOOL deps bags unconditionally (not just the apply bag) — `RouteDeps.menuRepo`/
   * `.navLocationBindingRepo` are already non-optional upstream, so `pack`/`inspect`/`precheck`
   * never actually see them absent outside a focused unit test.
   */
  readonly menuRepo?: MenuRepoPort;
  readonly navLocationBindingRepo?: NavLocationBindingRepoPort;
  /**
   * S-F3 (`publish-files-plan-2026-09-24.md` §6) — `features/theme/publish-content.ts`'s one real
   * filesystem dependency: the site's own themes root (`RouteDeps.themesDir`, already resolved once
   * per composition root by `siteThemesDir()`). Optional for the identical reason every other
   * type-specific port on this interface already is — `pack`/`inspect`/`precheck` degrade to "nothing
   * to report" when absent (see this interface's header), and only a caller with real file-tree work
   * needs it wired at all.
   */
  readonly themesDir?: string;
  /**
   * Called by `theme-files`' `apply()` right after it swaps a tree into {@link themesDir} (and again
   * after a rollback swaps it back). The running site renders pages from `DiscoveredTheme.pages`/
   * `partials`, which are read into memory at discovery and never re-read from disk — so without
   * this a published theme's `/theme-assets/*` files change while every rendered page keeps the old
   * header/footer until the process restarts (2026-09-24 tovu.fly.dev). A composition root binds it
   * to `rescanThemes` over its own `RouteDeps.themes` array.
   */
  readonly onThemeTreeReplaced?: () => void | Promise<void>;
  /**
   * S-F3 — the process-wide `sha256 -> {absPath, size}` map a file-tree `pack()` fills as it walks a
   * tree (`features/publish-content/file-blob-index.ts`), read by
   * `composite-blob-source.ts`'s `createCompositePeerBlobSource` so a peer can fetch those bytes
   * without them ever being copied into the media blob store. Optional for the same reason
   * {@link themesDir} is: a caller with no file-tree type in play has nothing to fill or read here.
   * Unlike most optional ports on this interface, this one MUST be the same shared instance across
   * every caller in one process (never rebuilt per request) — see that module's own header.
   */
  readonly fileBlobIndex?: FileBlobIndexPort;
}

/**
 * One packed entity — the export side's unit of work, and the import side's unit of comparison.
 * Produced by {@link PublishContentHandler.pack}, compared against a stored baseline by the
 * planner (Task 5), and handed back to {@link PublishContentHandler.apply} unchanged when an
 * import proceeds.
 */
export interface PackedEntity {
  /** Must equal the owning {@link PublishContentHandler.entityType} — carried on the entity
   *  itself (not just implied by which handler produced it) so a bundle's `entities[]` array is
   *  self-describing once serialized, with no positional/grouping convention to preserve. */
  readonly entityType: string;
  readonly id: string;
  /** Version of this entity type's serialized `state` shape. This is independent of
   *  {@link hashVersion}: changing canonicalization does not necessarily change the wire DTO, and
   *  changing the DTO does not necessarily change hashing. Importers accept only the exact version
   *  declared by the registered handler unless an explicit migration is added. */
  readonly schemaVersion: number;
  readonly contentHash: string;
  /** Which `canonicalize`/`contentHash` generation produced {@link contentHash} — see
   *  `content-hash.ts`'s own header for why a mismatch must refuse the whole run rather than being
   *  treated as an ordinary conflict. */
  readonly hashVersion: number;
  /** Blob sha256s this entity needs present on the destination before it can be applied (e.g. an
   *  embedded image). Always `[]` for a handler that has not yet been taught to detect its own
   *  blob references — an empty list is a disclosed "this type has no blob dependency yet", never
   *  silently wrong, since a handler that DOES depend on a blob must list it or the destination can
   *  apply the entity before the blob exists. */
  readonly requiredBlobs: readonly string[];
  /** The entity's own field bag, in the exact shape {@link PublishContentHandler.apply} expects
   *  to receive back. Never `contentHash`'s CANONICALIZED form — that is a derived comparison key,
   *  not a wire shape a handler should have to reverse. */
  readonly state: Record<string, unknown>;
}

/**
 * The live row a slug-clash overwrite would retire, named so the confirm dialog can say what it is
 * about to move to Trash — `publish-overwrite-live-plan-2026-09-24.md` §4. Produced by
 * {@link PublishContentHandler.planRetire} (read-only) and threaded back into
 * {@link PublishContentHandler.retire} unchanged, and into the planner's own `retires` row field
 * (`planner.ts`) so `planHash` binds the exact holder and hash a re-plan must still match at apply
 * time (§5 S5's re-verification).
 *
 * Defined here rather than in `planner.ts`: this interface (`PublishContentHandler`) is the type
 * that actually names it on `planRetire`/`retire`, and `planner.ts` already imports its other types
 * from this module — a `RetireTarget` re-exported from `planner.ts` instead would invert that.
 */
export interface RetireTarget {
  readonly entityType: string;
  readonly entityId: string;
  readonly entityLabel: string | null;
  readonly hash: string;
}

/**
 * `publish-repoint-menus-plan-2026-09-24.md` §2.1 — a live entity that links to another entity by
 * id, e.g. a menu item whose `entryRef.entryId` targets a page. Produced by
 * {@link PublishContentHandler.referencesTo}, read by the planner's post-pass (`planner.ts`) and
 * attached to the referenced row's {@link RetireTarget}-bearing outcome row as `referencedBy`, so an
 * operator sees what still points at a holder before choosing to overwrite it.
 */
export interface ReferenceHolder {
  readonly entityType: string;
  readonly entityId: string;
  readonly entityLabel: string | null;
  /** The id this holder links to — matches a {@link RetireTarget.entityId} the planner asked about. */
  readonly referencedId: string;
}

/**
 * §2.1 — one entity replaced during an apply run: the retired holder's id and the id the incoming
 * entity landed under. Collected by the apply loop (S5, `apply-loop.ts`) from rows whose retire
 * both landed, and handed to {@link PublishContentHandler.repointReferences} so a live reference can
 * be rewritten from the old id to the new one.
 */
export interface EntityReplacement {
  readonly entityType: string;
  readonly oldId: string;
  readonly newId: string;
}

/**
 * §2.1 — the result of one handler's {@link PublishContentHandler.repointReferences} call.
 */
export interface RepointResult {
  readonly changeSetIds: readonly string[];
  readonly linksUpdated: number;
  /** Operator-facing lines, one per holder not updated (an authorization refusal, a concurrent edit,
   *  or any other reason a specific holder was skipped) — a repoint failure is always reported here,
   *  never silent and never thrown back to fail the surrounding run (§2.3). */
  readonly notUpdated: readonly string[];
}

/**
 * One content type's contract for participating in Publish Content — plan §3's own interface,
 * carried here verbatim. See plan §4 task table for which of `pack`/`inspect`/`precheck`/`apply`
 * each later task actually exercises; Task 2 (this file plus `contributePostPublish`/
 * `contributePagePublish`) only has to satisfy this shape correctly, not wire it into a real HTTP
 * pipeline — that is Task 4 (export), Task 5 (planner), and Task 7/8 (apply loop through the gated
 * mutation gateway).
 */
export interface PublishContentHandler {
  /** Stable wire discriminator. Appears in bundles and in baselines; never renamed — a rename would
   *  silently orphan every baseline row keyed on the old string, turning every future sync for that
   *  type into a false `created` (no matching baseline) rather than the update it should be. */
  readonly entityType: string;
  /** Exact serialized-state version this handler packs and applies. */
  readonly schemaVersion: number;
  /** The resource's OWN existing write permission (e.g. `"content.write"` for post/page), never a
   *  flat transport-wide permission — this is what makes "a principal allowed posts but not media
   *  must be refused media by construction" true, the identical reasoning
   *  `DuplicateResourceHandler.permission` already establishes for `content_duplicate`. */
  readonly permission: string;
  /** Types that must be applied BEFORE this one, by `entityType` (e.g. `post` depending on
   *  `["media", "term"]`) — the planner topologically sorts on this at publish time (rule 4 above),
   *  so adding a new type's ordering constraint never touches the planner itself. */
  readonly dependsOn: readonly string[];

  /** Export side: every transportable entity of this type, already canonicalized + hashed. An
   *  async generator (not an eagerly-built array) so a large collection can be streamed rather than
   *  held in memory whole — Task 4's export route streams its response body from this directly. */
  pack(): AsyncIterable<PackedEntity>;
  /** Import side: what the destination currently holds for `id`, or `null` when there is no such
   *  row — the planner's `created` vs `unchanged`/`applied`/`conflict` classification (plan §4's
   *  "seven outcomes" table) starts here. */
  inspect(id: string): Promise<{ version: number; hash: string } | null>;
  /** Import side: a PURE precondition check that never writes — slug availability, a
   *  format/shape violation, a required blob's absence. Returns a human-readable blocking reason, or
   *  `null` when there is no blocking condition. Must never be skipped in favor of "just try the
   *  write and catch the constraint violation" — plan §5 risk #4 is specifically that a caught
   *  constraint violation kills the whole surrounding chunk transaction (Task 8), not just the one
   *  offending entity. */
  precheck(entity: PackedEntity): Promise<string | null>;
  /** Import side: applies ONE entity through the real domain write function, inside the caller's own
   *  `executeCommand` (plan §1.4) — never through the raw repo. Receives `expectedVersion` (`undefined`
   *  for a brand-new entity with no destination row yet) and MUST fail rather than overwrite when the
   *  destination has moved on from it; this is what Task 8's per-write optimistic-concurrency guard
   *  (plan §5 risk #3) depends on. */
  apply(input: {
    entity: PackedEntity;
    expectedVersion: number | undefined;
    principalId: string;
    /** Stable for this source principal + exact entity schema/hash version; safe to reuse on retry. */
    idempotencyKey: string;
  }): Promise<{ changeSetId: string }>;

  /**
   * S4 (`publish-overwrite-live-plan-2026-09-24.md` §4/§5) — read-only, like {@link precheck}: reports
   * the live row a slug-clash overwrite would retire, or `null` when this entity has no such holder
   * (its own id already exists at the destination, the slug is free, or the slug cannot be moved —
   * e.g. the home page). Never writes. Only meaningful for a `blocked` `precheck()` result; the
   * planner (`planner.ts`) is what decides when to call it.
   */
  planRetire?(entity: PackedEntity): Promise<RetireTarget | null>;
  /**
   * S4 — the write side of an address-clash overwrite: moves `target` to Trash under a renamed slug
   * (never in place) so the incoming entity can take the address under its own id, through the same
   * `executeCommand` gateway {@link apply} uses. `undo()` is the compensating rollback for the SAME
   * failure window {@link CommandMutation.rollback} exists for (a change-set insert failing after this
   * write already landed) — the apply loop (`apply-loop.ts`, S5) also calls it directly when the
   * CREATE that follows a retire fails, so the retire is never left stranded without its holder.
   */
  retire?(input: {
    target: RetireTarget;
    principalId: string;
    idempotencyKey: string;
  }): Promise<{ changeSetId: string; undo(): Promise<void> }>;

  /**
   * `publish-repoint-menus-plan-2026-09-24.md` §2.1/§2.2 — read-only, like {@link planRetire}: every
   * live entity of THIS type that links to any of `ids` by id (e.g. a menu whose nested `entryRef`
   * targets one of them). Called by the planner (`planner.ts`) at most ONCE per handler per plan,
   * with every retire-target id collected across the whole report — never once per row. A handler
   * with no concept of "links to another entity by id" simply omits this method.
   */
  referencesTo?(ids: readonly string[]): Promise<readonly ReferenceHolder[]>;
  /**
   * §2.3 — the write side: for each of `replacements`, repoints every live link `oldId -> newId` in
   * entities of this type, skipping any holder named in `skipIds` (written this run, so its own
   * incoming content already stands — repointing it would fight the source's own intent). Called by
   * the apply loop (`apply-loop.ts`, S5) once, AFTER every row has already landed — never inside a
   * row's own `apply()`/`retire()`. A repoint failure must never fail the surrounding run (the
   * content already landed); it is reported via {@link RepointResult.notUpdated} instead.
   */
  repointReferences?(input: {
    replacements: readonly EntityReplacement[];
    skipIds: ReadonlySet<string>;
    principalId: string;
    runId: string;
  }): Promise<RepointResult>;

  /**
   * S-F4 (`publish-files-plan-2026-09-24.md` §4) — the hash `id` had when this destination was first
   * seeded, or `null` when it was not part of the seed. The planner (`planner.ts`) and the apply
   * loop's re-verification (`apply-loop.ts`) consult it only when there is no recorded baseline AND
   * `PlanImportDeps.getSeedHash` did not answer — a destination still equal to its seed was never
   * edited there, so the first publish may replace it instead of sitting in `conflict`. For a type
   * whose seed is not a DB row (e.g. `theme-files`, seeded as `__original-themes__` folders), which
   * the generic seed-db lookup cannot see. Read-only; absent means "no seed to compare against".
   */
  seedHash?(id: string): Promise<string | null>;

  /**
   * `publish-files-plan-2026-09-24.md` §2/§6 — export side, read-only: every WHOLE unit this handler
   * found on disk but could not pack (a `file-tree-policy.ts` refusal — an extension the tree's kind
   * does not allow, a planted secret, an oversize cap), so an operator can see WHY it is missing from
   * the publish table instead of it silently not appearing at all (this feature's own real bug: a
   * theme with a video file, or one with a stray `.DS_Store` before that was fixed to be ignored
   * instead of denied, vanished from the table with no explanation). `pack()`'s own `AsyncIterable`
   * has no channel for this (see `features/theme/publish-content.ts`'s header) — this is the separate
   * seam a caller building an export envelope (`export-bundle.ts`) reads instead. A handler backed by
   * nothing that can be whole-unit-refused (most content types) simply omits this method.
   */
  listSkipped?(): Promise<readonly SkippedPackEntity[]>;
}

/**
 * One whole unit a {@link PublishContentHandler.listSkipped} found but refused to pack — the shape an
 * export envelope surfaces to an operator as a non-selectable, reason-carrying row, matching
 * `planner.ts`'s `PublishContentOutcomeRow` (`outcome: "blocked"`) closely enough that
 * `planner.ts`/`report-labels.ts` can turn one into the other with no lossy mapping.
 */
export interface SkippedPackEntity {
  readonly entityType: string;
  readonly id: string;
  /** What a human calls this unit, or `null` when it has nothing more readable than `id` — same
   *  fallback contract as `planner.ts`'s `entityDisplayLabel`. */
  readonly label: string | null;
  /** Human-readable reason, already prefixed with the unit's own title (matching every other
   *  `SkippedThemeTree.reason` this feature already produces) — never re-derived or re-worded by a
   *  caller. */
  readonly reason: string;
}

/**
 * One resource's registry entry: which content type it answers to, its declared `dependsOn`
 * ordering, and how to build its real, deps-bound {@link PublishContentHandler} once the
 * composition root's real {@link PublishContentDeps} bag exists.
 *
 * `build` is deferred (not a bound handler) for the identical reason `ToolContributor.build` and
 * `DuplicateResourceHandlerContributor.build` are: registration (this registry) happens once at
 * boot, before any real deps bag exists; something later (Task 4's export route, Task 5's planner)
 * resolves every registered contributor into a real handler by calling `build(deps)` against the
 * deps it actually has for that request.
 *
 * `dependsOn` is carried on the CONTRIBUTOR (not only on the built {@link PublishContentHandler})
 * so the planner can compute apply order (rule 4 above) without having to `build()` every
 * contributor first just to read a static ordering fact.
 */
export interface PublishContentContributor {
  readonly entityType: string;
  readonly dependsOn: readonly string[];
  readonly build: (deps: PublishContentDeps) => PublishContentHandler;
}

/** A programmer-authored registry configuration that cannot produce a safe apply order. */
export class PublishContentCatalogConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishContentCatalogConfigurationError";
  }
}

export interface PublishContentCatalog {
  readonly handlers: readonly PublishContentHandler[];
  readonly handlerByType: ReadonlyMap<string, PublishContentHandler>;
  readonly applyOrder: readonly string[];
}

/**
 * Builds the per-operation handler catalog from the registry's current snapshot.
 *
 * Ordering declarations are configuration, not best-effort hints. A dependency on an
 * unregistered type or a dependency cycle makes every possible fallback order unsafe, so this
 * rejects before any handler is built or any publish-content read/write begins.
 */
export function buildPublishContentCatalog(deps: PublishContentDeps): PublishContentCatalog {
  const snapshot = [...contributors];
  const originalOrder = snapshot.map((contributor) => contributor.entityType);
  const known = new Set(originalOrder);
  const inDegree = new Map<string, number>(originalOrder.map((entityType) => [entityType, 0]));
  const dependents = new Map<string, string[]>();

  for (const contributor of snapshot) {
    for (const dependency of new Set(contributor.dependsOn)) {
      if (!known.has(dependency)) {
        throw new PublishContentCatalogConfigurationError(
          `publish-content type '${contributor.entityType}' depends on unregistered type '${dependency}'`
        );
      }
      inDegree.set(contributor.entityType, (inDegree.get(contributor.entityType) ?? 0) + 1);
      const waiting = dependents.get(dependency) ?? [];
      waiting.push(contributor.entityType);
      dependents.set(dependency, waiting);
    }
  }

  const applyOrder: string[] = [];
  const remaining = new Set(originalOrder);
  while (remaining.size > 0) {
    const next = originalOrder.find(
      (entityType) => remaining.has(entityType) && (inDegree.get(entityType) ?? 0) === 0
    );
    if (!next) {
      const cycleMembers = originalOrder.filter((entityType) => remaining.has(entityType));
      throw new PublishContentCatalogConfigurationError(
        `publish-content dependency cycle among registered types: ${cycleMembers.join(", ")}`
      );
    }
    applyOrder.push(next);
    remaining.delete(next);
    for (const dependent of dependents.get(next) ?? []) {
      inDegree.set(dependent, (inDegree.get(dependent) ?? 0) - 1);
    }
  }

  const handlers = snapshot.map((contributor) => contributor.build(deps));
  return {
    handlers,
    handlerByType: new Map(handlers.map((handler) => [handler.entityType, handler] as const)),
    applyOrder,
  };
}

let contributors: PublishContentContributor[] = [];

/**
 * Registers one content type's contribution, called once by a composition root during the ordinary
 * boot sequence (see this file's header, rule 1).
 *
 * Re-registering the same `entityType` REPLACES the earlier entry rather than appending — identical
 * reasoning to `registerToolContributor`/`registerDuplicateResourceHandler`: idempotent per registry
 * instance, safe for a test process that legitimately re-registers. Registration order is otherwise
 * preserved so a replacement does not silently reorder the registry.
 */
export function registerPublishContentContributor(contributor: PublishContentContributor): void {
  const existing = contributors.findIndex((candidate) => candidate.entityType === contributor.entityType);
  if (existing >= 0) {
    contributors[existing] = contributor;
    return;
  }
  contributors.push(contributor);
}

/**
 * Every content-type contributor registered so far, in registration order. Reads the CURRENT module
 * state on every call (this file's header, rule 2 / the trap this whole file exists to avoid) —
 * never memoized, never snapshotted at import time.
 */
export function listPublishContentContributors(): readonly PublishContentContributor[] {
  return contributors;
}

/** Test-only reset of the module-level registry (mirrors `resetToolContributorsForTests`/
 *  `resetDuplicateResourceHandlersForTests`). A test that builds a registry from a clean slate must
 *  call this before registering just the contributors it wants present — otherwise contributors
 *  registered by an earlier test in the same process persist, since this is ordinary module-level
 *  state. */
export function resetPublishContentContributorsForTests(): void {
  contributors = [];
}
