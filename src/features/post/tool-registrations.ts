/**
 * @file Posts + Pages' half of ADR-049 Decision 4: maps `agent-tools.ts`'s 6 catalog entries onto
 * `post.ts`'s `createPost`/`updatePost`/`deletePost`/`listAdminPosts`/`listAdminPages`/
 * `getAdminPostById` plus `search.ts`'s `searchAdminPosts`, as `ToolRegistration`s.
 *
 * Authorization shape: `createPost`/`updatePost` (`post.ts`) carry no `authorize()` call of their
 * own (confirmed by reading the whole file) — unlike Forms' write-service functions, which
 * self-enforce and let `ToolPolicy` stay a pure pass-through. So `content_post_create`/
 * `content_post_update` route through `core/commands`'s `executeCommand` directly, exactly the same
 * composition `posts/create.ts`/`posts/update.ts`/`pages/create.ts`/`pages/update.ts` already use
 * (same `content.write` permission, same command gateway) — mirroring `features/plugin-runtime/
 * tool-registrations.ts`'s identical precedent for a domain with no self-enforcing write-service
 * layer of its own. `content_post_list`/`content_post_get` have no service-layer gate either
 * (`listAdminPosts`/`listAdminPages`/`getAdminPostById` take no `authorize()` param at all), so
 * their handlers perform the same inline `content.read` check the admin GET routes perform
 * themselves — mirroring `features/entries/tool-registrations.ts`'s identical `collections_entry_list`
 * precedent. `content_post_search` is in that same group (`searchAdminPosts` takes no `authorize`
 * param either), with the one difference that it has no admin route to mirror at all — see
 * `agent-tools.ts`'s header for why that is deliberate rather than a gap in the mirroring rule.
 */
import {
  AGENT_TOOL_PRINCIPAL_KIND,
  buildDomainRegistrations,
  indexCatalogById,
  optionalNumber,
  optionalString,
  requireInputRecord,
  requireObject,
  requireString,
  requireToolPermission,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type EventBusPort,
  type JsonObject,
  type OutboxPort,
} from "@jini-ai/cms/core";
// Sourced from `assistant/` — an explicitly out-of-scope back-edge for this pass (see the dispatch
// notes this file's narrowing was reported under), not a field this file could re-source from a
// domain-owned port: the MCP-UI/exchange transport is genuinely assistant-owned.
import { askOnce, type AssistantSurfaceDeps, type SurfaceExchange } from "../../core/tool-surface-exchanges";
import { executeCommand, type AuthorizeFn, type ChangeSetRepoPort } from "../../core/commands";
import { processOutbox } from "../../core/events";
import { registerToolContributor } from "#src/assistant/index";
import {
  postAgentToolCatalog,
  type AgentToolDefinition as PostAgentToolDefinition,
} from "./agent-tools";
import {
  buildDeleteConfirmationResource,
  CONTENT_POST_DELETE_TOOL_ID,
} from "./delete-confirmation-ui";
import {
  createPost,
  deletePost,
  getAdminPostById,
  isTrashed,
  listAdminPages,
  listAdminPosts,
  updatePost,
  PostNotFoundError,
  PostValidationError,
  type PostKind,
  type PostRecord,
  type PostRepoPort,
  type PostStatus,
  type BeforeSaveHookPort,
} from "./post";
import { searchAdminPosts, type PostSearchPort } from "./search";

const CATALOG_BY_ID = indexCatalogById(postAgentToolCatalog);

/**
 * The exact slice of the route-deps bag Posts/Pages' tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root for the `RouteDeps` god type specifically — the `assistant/mcp-ui`/
 * `assistant/pending-confirmations` imports above are separate, already-disclosed back-edges left
 * untouched per the dispatch's explicit out-of-scope list. `server/routes/*` satisfies this
 * structurally by passing its existing `RouteDeps` object; nothing there changes.
 */
