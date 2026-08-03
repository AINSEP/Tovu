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
// Both stay sourced from `assistant/` — explicitly out-of-scope back-edges for this pass (see the
// dispatch notes this file's narrowing was reported under), not fields this file could re-source
// from a domain-owned port: the MCP-UI confirmation protocol is genuinely assistant-owned.
import {
  createPendingConfirmationStore,
  type PendingConfirmationStore,
} from "../../assistant/pending-confirmations";
import { buildUIToolResult } from "../../assistant/mcp-ui";
import { executeCommand, type AuthorizeFn, type ChangeSetRepoPort } from "../../core/commands";
import { processOutbox } from "../../core/events";
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
  //    than read off the catalog. Note this entry describes the SECOND (redeemed) call; the first
  //    call mints a confirmation token and writes nothing, so the classification here is the
  //    strictly worse of the two branches, which is the conservative direction.
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
 * @param options.confirmations - The pending-confirmation store backing `content_post_delete`'s
 * MCP-UI gate. Defaults to a fresh in-process store, which is the right lifetime in production:
 * `buildAssistantToolRegistrations` runs ONCE at daemon boot (`agent-daemon-server.ts`), so the
 * closure below spans every tool call the daemon serves and a token minted by call 1 is redeemable
 * by call 2. Injectable so a test can drive the clock and the token source instead of waiting out a
 * real TTL or guessing 256 bits of entropy.
 */
export function buildPostRegistrations(
  routeDeps: PostToolDeps,
  options: { confirmations?: PendingConfirmationStore } = {}
): ToolRegistration[] {
  const confirmations = options.confirmations ?? createPendingConfirmationStore();

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
                deps: { repo: routeDeps.postRepo, clock: routeDeps.clock },
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
                deps: { repo: routeDeps.postRepo, clock: routeDeps.clock, outbox: routeDeps.outbox },
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
     * The MCP-UI-gated delete. See `delete-confirmation-ui.ts` for the protocol end to end and
     * `assistant/pending-confirmations.ts` for why a token, not
     * `descriptor.requiresConfirmation`, is the mechanism.
     *
     * Two branches, chosen by whether the call carries a `confirmationToken`:
     *  - WITHOUT one (what the agent can do): resolve and describe the row, mint a token, return an
     *    MCP-UI resource. Writes nothing.
     *  - WITH one (what only the rendered dialog can do): redeem, then delete through the command
     *    gateway.
     */
    content_post_delete: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");
      const kind = requirePostKind(input);
      const suppliedToken = optionalString(input, "confirmationToken");

      // The read that both branches need, gated exactly like content_post_get. Performed before
      // minting so a caller with no read access learns nothing, and before redeeming so a delete
      // never runs against a row the principal cannot see.
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

      // ---- Step 1: no token supplied — render the confirmation UI and STOP. ----
      if (suppliedToken === undefined) {
        const { token } = confirmations.mint({
          toolId: CONTENT_POST_DELETE_TOOL_ID,
          workspaceId: routeDeps.workspaceId,
          principalId: ctx.principal.id,
          entityType: "post",
          entityId: existing.id,
          entityVersion: existing.version,
          summary: `Delete ${existing.kind} '${existing.title}' (${existing.slug})`,
        });

        const ui = buildDeleteConfirmationResource({
          subject: {
            id: existing.id,
            kind: existing.kind,
            title: existing.title,
            slug: existing.slug,
            status: existing.status,
            version: existing.version,
          },
          confirmationToken: token,
        });

        // `token` appears in `ui` and NOWHERE in `modelText`. That split is the security boundary —
        // the host renders the UI for the human and does not feed its HTML to the model, so this is
        // what stops the agent from completing step 2 by itself. Do not add the token, or any
        // derivative of it, to this string, to `_meta`, or to an error message.
        return buildUIToolResult({
          modelText:
            `A confirmation dialog has been shown to the user asking whether to delete the ${existing.kind} ` +
            `'${existing.title}' (${existing.slug}). NOTHING HAS BEEN DELETED. The deletion will happen only if the ` +
            `user approves in that dialog, which sends the confirmation itself. You cannot complete this yourself and ` +
            `must not try: re-calling this tool will only raise a second dialog. Tell the user the dialog is open and wait.`,
          ui,
        });
      }

      // ---- Step 2: a token was supplied — it can only have come from the rendered dialog. ----
      const decision = optionalString(input, "decision") ?? "confirm";
      const redeemed = confirmations.redeem({
        token: suppliedToken,
        toolId: CONTENT_POST_DELETE_TOOL_ID,
        workspaceId: routeDeps.workspaceId,
        principalId: ctx.principal.id,
        entityType: "post",
        entityId: existing.id,
        entityVersion: existing.version,
      });

      if (!redeemed.ok) {
        // Fail closed, and say why in terms that do not help a caller probe: the remedy for every
        // rejection reason is identical (raise a fresh dialog), so the message is identical too.
        throw new Error(
          `content_post_delete: the confirmation could not be redeemed (${redeemed.reason}). ` +
            `Nothing was deleted. Call content_post_delete with only { id, kind } to raise a fresh confirmation dialog.`
        );
      }

      if (decision !== "confirm") {
        // The token has already been burned by `redeem` above, so a cancel genuinely closes the
        // window rather than leaving a live token behind for a later call to pick up.
        return { deleted: false, cancelled: true, post: toPostToolView(existing) };
      }

      let priorPost: PostRecord | null = null;

      const { result } = await executeCommand<{ post: PostRecord }>({
        deps: postCommandDeps(routeDeps),
        command: {
          workspaceId: routeDeps.workspaceId,
          actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
          // The human-approved summary, recorded verbatim, so the audit trail says what was
          // actually consented to rather than what the agent asked for.
          summary: `Agent delete (human-confirmed): ${redeemed.confirmation.summary}`,
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
