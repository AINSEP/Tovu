import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
import { executeCommand } from "@jini-ai/cms/core";

import { contentHash } from "#src/features/publish-content/content-hash";
import { collectBodyReferences } from "#src/features/publish-content/content-references";
import { PublishContentApplyRowError } from "#src/features/publish-content/apply-errors";
import { addressHeldByOther, trashedAtDestination } from "#src/features/publish-content/precheck-reasons";
import { createRepoPublishHandler, gatewayDeps } from "#src/features/publish-content/repo-handler";
import type {
  PublishContentContributor,
  PublishContentDeps,
  PublishContentPorts,
  PackedEntity,
  RetireTarget,
  TaxonomyPublishPorts,
} from "#src/features/publish-content/type-registry";
import { prepareTermSync, readTermIds, TERM_SYNC_PERMISSION, withTermIds } from "#src/features/taxonomy/publish-term-ids";

import { importPostEntity, isTrashed, restorePostForward, retirePostForReplacement, PostConflictError, PostNotFoundError, ROOT_SLUG } from "./post.js";
import type { PostKind, PostRecord } from "./post.js";

/**
 * @file `post`'s and `page`'s publish-content contributions, built on `createRepoPublishHandler`
 * (`features/publish-content/repo-handler.ts`; M-POST of
 * `ADS-memory/.local-artifacts/plan-publish-all-types-2026-09-25.md`). One table, one config,
 * distinguished only by `PostKind`.
 *
 * Both contributors return DATA and import only `type-registry.ts`'s TYPES, never
 * `registerPublishContentContributor` — the composition root
 * (`server/runtime/composition/publish-content-manifest.ts`) registers them. See `type-registry.ts`'s
 * header for the module cycle a value edge would reopen, and
 * `__tests__/post-no-direct-registry-import.boundary.test.ts` for the check.
 *
 * ## The write
 *
 * `importPostEntity` (never the raw repo) inside `executeCommand` (`undo`), so an import is auditable
 * and revertible like an admin edit. Authorship (Task 15): `command.actor` is always the IMPORTING
 * operator (`executeCommand` authorizes that principal; a remote peer's author id is not a principal
 * here), while the SOURCE author travels on `record.createdByPrincipalId`, applied only on create
 * (`toImportableRecord`). `CommandActor.kind` has no `"api_key"`, so it is `"user"` like every admin route.
 *
 * ## Terms (plan §3.7, schemaVersion 2)
 *
 * `termIds` rides on the row NON-enumerably ({@link withTerms}): packed and hashed, left out when the
 * row has none (so an untagged row keeps its schemaVersion-1 hash), and never spread into a change
 * set's inverse or a restored row. The write syncs the assignments after the post lands; the gateway
 * rollback unassigns them first.
 *
 * ## Precheck
 *
 * Every refusal (empty slug, slug held, trashed destination, kind change) is enforced again inside
 * `importPostEntity`; precheck exists so an operator sees it in the plan. A body-format change (`doc`
 * vs `html`) is NOT refused (D2, 2026-09-24): it is an ordinary hashed change.
 */

/**
 * `post`'s and `page`'s declared prerequisite types. A page's body embeds media exactly like a post's;
 * `term` because the state carries `termIds`, and assigning one checks the term exists at write time.
 */
const POST_AND_PAGE_DEPENDS_ON: readonly string[] = ["media", "term"];

