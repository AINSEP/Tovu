import { executeCommand, ForbiddenError } from "@jini-ai/cms/core";
import type { AuthorizeFn, ChangeSetRepoPort, JsonObject, OutboxPort } from "@jini-ai/cms/core";

import { createRepoPublishHandler } from "#src/features/publish-content/repo-handler";
import type {
  EntityReplacement,
  PublishContentContributor,
  PublishContentDeps,
  PublishContentPorts,
  ReferenceHolder,
  RepointResult,
} from "#src/features/publish-content/type-registry";

import { importMenuEntity } from "./import-menu.js";
import { menuHoldersReferencing, repointMenuItems } from "./repoint-menu-refs.js";
import type { MenuRepointReplacement } from "./repoint-menu-refs.js";
import { MenuConflictError, MenuNotFoundError, MenuValidationError, updateMenuTree, validateAndCloneTree } from "./index.js";
import type { MenuRepoPort, MenuStatus, NavMenuDoc, NavMenuEntry } from "./index.js";

/**
 * @file `menu`'s publish-content contribution, built on `createRepoPublishHandler`
 * (`features/publish-content/repo-handler.ts`; M-MENU of
 * `ADS-memory/.local-artifacts/plan-publish-all-types-2026-09-25.md`). A DATA export that imports only
 * `type-registry.ts`'s TYPES — see that file's header for the module cycle a value edge would reopen.
 *
 * ## Identity: the menu's OWN id, not a natural key
 *
 * Menu ids are SHARED across instances seeded from the same `content.seed.db` (`menu-header-nav`,
 * `menu-footer-nav`, ...), and a newly-created menu keeps its id when it travels, exactly like
 * `post`/`page`/`media`.
 *
 * ## The write is `importMenuEntity` (`./import-menu.ts`), with no `undo`
 *
 * Jini's `createMenu` mints its own id and `updateMenuTree` cannot create a row, so
 * `importMenuEntity` is the id-preserving, OCC-gated write (its header explains why it reimplements
 * `assignLocation`'s binding-index half). Menus have no command-gateway write path yet
 * (`menu-service.ts`'s header), so there is nothing to wrap in `executeCommand`.
 *
 * ## A trashed DESTINATION row
 *
 * The factory refuses a trashed destination row, but every real `MenuRepoPort` adapter HIDES trashed
 * rows (`repo.sqlite.ts`'s `NOT_TRASHED`, `trash-aware-memory-menu-repo.ts`), so there `find` returns
 * `null` and the refusal cannot fire; `findByIdIncludingTrashed` is not on the hermetic root's adapter.
 * It is still safe: each adapter's `.save()` refuses to revive a trashed row, so such a row plans as
 * `created` and applies as a no-op rather than resurrecting.
 *
 * ## `dependsOn: ["post", "page"]`
 *
 * Menu items may target a page/post id (`entryRef`). The resolver (`Jini/.../navigation/resolver.ts`)
 * already degrades a missing target to `available: false` rather than blocking resolution or this
 * publish (its own header; `precheck` below does not validate ref targets for the identical reason),
 * so this ordering is a best-effort freshness improvement — apply posts/pages first so most refs
 * resolve immediately after a full sync — not a correctness requirement `apply()` depends on.
 *
 * Deliberately NOT widened to `term`/`collection-entry` (plan-publish-all-types §3.8): the write
 * path (`import-menu.ts` → `validateAndCloneTree`, Jini `menu-service.ts` `validateTarget`) checks a
 * `termRef`/`entryRef` target's shape only, never that it exists, so those refs are soft and need no
 * ordering. Widening would also close a cycle once a widget names a menu (post → widget → menu →
 * post). `publish-content-manifest.test.ts` builds the real catalog to catch that.
 */