export interface PostToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  changeSets: ChangeSetRepoPort;
  outbox: OutboxPort;
  bus: EventBusPort;
  postRepo: PostRepoPort;
  postSearch: PostSearchPort;
  pluginBeforeSaveHook: BeforeSaveHookPort;
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const postDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> searchAdminPosts (search.ts) -> PostSearchPort.search(): a SELECT against the FTS5 index
  //    joined back to `posts`. Read-only in both adapters — the durable one runs one prepared
  //    query, and the in-memory one's per-query mirror writes only to its own private `:memory:`
  //    scratch database, never to anything a caller can observe or that survives the process.
  ["content_post_search", "none"],
  // -> listAdminPosts/listAdminPages (post.ts): postRepo.list() only, no write.
  ["content_post_list", "none"],
  // -> getAdminPostById (post.ts): postRepo.findById() only, no write.
  ["content_post_get", "none"],
  // -> executeCommand -> createPost (post.ts): postRepo.save() + change-set record.
  ["content_post_create", "mutates-durable-state"],
  // -> executeCommand -> updatePost (post.ts): postRepo.save() + change-set record, plus an
  //    outbox-drained entry.published/entry.updated/entry.unpublished event on a status transition.
  ["content_post_update", "mutates-durable-state"],
  // -> executeCommand -> deletePost (post.ts): postRepo.softDelete() + change-set record, plus an
  //    outbox-drained entry.unpublished event when the trashed row was published. Classified
  //    `deletes-durable-state` and NOT `mutates-durable-state`: what the handler calls makes the
  //    row vanish from listAdminPosts/listAdminPages/getAdminPostById/listPublishedPosts/
  //    getPublishedPostBySlug and from the public site — a different kind of consequence from an
  //    edit, and the whole reason this file's classification is derived from the call graph rather
  //    than read off the catalog. Note this entry describes the call's CONFIRMED outcome (the human
  //    clicked Delete); the SAME call's cancelled/expired/abandoned outcomes write nothing, so the
  //    classification here is the strictly worse of the outcomes, which is the conservative
  //    direction (ADR-055 Decision 2 — one held-open call, not a mint call plus a redeem call).
  ["content_post_delete", "deletes-durable-state"],
]);

/**
 * The only Posts/Pages rejection worth decorating with the published schema: `bodyJson`/`title`/
 * `slug`/`status` SHAPE problems (`PostValidationError`). A `PostNotFoundError` (including the
 * disclosed kind-mismatch 404) or a `PostConflictError` (slug taken) is not a shape problem —
 * retrying the SAME input would never resolve either.
 */
function isPostShapeRejection(error: unknown): boolean {
  return error instanceof PostValidationError;
}

function requirePostKind(input: Record<string, unknown>): PostKind {
  const value = input.kind;
  if (value !== "post" && value !== "page") {
    throw new Error("'kind' must be exactly 'post' or 'page'");
  }
  return value;
}

function requirePostStatus(input: Record<string, unknown>): PostStatus {
  const value = input.status;
  if (value !== "draft" && value !== "published") {
    throw new Error("'status' must be exactly 'draft' or 'published'");
  }
  return value;
}

function optionalPostStatus(input: Record<string, unknown>): PostStatus | undefined {
  if (input.status === undefined) return undefined;
  return requirePostStatus(input);
}

/** `requireObject` (the kit's generic reader) returns `Record<string, unknown>` — this domain's
 * `bodyJson` is typed as `JsonObject` (`post.ts`), so this narrows the one field that differs.
 * `post.ts`'s own `isJsonObject` check (inside `createPost`/`updatePost`) is the actual runtime
 * shape gate — this cast does not weaken that, it only aligns the caller-facing TS type. */
function requireBodyJson(input: Record<string, unknown>, key: string): JsonObject {
  return requireObject(input, key) as unknown as JsonObject;
}

/** Shared dependency bag for `core/commands`'s `executeCommand` — identical shape to the one
 * `posts/create.ts`/`posts/update.ts`/`pages/create.ts`/`pages/update.ts` each build inline. */
function postCommandDeps(routeDeps: PostToolDeps) {
  return {
    clock: routeDeps.clock,
    idGen: routeDeps.idGen,
    changeSets: routeDeps.changeSets,
    outbox: routeDeps.outbox,
    authorize: routeDeps.authorize,
  };
}

/** What a Posts/Pages tool returns to the model — see {@link toPostToolView}. */
interface PostToolView {
  id: string;
  kind: PostKind;
  title: string;
  slug: string;
  bodyJson: unknown;
  status: PostStatus;
  updatedAt: string;
  version: number;
}