/**
 * Every `PostRecord` field, classified by what this transport DOES with it. This map is the single
 * place that decision is recorded, and `Record<keyof PostRecord, ...>` is what makes it a decision
 * rather than an omission: adding a field to `PostRecord` fails this file's typecheck until someone
 * classifies the new field here.
 *
 * ## The defect this exists to prevent
 *
 * This file used to hash `{...post}` — the WHOLE record — while `apply()` wrote back a hand-listed
 * subset of six or so fields. Everything in the gap (`bodyFormat`/`bodyHtml`, `seoExtJson`, `ext`,
 * `deletedAt`, `memberAccessJson`, and `templateChoice`/`overridesThemePage` on the create path) was
 * hashed but never applied, so publishing silently dropped or replaced it and still reported
 * success. `memberAccessJson` made that a SECURITY defect and not only a fidelity one: a
 * members-only post published to production as a publicly readable row.
 *
 * **"hashed but not applied" is the defect.** The reverse combination is safe: a field that is
 * applied but not hashed simply never triggers a publish on its own. So `"transferred"` is the only
 * disposition that participates in the content hash, and `"local"` fields are excluded from BOTH
 * sides — they are per-destination facts that a source instance has no standing to overwrite.
 *
 * @see `content-hash.ts`'s `EXCLUDED_KEYS`, which independently drops `id`/`workspaceId`/`version`/
 * `updatedAt`/`createdAt`/`createdByPrincipalId`. This map agrees with it by classifying those same
 * fields `"local"`; the two are belt and braces, not one relying on the other.
 */
const POST_FIELD_DISPOSITIONS: Record<keyof PostRecord, "transferred" | "provenance" | "local"> = {
  // Content — packed, hashed, and written verbatim by `importPostEntity` (`post.ts`).
  title: "transferred",
  slug: "transferred",
  bodyJson: "transferred",
  status: "transferred",
  kind: "transferred",
  bodyFormat: "transferred",
  bodyHtml: "transferred",
  seoExtJson: "transferred",
  templateChoice: "transferred",
  overridesThemePage: "transferred",
  memberAccessJson: "transferred",

  // Authorship PROVENANCE (Task 15) — packed and applied, but NOT hashed. The source is the
  // authority on who wrote a post and when, so an import copies both rather than re-stamping every
  // row with the importing operator's id; they are write-once, so only a row that does not exist at
  // the destination yet takes them. Excluded from the hash by `content-hash.ts`'s own
  // `EXCLUDED_KEYS` (which is why they can safely ride along in `state`): two instances that merely
  // disagree on a row's author or creation time must not read as a content edit.
  createdByPrincipalId: "provenance",
  createdAt: "provenance",

  // Identity and per-database write bookkeeping. Two instances holding the same logical content
  // legitimately disagree on all of these — this feature's founding premise, see
  // `content-hash.ts`'s header.
  id: "local",
  workspaceId: "local",
  version: "local",
  updatedAt: "local",

  // Plugin-namespaced extension data (SPEC-005 CIC U-004), written only by the local
  // `content.entry.beforeSave` hook chain. Neither packed nor hashed: a plugin's namespace is a
  // fact about the instance the plugin is INSTALLED on, and a destination running a different
  // plugin set would otherwise repack to a different hash forever and report the row as eternally
  // "changed". The destination's own `ext` survives an import untouched (`toImportableRecord` hands
  // `importPostEntity` the destination's existing bag, and its `beforeSaveHook` merge runs on top),
  // so this exclusion loses nothing that belongs to this instance.
  ext: "local",

  // Trash. Never packed and never hashed: `pack()` skips trashed rows outright rather than shipping
  // them, and `precheck` refuses a trashed DESTINATION row, so publishing can neither export trash
  // nor resurrect it. OPEN PRODUCT QUESTION (2026-09-19): whether a locally-deleted post should
  // instead delete on production. This is the safe reading — it never resurrects trash as live
  // content and never deletes production content — until that is answered.
  deletedAt: "local",
};

/** The keys {@link toPublishableState} puts on the wire: `"transferred"` plus `"provenance"`.
 *  Derived from {@link POST_FIELD_DISPOSITIONS} rather than re-listed, so the two cannot drift. */
const PACKED_POST_FIELDS = Object.freeze(
  (Object.keys(POST_FIELD_DISPOSITIONS) as Array<keyof PostRecord>).filter(
    (field) => POST_FIELD_DISPOSITIONS[field] !== "local"
  )
);

/** The wire shape of a packed `post`/`page`: exactly {@link PACKED_POST_FIELDS}, nothing else.
 *  Named so `pack`, `inspect` and `apply` read one contract instead of three hand-listed field sets
 *  that can drift apart. */
export type PublishablePostState = Pick<PostRecord, (typeof PACKED_POST_FIELDS)[number]>;

