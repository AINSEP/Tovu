import type { BeforeSaveHookPort, PostRepoPort } from "#src/features/post/post";
import type { AuthorizeFn, ChangeSetRepoPort, ClockPort, OutboxPort } from "@jini-ai/cms/core";

/**
 * @file Task 2 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §3.
 *
 * The publishable-type registry: the seam a resource-owning feature (`post`/`page` today; later —
 * per plan §3's own "adding a type later" closing line — `media`, `forms`, taxonomy `term`s, …)
 * contributes ITS OWN "how do I pack/inspect/precheck/apply myself" implementation into, so the
 * content-transport planner (Task 5+) can stay one generic pipeline over a growing set of resources
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
 * `listContentTransportContributors()` MUST be called fresh by the planner every run (Task 5+), never
 * captured once and reused — a type registered after that first read must still be picked up on the
 * very next run. The registry mechanics test file (`__tests__/type-registry.test.ts`) pins exactly
 * this property.
 *
 * ## Why `features/content-transport/` owns this file, not `assistant/`
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
 *    `registerContentTransportContributor` for every known type, called once during boot. A feature
 *    (e.g. `features/post`) returns DATA (`contributePostTransport(): ContentTransportContributor`)
 *    and imports only this module's TYPES; it never imports `registerContentTransportContributor`
 *    itself. That split is load-bearing, not style: `features/post -> assistant` VALUE edges have
 *    previously closed real module cycles and had to be removed by injecting the dependency instead
 *    (see `duplicate-resource-registry.ts`'s own header for that exact history) — a
 *    `features/post -> features/content-transport` value edge would reopen the identical risk.
 *    `__tests__/post-no-direct-registry-import.boundary.test.ts` enforces this for `features/post`
 *    specifically.
 * 2. `listContentTransportContributors()` is called AT PUBLISH TIME (inside the planner), never
 *    captured at module load — see the trap above.
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
 * ## `ContentTransportDeps` — deliberately narrow today, meant to grow
 *
 * Mirrors `assistant/tool-registrations.ts`'s own `AssistantToolRegistryDeps`: a wide deps bag
 * assembled from every registered type's OWN deps needs via type-only imports, so this registry
 * module itself never has to know what any particular resource needs to build its handler. Today
 * only `post`/`page` contribute (both backed by the same `PostRepoPort`), so the bag is exactly
 * their shape; the next type to land (media, forms, taxonomy `term`) widens this interface rather
 * than replacing it, the same incremental way `AssistantToolRegistryDeps` grew to ~30 domains' worth
 * of fields one contributor at a time.
 */
export interface ContentTransportDeps {
  /** Every content-transport operation is scoped to one workspace (plan §1.1's mount-path
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
   * reads these, so they stay OPTIONAL rather than widening every existing `ContentTransportDeps`
   * builder (`export.ts`/`import.ts`'s own `toContentTransportDeps`) into supplying values it has no
   * use for — the same "absent behaves like it always did" convention {@link outbox}/
   * {@link beforeSaveHook} already establish on this interface. Only a real
   * `ContentTransportApplyPort` (`features/content-transport/apply-loop.ts`) supplies them, because
   * only `apply()` (never `pack`/`inspect`/`precheck`) needs to route a write through the command
   * gateway (plan §1.4). A handler whose `apply()` is reached without these wired throws loudly
   * rather than silently skipping the gateway — see `features/post/content-transport.ts`'s own guard.
   */
  readonly changeSets?: ChangeSetRepoPort;
  readonly authorize?: AuthorizeFn;
}

/**
 * One packed entity — the export side's unit of work, and the import side's unit of comparison.
 * Produced by {@link ContentTransportHandler.pack}, compared against a stored baseline by the
 * planner (Task 5), and handed back to {@link ContentTransportHandler.apply} unchanged when an
 * import proceeds.
 */
export interface PackedEntity {
  /** Must equal the owning {@link ContentTransportHandler.entityType} — carried on the entity
   *  itself (not just implied by which handler produced it) so a bundle's `entities[]` array is
   *  self-describing once serialized, with no positional/grouping convention to preserve. */
  readonly entityType: string;
  readonly id: string;
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
  /** The entity's own field bag, in the exact shape {@link ContentTransportHandler.apply} expects
   *  to receive back. Never `contentHash`'s CANONICALIZED form — that is a derived comparison key,
   *  not a wire shape a handler should have to reverse. */
  readonly state: Record<string, unknown>;
}

/**
 * One content type's contract for participating in Publish Content — plan §3's own interface,
 * carried here verbatim. See plan §4 task table for which of `pack`/`inspect`/`precheck`/`apply`
 * each later task actually exercises; Task 2 (this file plus `contributePostTransport`/
 * `contributePageTransport`) only has to satisfy this shape correctly, not wire it into a real HTTP
 * pipeline — that is Task 4 (export), Task 5 (planner), and Task 7/8 (apply loop through the gated
 * mutation gateway).
 */
export interface ContentTransportHandler {
  /** Stable wire discriminator. Appears in bundles and in baselines; never renamed — a rename would
   *  silently orphan every baseline row keyed on the old string, turning every future sync for that
   *  type into a false `created` (no matching baseline) rather than the update it should be. */
  readonly entityType: string;
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
  apply(input: { entity: PackedEntity; expectedVersion: number | undefined; principalId: string }): Promise<{ changeSetId: string }>;
}

/**
 * One resource's registry entry: which content type it answers to, its declared `dependsOn`
 * ordering, and how to build its real, deps-bound {@link ContentTransportHandler} once the
 * composition root's real {@link ContentTransportDeps} bag exists.
 *
 * `build` is deferred (not a bound handler) for the identical reason `ToolContributor.build` and
 * `DuplicateResourceHandlerContributor.build` are: registration (this registry) happens once at
 * boot, before any real deps bag exists; something later (Task 4's export route, Task 5's planner)
 * resolves every registered contributor into a real handler by calling `build(deps)` against the
 * deps it actually has for that request.
 *
 * `dependsOn` is carried on the CONTRIBUTOR (not only on the built {@link ContentTransportHandler})
 * so the planner can compute apply order (rule 4 above) without having to `build()` every
 * contributor first just to read a static ordering fact.
 */
export interface ContentTransportContributor {
  readonly entityType: string;
  readonly dependsOn: readonly string[];
  readonly build: (deps: ContentTransportDeps) => ContentTransportHandler;
}

let contributors: ContentTransportContributor[] = [];

/**
 * Registers one content type's contribution, called once by a composition root during the ordinary
 * boot sequence (see this file's header, rule 1).
 *
 * Re-registering the same `entityType` REPLACES the earlier entry rather than appending — identical
 * reasoning to `registerToolContributor`/`registerDuplicateResourceHandler`: idempotent per registry
 * instance, safe for a test process that legitimately re-registers. Registration order is otherwise
 * preserved so a replacement does not silently reorder the registry.
 */
export function registerContentTransportContributor(contributor: ContentTransportContributor): void {
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
export function listContentTransportContributors(): readonly ContentTransportContributor[] {
  return contributors;
}

/** Test-only reset of the module-level registry (mirrors `resetToolContributorsForTests`/
 *  `resetDuplicateResourceHandlersForTests`). A test that builds a registry from a clean slate must
 *  call this before registering just the contributors it wants present — otherwise contributors
 *  registered by an earlier test in the same process persist, since this is ordinary module-level
 *  state. */
export function resetContentTransportContributorsForTests(): void {
  contributors = [];
}