/** Projects a `PostRecord` into the explicit model-facing shape — `workspaceId` is dropped (the
 * agent is already scoped to one workspace it did not choose and cannot change), and the internal
 * `seoExtJson` sidecar (owned exclusively by `src/seo/write-service.ts`'s chokepoint, per `post.ts`'s
 * own field doc) is dropped too, mirroring `toHeadlessPost`'s own admin-facing projection. */
function toPostToolView(post: PostRecord): PostToolView {
  return {
    id: post.id,
    kind: post.kind,
    title: post.title,
    slug: post.slug,
    bodyJson: post.bodyJson,
    status: post.status,
    updatedAt: post.updatedAt,
    version: post.version,
  };
}

/**
 * Builds this domain's registrations.
 *
 * @param routeDeps - The same bag the admin routes are built from.
 * @param surfaces - Assistant-transport machinery `content_post_delete` needs to hold its call open
 * across the human's confirmation (ADR-055 Decision 2). Must be the SAME `SurfaceExchangeStore`
 * instance `registerMcpUiToolCallsRoute` was mounted with in production — `agent-daemon-server.ts`
 * builds one and passes it to both; a mismatched instance means the human's click reaches a store
 * nobody is waiting on, and the call times out instead of resolving. Required, matching every other
 * surface-raising domain's `build*Registrations(routeDeps, surfaces)` shape
 * (`assistant/tool-registrations.ts`'s `DomainSlice.build`) — there is no reduced-functionality
 * fallback for a missing store the way there is for a missing `ctx.emitSurface` per call (see the
 * handler below), because a domain with no store at all could never wire this tool's gate.
 */