/**
 * Projects a `PostRecord` onto {@link PublishablePostState} — the ONE row projection behind the
 * packed state and the content hash (plus the row's `termIds`).
 *
 * Undefined optional fields are normalized to `null` so a row whose optional column was never set
 * and one whose column holds SQL `NULL` hash identically across two instances whose adapters
 * represent that difference differently. (`content-hash.ts`'s `normalize` collapses the same two
 * cases, but doing it here makes the WIRE shape unambiguous too, not just the hash input.)
 *
 * Exported so a test can assert against THE state builder rather than re-deriving the field list
 * on its own — a duplicated recipe in a test is the same drift this DTO exists to close, and it
 * is how four suites came to hash `{...post}` while production hashed something else.
 *
 * @complexity O(1) — a fixed field count, no iteration over anything caller-controlled.
 */
export function toPublishableState(post: PostRecord): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const field of PACKED_POST_FIELDS) {
    state[field] = post[field] ?? null;
  }
  return state;
}

/**
 * Rebuilds the full `PostRecord` `importPostEntity` replicates, from a packed state plus whatever
 * the destination already holds.
 *
 * `"local"` fields are filled from the DESTINATION's own row (or a documented default when there is
 * none) and never from the wire; `"provenance"` fields come from the wire only for a row that does
 * not exist here yet, matching their write-once contract.
 *
 * @complexity O(1).
 */
function toImportableRecord(
  required: { state: Record<string, unknown>; workspaceId: string; id: string; existing: PostRecord | null }
): PostRecord {
  const { state, workspaceId, id, existing } = required;
  const packed = state as Partial<PostRecord>;
  const wire: Record<string, unknown> = {};
  for (const field of PACKED_POST_FIELDS) {
    wire[field] = packed[field] ?? null;
  }
  return {
    ...(wire as unknown as PublishablePostState),
    id,
    workspaceId,
    // Recomputed by `importPostEntity` itself; present only because `PostRecord` requires them, and
    // never read off the wire.
    version: existing?.version ?? 0,
    updatedAt: existing?.updatedAt ?? "",
    // A packed entity is never trashed (`pack` skips trashed rows) and a trashed destination row is
    // refused before this point, so the only correct value here is "live".
    deletedAt: null,
    ...(existing?.ext !== undefined ? { ext: existing.ext } : {}),
    createdByPrincipalId: existing ? existing.createdByPrincipalId : ((wire.createdByPrincipalId as string | null) ?? null),
    createdAt: existing ? existing.createdAt : ((wire.createdAt as string | null) ?? null),
  };
}

/** A row as this transport sees it: see this file's header for `termIds`. */
type PostRow = PostRecord & { readonly termIds?: readonly string[] };

/** The post port plus the taxonomy ports `termIds` needs. */
type PostPorts = PublishContentPorts["post"] & { readonly term?: TaxonomyPublishPorts };

/** Attaches the row's sorted `termIds`, non-enumerable (this file's header), to a copy of `row`. */
async function withTerms(termPorts: TaxonomyPublishPorts | undefined, row: PostRecord): Promise<PostRow> {
  const termIds = await readTermIds(termPorts, row.kind, row.id);
  return termIds ? Object.defineProperty({ ...row }, "termIds", { value: termIds, enumerable: false }) : row;
}

/** The packed state of `row` (what `pack` ships and hashes), for `planRetire`/`retire`'s hashes. */
async function packedStateOf(termPorts: TaxonomyPublishPorts | undefined, row: PostRecord): Promise<Record<string, unknown>> {
  return withTermIds(toPublishableState(row), await readTermIds(termPorts, row.kind, row.id));
}

/** The apply-time ports, or the error that names what is missing. */
function applyPorts(ports: PostPorts, deps: PublishContentDeps, kind: PostKind) {
  const { forgetRemoved } = ports;
  if (!forgetRemoved) {
    throw new Error(
      `publish-content: ${kind}.apply() requires PublishContentDeps.changeSets/authorize/` +
        "outbox and ports.post.repo/forgetRemoved — wire them from the real apply-loop composition " +
        "root (features/publish-content/apply-loop.ts)."
    );
  }
  return { repo: ports.repo, clock: deps.clock, outbox: gatewayDeps(deps, kind).outbox, forgetRemoved };
}