/** Called from a composition root (`server/runtime/composition/publish-content-manifest.ts`). */
export const contributeMenusPublish = (): PublishContentContributor =>
  createRepoPublishHandler<NavMenuEntry, PublishContentPorts["menu"]>({
    entityType: "menu",
    // Menus' own write permission (`Jini/.../navigation/agent-tools.ts`, `routes/admin/content/menus/*`).
    permission: "admin.menus.update",
    dependsOn: ["post", "page"],
    ports: (deps) => deps.ports.menu,
    list: (p, workspaceId) => p.repo.list({ workspaceId }),
    find: (p, workspaceId, id) => p.repo.findById({ workspaceId, id }),
    isTrashed: (row) => row.status === "trash",
    // `NavMenuEntry` has no authorship/provenance field, so everything packed is hashed.
    fields: {
      slug: "transferred",
      title: "transferred",
      status: "transferred",
      doc: "transferred",
      locations: "transferred",
      id: "local",
      workspaceId: "local",
      updatedAt: "local",
      version: "local",
    },
    address: { field: "slug", holder: (p, workspaceId, slug) => p.repo.findBySlug({ workspaceId, slug }) },
    validate: async ({ entity }) => {
      try {
        validateAndCloneTree((entity.state.doc as NavMenuDoc).items);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    write: async ({ ports, deps, workspaceId, id, state, expectedVersion }) => {
      if (!deps.outbox) {
        throw new Error("publish-content: menu.apply() requires PublishContentDeps.outbox — wire it from the real apply-loop composition root (features/publish-content/apply-loop.ts).");
      }
      const record: NavMenuEntry = {
        id,
        workspaceId,
        slug: state.slug as string,
        title: state.title as string,
        status: state.status as MenuStatus,
        doc: state.doc as NavMenuDoc,
        locations: (state.locations as readonly string[] | undefined) ?? [],
        // Local bookkeeping, recomputed inside `importMenuEntity`; never read back.
        updatedAt: deps.clock.nowIso(),
        version: 0,
      };
      const importDeps = { clock: deps.clock, idGen: deps.idGen, repo: ports.repo, bindingRepo: ports.bindingRepo, outbox: deps.outbox };
      await importMenuEntity({ deps: importDeps, input: { workspaceId, record, expectedVersion } });
    },
    errors: { blocked: [MenuValidationError], conflict: [MenuConflictError, MenuNotFoundError] },
    extend: ({ deps }) => menuReferenceMethods(deps),
  });

/** R3 (`plan-publish-repoint-menus-2026-09-24.md`): find and repoint menu links to retired rows. */
function menuReferenceMethods(deps: PublishContentDeps) {
  const entityType = "menu";

  /**
   * R3 (`plan-publish-repoint-menus-2026-09-24.md` §2.1/§2.2) — read-only: every live menu with at
   * least one item, at any depth, whose `entryRef.entryId` is one of `ids`. Delegates the tree walk
   * to {@link menuHoldersReferencing} (`./repoint-menu-refs.js`) over a single `menuRepo.list()` read
   * — the planner (`planner.ts`) calls this at most once per plan, with every retire-target id
   * collected across the whole report, never once per row.
   * @complexity O(n) over every item across every live menu (n = total item count including
   * descendants) via {@link menuHoldersReferencing}, plus one repo list call.
   */
  async function referencesTo(ids: readonly string[]): Promise<readonly ReferenceHolder[]> {
    const menuRepo = deps.ports.menu?.repo;
    if (!menuRepo) return [];
    const menus = await menuRepo.list({ workspaceId: deps.workspaceId });
    return menuHoldersReferencing(menus, ids);
  }

  /**
   * R3 §2.3/§2.4 — the write side: for every live menu (from `menuRepo.list()`) not named in
   * `input.skipIds` that has at least one `entryRef` matching a replacement's `oldId`, rewrites those
   * links to the matching `newId` through `updateMenuTree`, wrapped in `executeCommand` exactly like
   * `retire()` (`features/post/publish-content.ts`) wraps its own domain write — one revertible,
   * audited change set per menu.
   *
   * A pre-check against the `menuRepo.list()` snapshot already in hand skips any menu with nothing to
   * change before spending a second repo round-trip on it. The actual write happens in
   * {@link repointOneMenu}, which re-reads that ONE menu fresh (never trusting this snapshot) so a
   * retry after a concurrency conflict sees whatever has actually landed. A failure repointing one
   * menu — a denied grant, an edit that keeps conflicting — never aborts the pass or throws: every
   * other menu is still attempted, and the failure becomes one line in
   * {@link RepointResult.notUpdated}, per this method's own contract (`type-registry.ts`) — the
   * content this run published already landed, so a repoint failure must only ever be reported, never
   * fail the run.
   *
   * @complexity O(m) items scanned across the `menuRepo.list()` snapshot for the pre-check (m = total
   * item count across live menus), plus up to 2 repo round-trips and one `executeCommand` per menu
   * that actually needs a write.
   */
  async function repointReferences(input: {
    replacements: readonly EntityReplacement[];
    skipIds: ReadonlySet<string>;
    principalId: string;
    runId: string;
  }): Promise<RepointResult> {
    const menuRepo = deps.ports.menu?.repo;
    const { changeSets, authorize, outbox } = deps;
    if (!menuRepo || !changeSets || !authorize || !outbox) {
      throw new Error(
        `publish-content: ${entityType}.repointReferences() requires PublishContentDeps.ports.menu.repo, ` +
          ".changeSets, .authorize and .outbox — wire them from the real apply-loop composition root " +
          "(features/publish-content/apply-loop.ts)."
      );
    }

    const replacementByOldId = new Map<string, MenuRepointReplacement>(
      input.replacements.map((replacement) => [replacement.oldId, { newId: replacement.newId, entityType: replacement.entityType }] as const)
    );

    const menus = await menuRepo.list({ workspaceId: deps.workspaceId });
    const changeSetIds: string[] = [];
    let linksUpdated = 0;
    const notUpdated: string[] = [];

    for (const menu of menus) {
      if (input.skipIds.has(menu.id)) continue;
      if (repointMenuItems(menu.doc.items, replacementByOldId).count === 0) continue;

      const outcome = await repointOneMenu({
        menuRepo,
        changeSets,
        authorize,
        outbox,
        menuId: menu.id,
        replacementByOldId,
        principalId: input.principalId,
        runId: input.runId,
      });
      if (outcome.kind === "written") {
        changeSetIds.push(outcome.changeSetId);
        linksUpdated += outcome.count;
      } else if (outcome.kind === "not-updated") {
        notUpdated.push(outcome.message);
      }
    }

    return { changeSetIds, linksUpdated, notUpdated };
  }

  /**
   * One menu's own repoint attempt, retried once on an optimistic-concurrency conflict. Each attempt
   * re-reads the menu FRESH (never the caller's `menuRepo.list()` snapshot) and recomputes the
   * repointed tree against that read, so a retry sees whatever landed since the previous attempt —
   * mirroring `retire()`'s (`features/post/publish-content.ts`) "fresh read right before the write"
   * discipline, one level up (per-attempt here, rather than inside `captureInverse` itself, since this
   * loop's retry needs the same fresh read to decide whether there is still anything to write).
   *
   * `MenuConflictError` on the first attempt retries once; a second conflict, or a `ForbiddenError`
   * from `executeCommand`'s own authorization gate (denying `admin.menus.update`), ends the attempt as
   * a {@link RepointResult.notUpdated} line rather than throwing — see {@link repointReferences}'s own
   * doc for why a repoint failure must never fail the surrounding publish run. Any other thrown error
   * is a genuine fault and is never swallowed.
   *
   * @complexity O(1) repo calls per attempt (bounded at 2 attempts) plus `repointMenuItems`'s own O(n)
   * tree walk (n = this one menu's item count) and `executeCommand`'s own cost.
   */
  async function repointOneMenu(input: {
    menuRepo: MenuRepoPort;
    changeSets: ChangeSetRepoPort;
    authorize: AuthorizeFn;
    outbox: OutboxPort;
    menuId: string;
    replacementByOldId: ReadonlyMap<string, MenuRepointReplacement>;
    principalId: string;
    runId: string;
  }): Promise<
    { kind: "written"; changeSetId: string; count: number } | { kind: "not-updated"; message: string } | { kind: "no-op" }
  > {
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const menu = await input.menuRepo.findById({ workspaceId: deps.workspaceId, id: input.menuId });
      if (!menu) return { kind: "no-op" }; // vanished since the snapshot — nothing left to repoint

      const repointed = repointMenuItems(menu.doc.items, input.replacementByOldId);
      if (repointed.count === 0) return { kind: "no-op" }; // already resolved (this attempt or a peer)

      const writeDeps = { repo: input.menuRepo, clock: deps.clock, idGen: deps.idGen, outbox: input.outbox };
      // The version `execute` wrote, so `rollback` can put the prior tree back under OCC.
      let writtenVersion: number | null = null;
      try {
        const { changeSetId } = await executeCommand({
          deps: { clock: deps.clock, idGen: deps.idGen, changeSets: input.changeSets, outbox: input.outbox, authorize: input.authorize },
          command: {
            workspaceId: deps.workspaceId,
            actor: { id: input.principalId, kind: "user" },
            summary: `Repoint menu '${menu.title}' links after publish run ${input.runId}`,
            permission: "admin.menus.update",
            idempotencyKey: `publish-content:v1:repoint:${input.runId}:${menu.id}`,
          },
          mutation: {
            entityType: "menu",
            entityId: menu.id,
            operation: "update",
            captureInverse: async () => ({ items: menu.doc.items } as unknown as JsonObject),
            execute: async () => {
              const written = await updateMenuTree({
                deps: writeDeps,
                input: { workspaceId: deps.workspaceId, id: menu.id, expectedVersion: menu.version, items: repointed.items },
              });
              writtenVersion = written.menu.version;
              return written;
            },
            captureEntityVersion: (result) => result.menu.version,
            // Compensating undo when the change-set record fails AFTER the write landed (INV-01: no
            // mutation without a record) — same role as `retire()`'s `rollback` in
            // `features/post/publish-content.ts`. Without it the menu stays repointed with no History
            // entry to revert, while the caller reports the links as not updated.
            rollback: async () => {
              if (writtenVersion === null) return;
              await updateMenuTree({
                deps: writeDeps,
                input: { workspaceId: deps.workspaceId, id: menu.id, expectedVersion: writtenVersion, items: menu.doc.items },
              });
            },
          },
        });
        return { kind: "written", changeSetId, count: repointed.count };
      } catch (err) {
        if (err instanceof MenuConflictError) {
          if (attempt >= MAX_ATTEMPTS) {
            return { kind: "not-updated", message: `Menu '${menu.title}' was not updated: it changed during publish.` };
          }
          continue; // one retry, against a fresh read at the top of the loop
        }
        if (err instanceof ForbiddenError) {
          return { kind: "not-updated", message: "Menu links were not updated: this publishing grant doesn't cover menus." };
        }
        throw err; // a genuine fault — never swallowed
      }
    }
    // Unreachable: the loop above always returns within MAX_ATTEMPTS iterations. Kept for TypeScript's
    // control-flow analysis, which cannot see that the last iteration always returns or continues.
    throw new Error("publish-content: menu.repointOneMenu() exhausted its retry loop without returning");
  }

  return { referencesTo, repointReferences };
}
