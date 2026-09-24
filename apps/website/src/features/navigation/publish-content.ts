import { PublishContentApplyRowError } from "#src/features/publish-content/apply-errors";
import { contentHash, CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import type { PackedEntity, PublishContentContributor, PublishContentDeps, PublishContentHandler } from "#src/features/publish-content/type-registry";

import { importMenuEntity } from "./import-menu.js";
import type { ImportMenuEntityDeps } from "./import-menu.js";
import { MenuConflictError, MenuNotFoundError, MenuValidationError, validateAndCloneTree } from "./index.js";
import type { MenuStatus, NavMenuDoc, NavMenuEntry } from "./index.js";

/**
 * @file S3 of `ADS-memory/.local-artifacts/publish-types-plan-2026-09-24.md` — `menu`'s
 * publish-content contribution. Mirrors `features/redirects/publish-content.ts` (S2) and
 * `features/post/publish-content.ts` exactly in shape: a DATA export (`{entityType, dependsOn,
 * build}`) importing only `type-registry.ts`'s TYPES, never `registerPublishContentContributor`
 * itself — see that file's header for why a value edge here would reopen a real module cycle.
 *
 * Design worked out in `ADS-memory/.local-artifacts/handoffs/2026-09-24-c7-publish-types-build.md`
 * §S3 pointer and `publish-types-plan-2026-09-24.md` §3's `menu` bullet before this file was typed
 * in; corrections made while implementing are disclosed below.
 *
 * ## Identity: the menu's OWN id, not a natural key
 *
 * Unlike `redirect` (S2), menu ids are SHARED across instances seeded from the same
 * `content.seed.db` (`menu-header-nav`, `menu-footer-nav`, four others), and a newly-created menu on
 * the source keeps that id when it travels. `PackedEntity.id` is therefore the menu's real `id`,
 * exactly like `post`/`page`/`media` — no natural-key indirection to parse.
 *
 * ## `apply()` writes through `importMenuEntity` (`./import-menu.ts`), a THIRD write path
 *
 * Jini's own `createMenu` mints its own id (`menu-service.ts:337-352`) and is unusable here;
 * `updateMenuTree` cannot create a row that does not exist yet. `importMenuEntity` is the
 * id-preserving, OCC-gated replacement — see its own file header for the full design, including why
 * it reimplements `assignLocation`'s binding-index half rather than calling it per-location (calling
 * it as literally described would introduce a redundant-resave defect: N extra menu saves/version
 * bumps/outbox events for one incoming record).
 *
 * No `executeCommand` wrapping: like `redirect` (S2's own disclosed note) and unlike `post`/`media`,
 * menus have no real command-gateway write path yet — `menu-service.ts`'s own header says so
 * explicitly ("that gateway is not implemented as running code yet ... called directly for now"), so
 * there is nothing to wrap into.
 *
 * ## Disclosed limitation: a trashed DESTINATION row cannot be distinguished from an absent one
 *
 * The design record's precheck bullet asks for "destination row trashed → blocked". `MenuRepoPort`
 * (unlike `PostRepoPort`, which is deliberately trash-blind — see `post.ts`'s `isTrashed`) HIDES a
 * trashed row at the port/adapter level for every real adapter: `repo.sqlite.ts`'s `NOT_TRASHED`
 * scopes `findById`/`findBySlug`/`list`, and `trash-aware-memory-menu-repo.ts` filters identically —
 * `findById` on a trashed destination id returns `null`, indistinguishable from "no such row". The
 * one seam that CAN see a trashed row (`findByIdIncludingTrashed`, `menu-trash-follow-ups.ts`'s
 * `MenuTrashLookup`) is not implemented by `TrashAwareInMemoryMenuRepo` (the hermetic composition
 * root's adapter, `server/runtime/composition/app.ts`) at all — typing this contributor's `menuRepo`
 * dependency to require it would fail to compile against that root, not just degrade gracefully.
 *
 * This is SAFE, not silently dangerous: every real adapter's own `.save()` independently refuses to
 * revive a trashed row at the storage layer (`repo.sqlite.ts`'s `setWhere: NOT_TRASHED`,
 * `trash-aware-memory-menu-repo.ts`'s explicit `status === "trash"` no-op guard) — a trashed
 * destination id structurally cannot be resurrected by a publish even without an explicit precheck
 * branch for it. The gap this leaves is only in the OPERATOR-FACING reason string: such a row plans
 * as `created` (since `inspect()` also sees `null`) and applies as a silent no-op rather than a
 * `blocked: destination is in the trash` explanation. Flagged here as a disclosed, narrow deviation
 * and a follow-up for whichever slice threads a trash-aware read into every composition root's menu
 * repo consistently — not a Sonnet-slice call on its own.
 *
 * ## `dependsOn: ["post", "page"]`
 *
 * Menu items may target a page/post id (`entryRef`). The resolver (`Jini/.../navigation/resolver.ts`)
 * already degrades a missing target to `available: false` rather than blocking resolution or this
 * publish (its own header; `precheck` below does not validate ref targets for the identical reason),
 * so this ordering is a best-effort freshness improvement — apply posts/pages first so most refs
 * resolve immediately after a full sync — not a correctness requirement `apply()` depends on.
 */

const MENU_DEPENDS_ON: readonly string[] = ["post", "page"];

/**
 * Every `NavMenuEntry` field, classified by what this transport does with it — same
 * defect-prevention reasoning as `POST_FIELD_DISPOSITIONS`/`REDIRECT_FIELD_DISPOSITIONS` (those
 * files' own docs): a field hashed but not actually written back by `importMenuEntity` would make
 * `planner.ts`'s `destination.hash === entity.contentHash` never agree, permanently reporting an
 * unchanged menu as `conflict`. `NavMenuEntry` carries no authorship/provenance field at all (no
 * `createdAt`/`createdBy*`, unlike `PostRecord`/`RedirectRecord`), so this map has only two buckets.
 */
const MENU_FIELD_DISPOSITIONS: Record<keyof NavMenuEntry, "transferred" | "local"> = {
  slug: "transferred",
  title: "transferred",
  status: "transferred",
  doc: "transferred",
  locations: "transferred",

  id: "local",
  workspaceId: "local",
  updatedAt: "local",
  version: "local",
};

/** The wire AND hash field set — identical for `menu` today (no provenance bucket exists to split
 *  them apart), derived from {@link MENU_FIELD_DISPOSITIONS} so the two can never silently drift. */
const TRANSFERRED_MENU_FIELDS = Object.freeze(
  (Object.keys(MENU_FIELD_DISPOSITIONS) as Array<keyof NavMenuEntry>).filter(
    (field) => MENU_FIELD_DISPOSITIONS[field] === "transferred"
  )
);

/** The wire shape of a packed menu: {@link TRANSFERRED_MENU_FIELDS}, nothing else — used for both
 *  `PackedEntity.state` and the hash input (see this file's header for why the two sets coincide).
 *  @complexity O(1) — a fixed field count. */
function toMenuState(record: NavMenuEntry): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const field of TRANSFERRED_MENU_FIELDS) {
    state[field] = record[field] ?? null;
  }
  return state;
}