/** Why an entity of type `kind` is refused when its packed `kind` differs, or `null`. `kind` is
 *  transferred, so without this a `page` entity could create a post: a publishing grant limited to
 *  `page` authorizes through the `page` handler and would never see the post it wrote. */
function packedKindMismatch(kind: PostKind, id: string, state: Record<string, unknown>): string | null {
  return state.kind === kind ? null : `${kind} entity '${id}' is packed as a '${String(state.kind)}' — a ${kind} publish writes only ${kind}s`;
}

function contributePostKind(kind: PostKind): PublishContentContributor {
  return createRepoPublishHandler<PostRow, PostPorts>({
    entityType: kind, // PostKind's two values are exactly this feature's two entityTypes
    schemaVersion: 2,
    // The same permission `content_post_create`/`content_post_update` declare.
    permission: "content.write",
    // Carried `termIds` sync through the taxonomy chokepoint.
    alsoAuthorizes: [TERM_SYNC_PERMISSION],
    dependsOn: POST_AND_PAGE_DEPENDS_ON,
    ports: (deps) => deps.ports.post && { ...deps.ports.post, term: deps.ports.term },
    portsKey: "post",
    list: async (p, workspaceId) => {
      const rows = (await p.repo.list({ workspaceId })).filter((row) => row.kind === kind && !isTrashed(row));
      return Promise.all(rows.map((row) => withTerms(p.term, row)));
    },
    find: async (p, workspaceId, id) => {
      const row = await p.repo.findById({ workspaceId, id });
      return row && row.kind === kind ? withTerms(p.term, row) : null;
    },
    isTrashed,
    fields: { ...POST_FIELD_DISPOSITIONS, termIds: "transferred" },
    omitWhenAbsent: ["termIds"],
    references: (entity) => collectBodyReferences(entity.state),
    // Not the factory's `address`: a slug held by a trashed row keeps this sentence, and the slug
    // checks run before the kind check on an unfiltered read, as before the migration.
    validate: async ({ ports, workspaceId, entity }) => {
      const wrongKind = packedKindMismatch(kind, entity.id, entity.state);
      if (wrongKind) return wrongKind;
      const slug = entity.state.slug;
      if (typeof slug !== "string" || slug.length === 0) return `${kind} entity '${entity.id}' has no usable slug to check for a collision`;
      const holder = await ports.repo.findBySlug({ workspaceId, slug });
      if (holder && holder.id !== entity.id) return addressHeldByOther(kind, "slug", slug, holder.id);
      const existing = await ports.repo.findById({ workspaceId, id: entity.id });
      if (existing && isTrashed(existing)) return trashedAtDestination(kind, entity.id);
      if (existing && existing.kind !== kind) {
        return `'${entity.id}' is a '${existing.kind}' at this destination but a '${kind}' at the source — kind is fixed at creation and cannot be changed by publishing`;
      }
      return null;
    },
    write: async ({ ports, deps, workspaceId, id, state, existing, expectedVersion, principalId, onRollback }) => {
      const wrongKind = packedKindMismatch(kind, id, state);
      if (wrongKind) throw new PublishContentApplyRowError("blocked", wrongKind);
      const { repo, outbox } = applyPorts(ports, deps, kind);
      const terms = await prepareTermSync({ ports: ports.term, deps, entityType: kind, entityId: id, principalId, contentType: kind, wanted: state.termIds });
      // Terms first on rollback: Jini resolves the post to (un)assign, and a create's undo deletes it.
      onRollback(terms.revert);
      const imported = await importPostEntity({
        deps: { repo, clock: deps.clock, outbox, beforeSaveHook: deps.beforeSaveHook },
        // The revision ledger's actor is the IMPORTING operator; the source author is on the record.
        input: { workspaceId, record: toImportableRecord({ state, workspaceId, id, existing }), expectedVersion, actorId: principalId },
      });
      await terms.apply();
      return { version: imported.post.version };
    },
    undo: {
      // Forward, not verbatim: see `restorePostForward`'s doc.
      restore: async ({ ports, deps, principalId }, prior) => {
        await restorePostForward({ deps: applyPorts(ports, deps, kind), input: { prior, actorId: principalId } });
      },
      // A create has no pre-image, so the row must never have existed: `hardDelete` removes it with
      // the revision it appended and the slug it reserved (trashing it would leave a "restorable"
      // row and keep the slug reserved against the retry).
      remove: async ({ ports, workspaceId, id }) => {
        if (await ports.repo.findById({ workspaceId, id })) await ports.repo.hardDelete({ workspaceId, id });
      },
    },
    errors: { conflict: [PostConflictError, PostNotFoundError] },
    extend: ({ deps }) => ({
      ...postRetireMethods(deps, kind),
      // `retire()`'s own conflicts reach the apply loop raw. `PostVersionConflictError` extends
      // `PostConflictError`.
      isApplyConflict: (error): error is Error => error instanceof PostConflictError || error instanceof PostNotFoundError,
    }),
  });
}