export function buildPostRegistrations(routeDeps: PostToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    /**
     * Ranked search. Gated exactly like `content_post_list` — same `content.read` permission, same
     * inline check in the route's place, because `searchAdminPosts` (like `listAdminPosts`) takes no
     * `authorize` param of its own. No `entityId` on the check: the caller has not named a row yet,
     * which is the whole point of searching, so this authorizes the ACT of reading posts in this
     * workspace rather than access to any particular one.
     *
     * `withSchemaOnRejection` wraps it for the same reason the write handlers use it: the two things
     * that can go wrong here (a query with no searchable term, a non-numeric `limit`) are both
     * `PostValidationError`s a different input would fix, so publishing the schema alongside saves
     * the model a turn.
     */
    content_post_search: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "content.read", entityType: "post" });

      return withSchemaOnRejection({ toolId: "content_post_search", catalog: CATALOG_BY_ID, isShapeRejection: isPostShapeRejection }, async () => {
        const query = requireString(input, "query");
        const kind = input.kind !== undefined ? requirePostKind(input) : undefined;
        const status = optionalPostStatus(input);
        const limit = optionalNumber(input, "limit");

        const { hits } = await searchAdminPosts({
          deps: { search: routeDeps.postSearch },
          input: {
            workspaceId: routeDeps.workspaceId,
            query,
            ...(kind !== undefined ? { kind } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(limit !== undefined ? { limit } : {}),
          },
        });

        // `hits` is already the model-facing shape (`PostSearchHit`), so unlike every other handler
        // here there is no `toPostToolView` projection to apply — and deliberately no `bodyJson` to
        // drop, because the search layer never loads one. See `search.ts`'s `PostSearchHit` doc.
        return { hits };
      });
    },

    content_post_list: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "content.read", entityType: "post" });

      const kind = requirePostKind(input);
      const { posts } =
        kind === "post"
          ? await listAdminPosts({ deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId } })
          : await listAdminPages({ deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId } });
      return { posts: posts.map(toPostToolView) };
    },

    content_post_get: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "content.read", entityType: "post", entityId: id });

      const kind = requirePostKind(input);
      const { post } = await getAdminPostById({ deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId, id } });

      // Disclosed asymmetry (agent-tools.ts's own header): kind:"page" is guarded exactly like
      // pages/get-by-id.ts (a kind mismatch 404s identically to not-found); kind:"post" is NOT
      // guarded, exactly like posts/get-by-id.ts's own legacy, kind-blind lookup.
      if (kind === "page" && post.kind !== "page") {
        throw new PostNotFoundError(`page '${id}' was not found`);
      }

      return { post: toPostToolView(post) };
    },

    content_post_create: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      return withSchemaOnRejection({ toolId: "content_post_create", catalog: CATALOG_BY_ID, isShapeRejection: isPostShapeRejection }, async () => {
        const kind = requirePostKind(input);
        const title = requireString(input, "title");
        const slug = optionalString(input, "slug");
        const bodyJson = input.bodyJson !== undefined ? requireBodyJson(input, "bodyJson") : undefined;
        const status = optionalPostStatus(input);
        const postId = routeDeps.idGen.newId();

        const { result } = await executeCommand<{ post: PostRecord }>({
          deps: postCommandDeps(routeDeps),
          command: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            summary: `Agent create ${kind} '${title}'`,
            permission: "content.write",
          },
          mutation: {
            entityType: "post",
            entityId: postId,
            operation: "create",
            captureInverse: async () => null,
            execute: () =>
              createPost({
                deps: {
                  repo: routeDeps.postRepo,
                  clock: routeDeps.clock,
                  beforeSaveHook: routeDeps.pluginBeforeSaveHook,
                },
                input: { workspaceId: routeDeps.workspaceId, id: postId, title, kind, slug, bodyJson, status },
              }),
            captureEntityVersion: (r) => r.post.version,
          },
        });

        return { post: toPostToolView(result.post) };
      });
    },

    content_post_update: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      return withSchemaOnRejection({ toolId: "content_post_update", catalog: CATALOG_BY_ID, isShapeRejection: isPostShapeRejection }, async () => {
        const id = requireString(input, "id");
        const kind = requirePostKind(input);
        const title = requireString(input, "title");
        const slug = requireString(input, "slug");
        const bodyJson = requireBodyJson(input, "bodyJson");
        const status = requirePostStatus(input);

        // Captured by `captureInverse` below, reused verbatim by `rollback` — mirrors
        // `posts/update.ts`/`pages/update.ts`'s identical unit-of-work compensation.
        let priorPost: PostRecord | null = null;

        const { result } = await executeCommand<{ post: PostRecord }>({
          deps: postCommandDeps(routeDeps),
          command: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            summary: `Agent update ${kind} '${id}'`,
            permission: "content.write",
          },
          mutation: {
            entityType: "post",
            entityId: id,
            operation: "update",
            captureInverse: async () => {
              const existing = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
              if (!existing) throw new PostNotFoundError(`post '${id}' was not found`);
              if (kind === "page" && existing.kind !== "page") {
                // Kind mismatch treated identically to not-found — mirrors pages/update.ts exactly
                // (see agent-tools.ts's disclosed asymmetry; kind:"post" carries no such guard,
                // mirroring posts/update.ts's own kind-blind captureInverse).
                throw new PostNotFoundError(`page '${id}' was not found`);
              }
              priorPost = existing;
              return { title: existing.title, slug: existing.slug, bodyJson: existing.bodyJson, status: existing.status };
            },
            execute: () =>
              updatePost({
                deps: {
                  repo: routeDeps.postRepo,
                  clock: routeDeps.clock,
                  outbox: routeDeps.outbox,
                  beforeSaveHook: routeDeps.pluginBeforeSaveHook,
                },
                input: { workspaceId: routeDeps.workspaceId, id, title, slug, bodyJson, status },
              }),
            captureEntityVersion: (r) => r.post.version,
            rollback: async () => {
              if (priorPost) await routeDeps.postRepo.save(priorPost);
            },
          },
        });

        // Mirrors posts/update.ts's/pages/update.ts's identical inline processOutbox call — drains
        // updatePost's entry.published/entry.updated/entry.unpublished event (if any) to SEO's
        // sitemap-cache invalidation subscriber, since this composition root has no background
        // outbox poller.
        await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

        return { post: toPostToolView(result.post) };
      });
    },

    /**
     * The MCP-UI-gated delete. See `delete-confirmation-ui.ts` for the surface itself and ADR-055
     * Decision 2 for why this holds its call open rather than returning and waiting for a second one
     * (superseding ADR-053 Decision 3, the token-redemption shape this handler used to implement).
     *
     * One call, blocking:
     *  1. Resolve and describe the row (same as before).
     *  2. Open an exchange, emit the confirmation surface through it, and park on the answer.
     *  3. The answer is the human's decision — confirm, cancel — or a `SurfaceMessage` saying nobody
     *     answered (`expired`/`abandoned`). Every branch returns a truthful result to the SAME call;
     *     none of them throw for "no answer", because the model is still alive to read the result
     *     (ADR-055 Decision 6).
     *  4. On confirm, re-check the entity's version against what the dialog described before writing
     *     — see the inline comment at that check for why this is now the handler's job.
     *
     * No fallback to the old two-call shape when `ctx.emitSurface` is unavailable: unlike a
     * non-destructive surface (`demo-choices-tool.ts`, ADR-055 Decision 1), degrading a DESTRUCTIVE
     * gate to "return the dialog and trust a second, ordinary call" is exactly the shape the removed
     * token existed to guard, and there is no token left to guard it with. An execution context that
     * cannot hold this call open cannot run this tool at all.
     */
    content_post_delete: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");
      const kind = requirePostKind(input);

      // Gated exactly like content_post_get, and performed before opening anything so a caller with
      // no read access learns nothing and never causes a dialog to be raised.
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "content.read",
        entityType: "post",
        entityId: id,
      });

      const existing = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
      // Kind guard placed here rather than in `deletePost`, mirroring `pages/delete.ts`/
      // `pages/update.ts` — and carrying the same disclosed asymmetry the rest of this catalog has:
      // kind:'page' rejects an actual 'post' row, kind:'post' is not guarded the other way.
      // A trashed row is not-found too (post.ts's own rule), so a second delete cannot "succeed".
      if (!existing || isTrashed(existing) || (kind === "page" && existing.kind !== "page")) {
        throw new PostNotFoundError(`${kind} '${id}' was not found`);
      }

      // Fail closed rather than degrade — see this handler's own doc comment above.
      if (!ctx.emitSurface) {
        throw new Error(
          "content_post_delete: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a destructive delete cannot be gated here. Nothing was deleted."
        );
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: CONTENT_POST_DELETE_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );

      const ui = buildDeleteConfirmationResource({
        subject: {
          id: existing.id,
          kind: existing.kind,
          title: existing.title,
          slug: existing.slug,
          status: existing.status,
          version: existing.version,
        },
        exchangeId: exchange.id,
      });

      // A cancelled run must not leave a dialog holding a call nobody is listening to, nor hold this
      // handler open until the idle deadline — mirrors `demo-choices-tool.ts`'s identical guard.
      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });

        // ADR-055 Decision 6: the no-answer path is a result, not an exception. Nothing was deleted
        // either way, and the model is still alive to read this and say something sensible.
        if (answer.status !== "received") {
          return {
            deleted: false,
            cancelled: false,
            reason: answer.status,
            note:
              answer.status === "expired"
                ? "The user did not respond to the confirmation dialog before it expired. Nothing was deleted."
                : "The confirmation dialog was closed because the run ended. Nothing was deleted.",
          };
        }

        const decision = typeof answer.params["decision"] === "string" ? answer.params["decision"] : "confirm";
        if (decision !== "confirm") {
          return { deleted: false, cancelled: true, post: toPostToolView(existing) };
        }

        // Stale-version guard. This used to be `pending-confirmations.ts`'s job — a token bound to
        // `existing.version` at mint time and refused at redeem time if the row had moved. Removing
        // the token (ADR-055 Decision 3) removes that binding too, and nothing about a held-open
        // exchange implies it: the exchange's own binding is `{toolId, principalId}`, which says
        // nothing about which VERSION of the row the human was actually looking at. So this handler
        // re-reads and compares explicitly, in the same place `redeem()` used to run — right after
        // the human's answer arrives, before anything is written. `deletePost` itself has no
        // optimistic-concurrency check of its own (confirmed by reading it in full), so without this
        // an edit made while the dialog was open would go unnoticed.
        const current = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
        if (current && !isTrashed(current) && current.version !== existing.version) {
          throw new Error(
            `content_post_delete: the confirmation could not be honored (stale-entity-version). The ${kind} was edited ` +
              `after the confirmation dialog was shown. Nothing was deleted. Call content_post_delete again with ` +
              `{ id, kind } to raise a fresh dialog against the current version.`
          );
        }
        // A missing or already-trashed `current` is not handled specially here: `deletePost` below
        // performs its own fresh existence/trashed check and throws `PostNotFoundError`, the same
        // outcome this handler already produces for that case above.

        let priorPost: PostRecord | null = null;

        const { result } = await executeCommand<{ post: PostRecord }>({
          deps: postCommandDeps(routeDeps),
          command: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            // The human-approved summary, recorded verbatim, so the audit trail says what was
            // actually consented to rather than what the agent asked for. Built from `existing`
            // (the same read the dialog was shown from) rather than anything the delivered answer
            // carries — the human never sends a summary, only a decision.
            summary: `Agent delete (human-confirmed): Delete ${existing.kind} '${existing.title}' (${existing.slug})`,
            permission: "content.write",
          },
          mutation: {
            entityType: "post",
            entityId: id,
            operation: "delete",
            captureInverse: async () => {
              priorPost = existing;
              // The whole inverse of a soft delete is "clear the marker" — see
              // `core/commands/appliers.ts`'s `postDeleteReverter`.
              return { deletedAt: null };
            },
            execute: () =>
              deletePost({
                deps: { repo: routeDeps.postRepo, clock: routeDeps.clock, outbox: routeDeps.outbox },
                input: { workspaceId: routeDeps.workspaceId, id },
              }),
            captureEntityVersion: (r) => r.post.version,
            rollback: async () => {
              if (priorPost) await routeDeps.postRepo.save(priorPost);
            },
          },
        });

        // Drains deletePost's entry.unpublished event (published rows only) to SEO's sitemap-cache
        // invalidation subscriber — the same inline drain content_post_update and the routes perform.
        await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

        return { deleted: true, cancelled: false, post: toPostToolView(result.post) };
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },
  };

  // No `unwiredToolIds`: Posts/Pages wires its ENTIRE catalog, same tripwire discipline as
  // Forms/Entries/Widgets — a 7th catalog entry added without a handler fails the build.
  return buildDomainRegistrations({
    domain: "post",
    catalogModule: "features/post/agent-tools.ts",
    catalog: CATALOG_BY_ID as ReadonlyMap<string, PostAgentToolDefinition>,
    handlers,
    derivedRisk: postDerivedRisk,
  });
}

