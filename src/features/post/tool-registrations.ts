/**
 * @file Posts + Pages' half of ADR-049 Decision 4: maps `agent-tools.ts`'s 4 catalog entries onto
 * `post.ts`'s `createPost`/`updatePost`/`listAdminPosts`/`listAdminPages`/`getAdminPostById`, as
 * `ToolRegistration`s.
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
 * precedent.
 */
import {
  AGENT_TOOL_PRINCIPAL_KIND,
  buildDomainRegistrations,
  indexCatalogById,
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
} from "../../assistant/tool-registration-kit";
import { executeCommand } from "../../core/commands";
import { processOutbox } from "../../core/events";
import type { JsonObject } from "../../core/ports";
import type { RouteDeps } from "../../server/routes/types";
import { postAgentToolCatalog, type AgentToolDefinition as PostAgentToolDefinition } from "./agent-tools";
import {
  createPost,
  getAdminPostById,
  listAdminPages,
  listAdminPosts,
  updatePost,
  PostNotFoundError,
  PostValidationError,
  type PostKind,
  type PostRecord,
  type PostStatus,
} from "./post";

const CATALOG_BY_ID = indexCatalogById(postAgentToolCatalog);

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const postDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> listAdminPosts/listAdminPages (post.ts): postRepo.list() only, no write.
  ["content_post_list", "none"],
  // -> getAdminPostById (post.ts): postRepo.findById() only, no write.
  ["content_post_get", "none"],
  // -> executeCommand -> createPost (post.ts): postRepo.save() + change-set record.
  ["content_post_create", "mutates-durable-state"],
  // -> executeCommand -> updatePost (post.ts): postRepo.save() + change-set record, plus an
  //    outbox-drained entry.published/entry.updated/entry.unpublished event on a status transition.
  ["content_post_update", "mutates-durable-state"],
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
function postCommandDeps(routeDeps: RouteDeps) {
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

export function buildPostRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
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
  };

  // No `unwiredToolIds`: Posts/Pages wires its ENTIRE catalog, same tripwire discipline as
  // Forms/Entries/Widgets — a 5th catalog entry added without a handler fails the build.
  return buildDomainRegistrations({
    domain: "post",
    catalogModule: "features/post/agent-tools.ts",
    catalog: CATALOG_BY_ID as ReadonlyMap<string, PostAgentToolDefinition>,
    handlers,
    derivedRisk: postDerivedRisk,
  });
}