/** S4 (`publish-overwrite-live-plan-2026-09-24.md`): retire the live row a slug-clash overwrite replaces. */
function postRetireMethods(deps: PublishContentDeps, kind: PostKind) {
  const entityType = kind;
  const postRepo = deps.ports.post?.repo;
  const stateOf = (row: PostRecord) => packedStateOf(deps.ports.term, row);

  /**
   * S4's read half (`publish-overwrite-live-plan-2026-09-24.md` §4/§5) — reports the live row a
   * slug-clash overwrite would retire, or `null` when there is none. Never writes.
   *
   * The three conditions under which there is nothing to retire, matching precheck's own
   * slug-taken branch it is meant to answer for:
   * - the slug is free, or already held by `entity` itself — nothing to overwrite;
   * - `entity.id` already exists at this destination — a same-id collision needs a different remedy
   *   (a kind change, S11) than retiring some unrelated row;
   * - the slug is {@link ROOT_SLUG} — the home page has no other address to move to
   *   ({@link retirePostForReplacement}'s own refusal, mirrored here so the box is never even offered).
   *
   * @complexity O(1) — two indexed repo reads, same as precheck.
   */
  async function planRetire(entity: PackedEntity): Promise<RetireTarget | null> {
    if (!postRepo) return null;
    const slug = entity.state.slug;
    if (typeof slug !== "string" || slug.length === 0 || slug === ROOT_SLUG) return null;

    const holder = await postRepo.findBySlug({ workspaceId: deps.workspaceId, slug });
    if (!holder || holder.id === entity.id) return null;

    const existingHere = await postRepo.findById({ workspaceId: deps.workspaceId, id: entity.id });
    if (existingHere) return null;

    return {
      entityType: holder.kind,
      entityId: holder.id,
      entityLabel: holder.title,
      hash: contentHash(holder.kind, await stateOf(holder)),
    };
  }

  /**
   * S4's write half — retires `target` (moves it to Trash under a renamed slug, never in place)
   * through the same `executeCommand` gateway `apply()` uses, wrapping
   * {@link retirePostForReplacement} exactly the way `routes/pages/delete.ts:46-92` wraps
   * `deletePost`: `operation: "delete"`, inverse is the holder's own prior `deletedAt` — `null` for a
   * live holder, its trash time for one that was already trashed. A revert must put the row back
   * exactly where it was, not always un-trash it: `retirePostForReplacement` only renames an
   * already-trashed holder (its own doc), so a literal `{deletedAt: null}` inverse would un-trash a
   * row the human had trashed before this run ever touched it.
   *
   * `captureInverse` reads `target`'s CURRENT row and closes over it as `holder`; `execute` reuses
   * that same read as `retirePostForReplacement`'s required `expectedVersion`, rather than a second,
   * later read, because `executeCommand` guarantees `captureInverse` resolves before `execute` runs
   * (`core/commands/command.ts`'s own "Order matters: idempotency check -> inverse capture ->
   * execute -> record"). The apply loop (S5) is what re-verifies `target.hash` against a FRESH
   * `planRetire()` immediately before calling this — a holder that changed between plan and apply is
   * caught there, not here.
   *
   * `undo()` restores `holder` forward through {@link restorePostForward} — the same primitive
   * the apply rollback uses — and is also what the gateway's `mutation.rollback` calls on a
   * change-set-record failure, so every path that can need to "put this retire back" restores
   * identically.
   *
   * @complexity O(1) plus `executeCommand`'s own cost, same as `apply()`.
   */
  async function retire(input: {
    target: RetireTarget;
    principalId: string;
    idempotencyKey: string;
  }): Promise<{ changeSetId: string; undo(): Promise<void> }> {
    const { changeSets, authorize, outbox } = deps;
    const forgetRemovedPost = deps.ports.post?.forgetRemoved;
    const removePost = deps.ports.post?.remove;
    if (!changeSets || !authorize || !outbox || !postRepo || !forgetRemovedPost || !removePost) {
      throw new Error(
        `publish-content: ${entityType}.retire() requires PublishContentDeps.changeSets/authorize/` +
          "outbox and ports.post.repo/forgetRemoved/remove — wire them from the real apply-loop " +
          "composition root (features/publish-content/apply-loop.ts)."
      );
    }
    const gatewayDeps = { clock: deps.clock, idGen: deps.idGen, changeSets, outbox, authorize };
    const actor = { id: input.principalId, kind: "user" as const };
    const { target } = input;

    let holder: PostRecord | null = null;

    const undoRetire = async () => {
      if (!holder) return;
      await restorePostForward({
        deps: { repo: postRepo, clock: deps.clock, outbox, forgetRemoved: forgetRemovedPost },
        input: { prior: holder, actorId: input.principalId },
      });
    };

    const { changeSetId } = await executeCommand({
      deps: gatewayDeps,
      command: {
        workspaceId: deps.workspaceId,
        actor,
        summary: `Retire ${target.entityType} '${target.entityId}' for publish overwrite`,
        permission: "content.write",
        idempotencyKey: input.idempotencyKey,
      },
      mutation: {
        entityType: target.entityType,
        entityId: target.entityId,
        operation: "delete",
        captureInverse: async () => {
          holder = await postRepo.findById({ workspaceId: deps.workspaceId, id: target.entityId });
          if (!holder) {
            throw new PostNotFoundError(`${target.entityType} '${target.entityId}' was not found`);
          }
          // The apply loop's own re-check runs before this read, outside any lock; checking the
          // hash again here, on the row whose version `execute` pins, closes that gap.
          if (contentHash(holder.kind, await stateOf(holder)) !== target.hash) {
            throw new PostConflictError(`the live ${target.entityType} at this address changed after this run's plan was built`);
          }
          return { deletedAt: holder.deletedAt ?? null };
        },
        execute: () =>
          retirePostForReplacement({
            deps: { repo: postRepo, clock: deps.clock, outbox, remove: removePost },
            input: {
              workspaceId: deps.workspaceId,
              id: target.entityId,
              expectedVersion: holder!.version,
              today: todayStamp(clockNowIso({ clock: deps.clock })),
              actorId: input.principalId,
            },
          }),
        captureEntityVersion: ({ result }) => result.post.version,
        rollback: undoRetire,
      },
    });

    return { changeSetId, undo: undoRetire };
  }
  return { planRetire, retire };
}

/**
 * `yyyymmdd` from an ISO clock reading — {@link retirePostForReplacement}'s own `today` input shape
 * (`post.ts`'s own doc: "supplied by the caller rather than derived from `clockNowIso({ clock: deps.clock })`'s ISO
 * format"). The one place that derivation happens, so `retire()` above stays a pure caller of it.
 */
function todayStamp(nowIso: string): string {
  return nowIso.slice(0, 10).replace(/-/g, "");
}

/** `post`'s publish-content contribution. */
export const contributePostPublish = (): PublishContentContributor => contributePostKind("post");

/** `page`'s publish-content contribution: same table, same repo, same config as {@link contributePostPublish}. */
export const contributePagePublish = (): PublishContentContributor => contributePostKind("page");