// 2026-08-17: Post was briefly converted to the tool-contribution registry (`contributePostTools`,
// registered via `#src/assistant/index`'s `registerToolContributor`) alongside Comments/Newsletter,
// then reverted the same night — `check:architecture --list` showed it opened a NEW, larger module
// cycle: `assistant -> widgets` (still a static `DOMAIN_SLICES` import) + `widgets ->
// features/post` (`widgets/resolver-service.ts` imports `findPublishedPostById`) +
// `features/post -> assistant` (the reverted edge) closed a 3-cycle that pulled `export`,
// `features/deployments`, `features/source-control`, and `features/vendor-credentials` into one
// 7-module SCC — worse than the 4-module one this registry exists to remove. Unlike Comments/
// Newsletter (which import nothing else and nothing else imports), Post is depended on by other
// modules (`widgets`, `export`), so it cannot convert safely until either those edges are relocated
// or the still-static `widgets`/`deployments`/`source-control`/`vendor-credentials` DOMAIN_SLICES
// entries above convert too.
//
// RETRIED 2026-08-17 (same day, later pass) after `widgets` (Stage 2 batch 2) and `source-control`
// (this same later pass) both converted off `DOMAIN_SLICES`. Empirically wired
// `registerToolContributor` here and ran `check:architecture --list`: the `widgets`/`source-control`
// half of the original 7-module SCC is gone, but a NEW, smaller one remains — `[assistant, export,
// features/deployments, features/post, features/vendor-credentials]` (5 modules; "module cycles
// (mutual pairs)" read 1, "largest strongly-connected component" grew 0 -> 5, which
// `check-architecture.ts`'s own gate treats as a regression on the combined "module cycles / SCC"
// hard-constraint metric regardless of the mutual-pairs count). This is the SAME cluster that blocks
// `deployments`/`static-publish` (a previously-undocumented `features/vendor-credentials/store.ts`
// value import of `extractGitHubLogin` from `features/deployments/static-publish/index.ts` — see
// `features/deployments/tool-registrations.ts`'s own header) and `themes` (same cluster, `export`
// depends on both `features/theme` and, transitively via this domain, `features/post`). The exact
// edge chain linking `export`/`features/post` into this cluster was not fully re-traced beyond
// confirming the SCC membership above — out of scope for this dispatch. Reverted cleanly instead;
// still needs `deployments`'s own blocker fixed first (Option-B-style injection of
// `extractGitHubLogin` into `store.ts`) before a future retry has a chance.
//
// RETRIED 2026-08-17 (same session, later pass) after `deployments`/`static-publish` (the
// `vendor-credentials/store.ts` `extractGitHubLogin` fix) AND `themes` all converted off
// `DOMAIN_SLICES` — the exact fix the paragraph above called for, plus one more. That cleared the
// 5-module `[assistant, export, features/deployments, features/post, features/vendor-credentials]`
// cluster (confirmed: with `themes` converted the same way and its own SCC landing at 0, the shared
// `export` path was genuinely gone). But `check:architecture --list` still found a NEW, SMALLER
// cycle after wiring `registerToolContributor` here: `[assistant, features/post]` (2 modules; largest
// strongly-connected component 0 -> 2) — a previously-undocumented edge unrelated to the
// `export`/`vendor-credentials` cluster entirely. Root cause: `assistant/site/tools.ts` and
// `assistant/site/client-directives.ts` (the Site Assistant's own public/visitor-facing runtime, see
// `assistant/index.ts`'s "Section A" header) both value-import `listPublishedPosts` from
// `../../features/post` — a genuine, load-bearing dependency (the same predicate
// `routes/site/pages.ts` uses to resolve a slug into a live page), not a grep-visible import INTO
// `tool-registrations.ts` itself. `check:architecture`'s module graph is per-directory: `assistant`
// is ONE module spanning every file under `src/assistant/`, so this edge exists independent of
// anything `tool-registrations.ts` does, and `features/post -> assistant` (this file's own
// `registerToolContributor` call) closes the cycle directly against it — no chain through `export`
// or `vendor-credentials` required this time. Reverted cleanly instead. Safe conversion needs
// `listPublishedPosts` either relocated off `features/post`'s barrel into something `assistant/site/`
// can depend on without closing this loop, or injected into `assistant/site/tools.ts`/
// `client-directives.ts` the same Option-B-style way `vendor-credentials/store.ts` now takes
// `extractGitHubLogin` — not attempted here, new design work beyond this dispatch's scope (execute
// the recommended fix, don't re-litigate/extend the design).
//
// RETRIED AND LANDED HERE (2026-08-17, same day, final pass) after a Software Architect investigation
// (`ADS-memory/reports/architecture/2026-08-17-post-listpublishedposts-design-options.md`) confirmed
// the exact edge the paragraph above named and recommended Option A: inject `listPublishedPosts` into
// `assistant/site/tools.ts`'s `SiteAssistantToolDeps` and `assistant/site/client-directives.ts`'s
// `resolvePublicTarget` deps, both typed with a locally-declared structural `ListPublishedPosts`
// signature rather than an imported function type, and wire the real `features/post` function in
// ONLY at the one production composition root, `server/modules/site-assistant.ts`. That removed both
// value-import edges closing the cycle while leaving the actual function called at runtime
// byte-identical — the same Option-B-style technique `vendor-credentials/store.ts`'s
// `extractGitHubLogin` and `dual-read.ts`'s legacy-table imports already used. That report's Option B
// (moving `listPublishedPosts` itself out of `features/post`) and Option C (pushing the filter into
// `PostRepoPort`) were both considered and rejected — see its §4/§5. Rejecting Option C matters
// specifically: this codebase already tried pushing the predicate into the port layer once (the old
// `entries`/`EntryListPort` model `tools.ts` used before) and moved deliberately away from it, so
// reopening that shape to solve a graph-shape problem would trade a solved correctness risk for
// convenience — see `tools.ts`'s own header. `check:architecture --list` confirms 0 module cycles /
// largest SCC 0 with `post` wired this way — the last of the 25-domain rollout to convert. No
// production `assistant/site/*` file value-imports `features/post` anymore; both keep only their
// `import type` lines.
export function contributePostTools(): void {
  registerToolContributor({ domain: "post", build: buildPostRegistrations, risk: postDerivedRisk });
}