/** Maps a thrown chokepoint refusal to the per-row downgrade `apply-loop.ts` recognizes, or passes a
 *  genuine fault through unchanged (never swallowed) — mirrors `features/redirects/publish-content
 *  .ts`'s identical "apply-time re-verification" reasoning: every one of these is an ordinary,
 *  expected outcome of publishing real-world data, not a programming error.
 *  @complexity O(1). */
function toApplyRowError(err: unknown): Error {
  if (err instanceof MenuConflictError || err instanceof MenuNotFoundError) {
    return new PublishContentApplyRowError("conflict", err.message);
  }
  if (err instanceof MenuValidationError) {
    return new PublishContentApplyRowError("blocked", err.message);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function buildHandler(deps: PublishContentDeps): PublishContentHandler {
  const entityType = "menu";
  const schemaVersion = 1;

  async function* pack(): AsyncIterable<PackedEntity> {
    // Absent `menuRepo` degrades to "nothing to export" — mirrors `features/redirects/
    // publish-content.ts`'s identical convention for a caller with no use for this type.
    const menuRepo = deps.menuRepo;
    if (!menuRepo) return;
    const rows = await menuRepo.list({ workspaceId: deps.workspaceId });
    for (const row of rows) {
      // Fail-closed skip: a trashed source menu never travels, so publishing can never export (and
      // therefore never resurrect, on any destination) trashed content — same reading
      // `features/post/publish-content.ts`'s own `pack()` applies to a trashed post.
      if (row.status === "trash") continue;
      const state = toMenuState(row);
      yield {
        entityType,
        id: row.id,
        schemaVersion,
        contentHash: contentHash(entityType, state),
        hashVersion: CONTENT_HASH_VERSION,
        requiredBlobs: [],
        state,
      };
    }
  }

  async function inspect(id: string): Promise<{ version: number; hash: string } | null> {
    const menuRepo = deps.menuRepo;
    if (!menuRepo) return null;
    const found = await menuRepo.findById({ workspaceId: deps.workspaceId, id });
    if (!found) return null;
    return { version: found.version, hash: contentHash(entityType, toMenuState(found)) };
  }

  /**
   * Pure precondition check — never writes. See this file's header for why a trashed destination
   * row is NOT one of the conditions checked here (a disclosed interface limitation, not an
   * oversight) and for why that omission is still safe.
   * @complexity O(1) repo calls plus {@link validateAndCloneTree}'s own O(n) tree walk.
   */
  async function precheck(entity: PackedEntity): Promise<string | null> {
    const menuRepo = deps.menuRepo;
    if (!menuRepo) return `menu entity '${entity.id}' cannot be prechecked — no menuRepo wired for this deps bag`;

    const state = entity.state;
    const slug = state.slug as string;
    const slugHolder = await menuRepo.findBySlug({ workspaceId: deps.workspaceId, slug });
    if (slugHolder && slugHolder.id !== entity.id) {
      return `menu slug '${slug}' is already held by a different menu ('${slugHolder.id}') at this destination`;
    }

    try {
      validateAndCloneTree((state.doc as NavMenuDoc).items);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    return null;
  }

  /**
   * Applies ONE menu entity directly through `importMenuEntity` (`./import-menu.ts`) — see this
   * file's header for why that is a new, third write path rather than `createMenu`/`updateMenuTree`,
   * and why there is no `executeCommand` wrapping.
   * @complexity O(1) plus `importMenuEntity`'s own cost (bounded repo reads/writes — see its doc).
   */
  async function apply(input: {
    entity: PackedEntity;
    expectedVersion: number | undefined;
    principalId: string;
    idempotencyKey: string;
  }): Promise<{ changeSetId: string }> {
    const menuRepo = deps.menuRepo;
    const navLocationBindingRepo = deps.navLocationBindingRepo;
    if (!menuRepo || !navLocationBindingRepo || !deps.outbox) {
      throw new Error(
        `publish-content: ${entityType}.apply() requires PublishContentDeps.menuRepo, ` +
          ".navLocationBindingRepo and .outbox — wire them from the real apply-loop composition root " +
          "(features/publish-content/apply-loop.ts)."
      );
    }

    const state = input.entity.state;
    const record: NavMenuEntry = {
      id: input.entity.id,
      workspaceId: deps.workspaceId,
      slug: state.slug as string,
      title: state.title as string,
      status: state.status as MenuStatus,
      doc: state.doc as NavMenuDoc,
      locations: (state.locations as readonly string[] | undefined) ?? [],
      // Local write bookkeeping — never packed (see `MENU_FIELD_DISPOSITIONS`), and fully
      // recomputed inside `importMenuEntity`; these placeholders are never read back.
      updatedAt: deps.clock.nowIso(),
      version: 0,
    };

    const importDeps: ImportMenuEntityDeps = {
      clock: deps.clock,
      idGen: deps.idGen,
      repo: menuRepo,
      bindingRepo: navLocationBindingRepo,
      outbox: deps.outbox,
    };

    try {
      const { menu } = await importMenuEntity({
        deps: importDeps,
        input: { workspaceId: deps.workspaceId, record, expectedVersion: input.expectedVersion },
      });
      // Menus have no `change_sets` row of their own (no command-gateway write path yet — see this
      // file's header); `menu.id` is the best available per-row reference for the run's report, same
      // spirit as `redirect`'s own disclosed `record.id` choice.
      return { changeSetId: menu.id };
    } catch (err) {
      throw toApplyRowError(err);
    }
  }

  return {
    entityType,
    schemaVersion,
    // Menus' own existing write permission (`Jini/.../navigation/agent-tools.ts`,
    // `routes/admin/content/menus/*`) — never a flat transport-wide permission, per
    // `PublishContentHandler.permission`'s own contract.
    permission: "admin.menus.update",
    dependsOn: MENU_DEPENDS_ON,
    pack,
    inspect,
    precheck,
    apply,
  };
}

/**
 * `menu`'s publish-content contribution. Called from a composition root
 * (`server/runtime/composition/publish-content-manifest.ts`), NOT from within `features/navigation`
 * itself — see this file's header.
 */
export function contributeMenusPublish(): PublishContentContributor {
  return { entityType: "menu", dependsOn: MENU_DEPENDS_ON, build: buildHandler };
}
