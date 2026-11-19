import { updatePost } from "./post-update.js";
import { restorePostForward, deletePost } from "./post-trash.js";
import { getAdminPostById, listAdminPosts } from "./post-read.js";
import { normalizeShowPostAuthor, normalizePostAuthor } from "./post-write-fields.js";
import { createPost } from "./post-create.js";
import { toolMetadata } from '../../contracts/core/tool-metadata/post.js';
import { AGENT_TOOL_PRINCIPAL_KIND, buildDomainRegistrations, optionalBoolean, optionalNumber, optionalString, requireInputRecord, requireString, withSchemaOnRejection, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { type JsonObject } from "@jini-ai/core/primitives";
// Sourced from `assistant/` — an explicitly out-of-scope back-edge for this pass (see the dispatch
// notes this file's narrowing was reported under), not a field this file could re-source from a
// domain-owned port: the MCP-UI/exchange transport is genuinely assistant-owned.
import { type AgentToolDefinition as PostAgentToolDefinition, type ToolContributor } from "@jini-ai/core";
import { type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { adaptLegacyAuthorize, requireToolPermission, type PostStatus } from "@jini-ai/cms/core";
import { withPluginHookRefusals } from "../../contracts/core/plugin-hook-failed-error.js";
import { withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import { executeCommand } from "../../contracts/core/commands/index.js";
import { processOutbox } from "../../contracts/core/events/index.js";
import { PostNotFoundError, type PostRecord } from "./post.js";
// The SAME boundary `server/inbound/admin-http/routes/posts/update.ts` uses — imported, not copied.
// The two arms diverged in the first place because only one of them had this logic at all.
import { parseExpectedVersion } from "./expected-version.js";
import { searchAdminPosts } from "./search.js";
import { CONTENT_READ_PERMISSION, CONTENT_WRITE_PERMISSION, CATALOG_BY_ID, ASSISTANT_ACTOR_PLUGIN_ID, postCommandDeps, postDerivedRisk } from "./post-tool-policy.js";
import { isPostShapeRejection, POST_MODEL_FACING_ERRORS } from "./post-tool-errors.js";
import { requirePostKind, optionalPostStatus, requireBodyJson, optionalPublishAt, resolveFeaturedImageInput } from "./post-tool-input.js";
import { toPostToolView, toPostToolViewWithPublicUrl, toPostWriteResultView, headerNavigationView } from "./post-tool-views.js";
import { clampPostListLimit, optionalPostListFields, matchesPostListFilters, projectPostListRow, toPostListRow, excerptCharsFor } from "./post-tool-list.js";
import { loadDeletablePost, assertFreshVersion } from "./post-tool-delete.js";
import { parseUpdatePatch, assertPatchNotEmpty, loadUpdateTarget, assertTemplateAvailable, mergeUpdatePatch, isPartialPatch, assertHtmlBodyUnchanged, updateInverse } from "./post-tool-update.js";
import type { PostToolDeps } from "./post-tool-deps.js";

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
      const input = requireInputRecord({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: CONTENT_READ_PERMISSION }, { entityType: "post" });

      return withSchemaOnRejection({ toolId: "content_post_search", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isPostShapeRejection({ error }), fn: async () => {
        const query = requireString({ input: input, key: "query" });
        const kind = input.kind !== undefined ? requirePostKind(input) : undefined;
        const status = optionalPostStatus(input);
        const limit = optionalNumber({ input: input, key: "limit" });

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
      } });
    },

    /**
     * Reads the existing workspace inventory, filters before limit and optionally projects rows.
     * Permission and selector failures are ToolInputError or the existing permission refusal.
     * One repository list call; no writes or per-row repository reads. Inventory remains unbounded
     * at the repository, while the returned rows are capped at MAX_POST_LIST_LIMIT.
     * @complexity O(n * s + b + f) time and O(n + b + f) space: n loaded rows, s title/slug length,
     * b returned body text and f requested projection keys across returned rows.
     */
    content_post_list: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: CONTENT_READ_PERMISSION }, { entityType: "post" });

      const kind = input.kind === undefined ? undefined : requirePostKind(input);
      const limit = clampPostListLimit({ limit: optionalNumber({ input: input, key: "limit" }) });
      const includeBody = optionalBoolean({ input: input, key: "includeBody" }) === true;
      const query = optionalString({ input: input, key: "query" })?.toLowerCase();
      const status = optionalPostStatus(input);
      const fields = optionalPostListFields({ input });
      const { posts: allPosts } = await listAdminPosts(
        { deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId } },
        { kind: kind ?? "all" },
      );

      // The repository already loads the full workspace. Filter before the output cap so matches
      // beyond its first page remain reachable and total/hasMore describe the filtered inventory.
      const filteredPosts = allPosts.filter((post) => matchesPostListFilters(post, { query, status }));
      const total = filteredPosts.length;
      const posts = filteredPosts.slice(0, limit);
      return {
        posts: posts.map((post) => {
          if (fields !== undefined) return projectPostListRow({ row: toPostListRow({ routeDeps, post, excerptChars: excerptCharsFor({ rowCount: posts.length }) }), fields });
          return includeBody ? toPostToolViewWithPublicUrl(routeDeps, post) : toPostListRow({ routeDeps, post, excerptChars: excerptCharsFor({ rowCount: posts.length }) });
        }),
        total,
        hasMore: total > posts.length,
      };
    },

    content_post_get: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const id = requireString({ input: input, key: "id" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: CONTENT_READ_PERMISSION }, { entityType: "post", entityId: id });

      const kind = input.kind === undefined ? undefined : requirePostKind(input);
      const { post } = await getAdminPostById({ deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId, id } });

      // Disclosed asymmetry (agent-tools.ts's own header): kind:"page" is guarded exactly like
      // pages/get-by-id.ts (a kind mismatch 404s identically to not-found); kind:"post" is NOT
      // guarded, exactly like posts/get-by-id.ts's own legacy, kind-blind lookup.
      if (kind === "page" && post.kind !== "page") {
        throw new PostNotFoundError(`page '${id}' was not found`);
      }

      return { post: toPostToolViewWithPublicUrl(routeDeps, post) };
    },

    content_post_create: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      return withSchemaOnRejection({ toolId: "content_post_create", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isPostShapeRejection({ error }), fn: async () => {
        const kind = input.kind === undefined ? "post" : requirePostKind(input);
        const title = requireString({ input: input, key: "title" });
        const slug = optionalString({ input: input, key: "slug" });
        const bodyJson = input.bodyJson !== undefined ? requireBodyJson({ input, key: "bodyJson" }) : undefined;
        const status = optionalPostStatus(input);
        const author = input.author === undefined ? undefined : normalizePostAuthor({ author: input.author });
        const showAuthor = normalizeShowPostAuthor({ showAuthor: input.showAuthor });
        const publishAt = optionalPublishAt(input);
        const featuredMediaId = await resolveFeaturedImageInput(routeDeps, input);
        const postId = routeDeps.idGen.newId();

        ctx.signal.throwIfAborted();
        const { result } = await executeCommand<{ post: PostRecord }>({
          deps: postCommandDeps(routeDeps),
          command: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            summary: `Agent create ${kind} '${title}'`,
            permission: CONTENT_WRITE_PERMISSION,
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
                  outbox: routeDeps.outbox,
                  authorAccounts: routeDeps.userRepo,
                },
                input: {
                  workspaceId: routeDeps.workspaceId,
                  id: postId,
                  title,
                  kind,
                  slug,
                  bodyJson,
                  status,
                  publishAt,
                  featuredMediaId,
                  author,
                  showAuthor,
                  actorId: ctx.principal.id,
                  analyticsSource: "assistant",
                  // Every `tool-registrations.ts` handler is, by definition, reached only via
                  // `@jini-ai/daemon`'s agent-run path (see `AGENT_TOOL_PRINCIPAL_KIND`'s own doc
                  // in `@jini-ai/cms/core` — `ctx.principal.id` is already the real human's id here,
                  // the same id a direct admin-UI edit would carry). Stamping delegatedBy* is what
                  // makes an agent-run write distinguishable from a direct one in `post_revisions`,
                  // since `actorId` alone is identical either way.
                  delegatedByWorkspaceId: routeDeps.workspaceId,
                  delegatedById: ctx.principal.id,
                },
              }),
            captureEntityVersion: ({ result }) => result.post.version,
            // A failed record must undo the create, including its revision and reserved slug.
            rollback: () => routeDeps.postRepo.hardDelete({ workspaceId: routeDeps.workspaceId, id: postId }),
          },
        });

        // Mirrors content_post_update's identical inline processOutbox call below — an agent
        // creating directly as `status: "published"` (the tool's own documented usage) now
        // enqueues `entry.published` (`createPost`'s `deps.outbox` doc); drained here so SEO's
        // sitemap-cache invalidation subscriber sees it without waiting for the serving process's
        // background drainer. On the BYOK path (serving process) this delivers at once; in the agent
        // daemon the outbox is enqueue-only, so this claims nothing and that drainer delivers instead
        // (`agent daemon outbox`).
        await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

        return { post: toPostWriteResultView(routeDeps, result.post), ...headerNavigationView({ kind }) };
      } });
    },

    content_post_update: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      return withSchemaOnRejection({ toolId: "content_post_update", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isPostShapeRejection({ error }), fn: async () => {
        const id = requireString({ input: input, key: "id" });
        const kind = input.kind === undefined ? undefined : requirePostKind(input);
        // S7 (fix-plan-tool-design-2026-09-24.md) — a PARTIAL patch: each of these four is now
        // independently optional. An omitted one is filled from the stored row inside
        // `captureInverse` below (the one place this handler already reads `existing`), not here —
        // a present-but-invalid value still rejects with the exact same message it always did.
        const patch = parseUpdatePatch(input);
        const { author, showAuthor, templateChoice, publishAt } = patch;
        const featuredMediaId = await resolveFeaturedImageInput(routeDeps, input);
        assertPatchNotEmpty({ patch, featuredMediaId });
        // Validated, not cast — see `expected-version.ts`. `expectedVersion` is optional on
        // `UpdatePostInput`, so anything this handler failed to recognize would coerce to "no basis
        // sent" and be written through as an unguarded save, re-opening the very clobber the guard
        // closes. `PostValidationError` reaches `withSchemaOnRejection` above, which turns it into a
        // schema-decorated `ToolInputError` — a 400 the model can act on, not a silent downgrade.
        const expectedVersion = parseExpectedVersion({ raw: input.expectedVersion });

        // Captured by `captureInverse` below, reused verbatim by `rollback` — mirrors
        // `posts/update.ts`/`pages/update.ts`'s identical unit-of-work compensation.
        // `priorPost` and `merged` are declared without an initializer, so neither reader needs a
        // null guard: `core/commands`'s `executeCommand` always awaits `captureInverse` first and
        // calls `execute` only once it returned, and calls `rollback` only after `execute`
        // succeeded — so both are always set by the time `execute`/`rollback` read them.
        let priorPost: PostRecord;
        // The merged, fully-populated values `execute` below actually sends to `updatePost` — set
        // inside `captureInverse`, the only place `existing` (the fill-in source for an omitted
        // field) is available. `basisVersion` starts as whatever the caller sent and is upgraded to
        // `existing.version` there too, but ONLY for a partial patch with no caller-sent
        // `expectedVersion` — see that comment for why a full four-field call must NOT gain a basis
        // it never asked for.
        let merged: { title: string; slug: string; bodyJson: JsonObject; status: PostStatus };
        let basisVersion = expectedVersion;

        ctx.signal.throwIfAborted();
        const { result } = await executeCommand<{ post: PostRecord }>({
          deps: postCommandDeps(routeDeps),
          command: {
            workspaceId: routeDeps.workspaceId,
            actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
            summary: `Agent update ${kind ?? "content"} '${id}'`,
            permission: CONTENT_WRITE_PERMISSION,
          },
          mutation: {
            entityType: "post",
            entityId: id,
            operation: "update",
            captureInverse: async () => {
              const existing = await loadUpdateTarget({ routeDeps, id, kind });
              await assertTemplateAvailable({ routeDeps, templateChoice, kind: existing.kind });
              // S7 — fill every field the caller omitted from the stored row. This runs BEFORE the
              // html-body guard just below on purpose: an omitted `bodyJson` must merge in as
              // `existing.bodyJson` itself, so a title-only patch on an html Page compares equal
              // to itself and sails through that guard rather than being misread as a body change
              // it never made.
              merged = mergeUpdatePatch({ patch, existing });
              // A partial patch (any of the four omitted) is a read-then-write on a basis the
              // caller did NOT necessarily pin with its own `expectedVersion`. Filling the gap from
              // `existing` and then writing unconditionally would silently clobber a human's save
              // landing between this read and `updatePost`'s write — so pin it to the row's own
              // version instead, exactly as if the caller had sent it. `updatePost`'s own
              // `assertExpectedVersion`/`saveIfVersion` CAS (already wired) does the actual
              // enforcement; this only supplies the basis for a caller who left it out. A FULL
              // four-field call is unaffected: `basisVersion` stays whatever the caller sent (or
              // `undefined`), the same opt-in last-write-wins behavior as before this slice.
              if (isPartialPatch(patch) && expectedVersion === undefined) {
                basisVersion = existing.version;
              }
              // S3 — see assertHtmlBodyUnchanged's doc for why an html Page refuses a changed bodyJson.
              assertHtmlBodyUnchanged({ id, existing, bodyJson: merged.bodyJson });
              priorPost = existing;
              return updateInverse({ existing, templateChoice });
            },
            execute: () => {
              // `captureInverse` above always runs first (per `core/commands`'s own contract) and
              // either throws or sets `merged` — see the declarations above.
              return updatePost({
                deps: {
                  repo: routeDeps.postRepo,
                  clock: routeDeps.clock,
                  outbox: routeDeps.outbox,
                  beforeSaveHook: routeDeps.pluginBeforeSaveHook,
                  slugChangeCapture: routeDeps.slugChangeCapture,
                },
                // `title`/`slug`/`bodyJson`/`status` are the MERGED values (the caller's own field,
                // or the stored one for an omitted field) — never the raw, possibly-partial input.
                // `basisVersion` is `expectedVersion` forwarded exactly the way `posts/update.ts`
                // forwards it, EXCEPT for a partial patch with no caller-sent `expectedVersion`,
                // where `captureInverse` above upgraded it to `existing.version` so the merge stays
                // atomic. `undefined` (a full four-field call, caller sent nothing) is still what
                // keeps the guard opt-in, so that caller keeps the original last-write-wins save.
                input: {
                  workspaceId: routeDeps.workspaceId,
                  id,
                  title: merged.title,
                  slug: merged.slug,
                  bodyJson: merged.bodyJson,
                  status: merged.status,
                  publishAt,
                  featuredMediaId,
                  author,
                  showAuthor,
                  expectedVersion: basisVersion,
                  templateChoice,
                  actorId: ctx.principal.id,
                  analyticsSource: "assistant",
                  // See content_post_create's identical delegatedBy* comment just above.
                  delegatedByWorkspaceId: routeDeps.workspaceId,
                  delegatedById: ctx.principal.id,
                },
              });
            },
            captureEntityVersion: ({ result }) => result.post.version,
            rollback: async () => {
              await restorePostForward({
                deps: {
                  repo: routeDeps.postRepo,
                  clock: routeDeps.clock,
                  outbox: routeDeps.outbox,
                  forgetRemoved: routeDeps.forgetRemovedPost,
                },
                input: {
                  prior: priorPost,
                  actorId: ctx.principal.id,
                  // Same delegatedBy* attribution the forward write above records.
                  delegatedByWorkspaceId: routeDeps.workspaceId,
                  delegatedById: ctx.principal.id,
                },
              });
            },
          },
        });

        // Mirrors posts/update.ts's/pages/update.ts's identical inline processOutbox call — drains
        // updatePost's entry.published/entry.updated/entry.unpublished event (if any) to SEO's
        // sitemap-cache invalidation subscriber at once. In the agent daemon the outbox is
        // enqueue-only, so this claims nothing and the serving process's background drainer
        // delivers instead (`agent daemon outbox`).
        await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

        return { post: toPostWriteResultView(routeDeps, result.post) };
      } });
    },

    /** Domain execution after the shared approval policy asks the human.
     * Permission and version checks still apply here; the registration composition owns the card. */
    content_post_delete: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const id = requireString({ input: input, key: "id" });
      const requestedKind = input.kind === undefined ? undefined : requirePostKind(input);

      // Gated exactly like content_post_get, and performed before opening anything so a caller with
      // no read access learns nothing and never causes a dialog to be raised.
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: CONTENT_READ_PERMISSION }, { entityType: "post", entityId: id });

      // Kind guard applied inside the loader rather than in `deletePost`, mirroring `pages/delete.ts`/
      // `pages/update.ts` — and carrying the same disclosed asymmetry the rest of this catalog has:
      // kind:'page' rejects an actual 'post' row, kind:'post' is not guarded the other way.
      // A trashed row is not-found too (post.ts's own rule), so a second delete cannot "succeed".
      const existing = await loadDeletablePost({ routeDeps, id }, { kind: requestedKind });
      const kind = requestedKind ?? existing.kind;

      // Keep the version check before the reversible removal.
      const current = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
      assertFreshVersion({ current, existing, kind });

      ctx.signal.throwIfAborted();
      const { result } = await executeCommand<{ post: PostRecord }>({
        deps: postCommandDeps(routeDeps),
        command: {
          workspaceId: routeDeps.workspaceId,
          actor: { id: ctx.principal.id, kind: AGENT_TOOL_PRINCIPAL_KIND },
          // Attribute the reversible removal to the agent and the row read for this operation.
          summary: `Agent trash: Delete ${existing.kind} '${existing.title}' (${existing.slug})`,
          permission: CONTENT_WRITE_PERMISSION,
        },
        mutation: {
          entityType: "post",
          entityId: id,
          operation: "delete",
          captureInverse: async () => {
            // The whole inverse of a soft delete is "clear the marker" — see
            // `core/commands/appliers.ts`'s `postDeleteReverter`.
            return { deletedAt: null };
          },
          execute: () =>
            deletePost({
              deps: { repo: routeDeps.postRepo, clock: routeDeps.clock, outbox: routeDeps.outbox, remove: routeDeps.removePost },
              input: {
                workspaceId: routeDeps.workspaceId,
                id,
                actorId: ctx.principal.id,
                actorPluginId: ASSISTANT_ACTOR_PLUGIN_ID,
                // See content_post_create's identical delegatedBy* comment above.
                delegatedByWorkspaceId: routeDeps.workspaceId,
                delegatedById: ctx.principal.id,
              },
            }),
          captureEntityVersion: ({ result }) => result.post.version,
          // Restores the row read above: `existing` is the pre-image, and `rollback` only runs after
          // `execute` trashed it.
          rollback: async () => {
            await restorePostForward({
              deps: {
                repo: routeDeps.postRepo,
                clock: routeDeps.clock,
                outbox: routeDeps.outbox,
                forgetRemoved: routeDeps.forgetRemovedPost,
              },
              input: {
                prior: existing,
                actorId: ctx.principal.id,
                // Same delegatedBy* attribution the forward write above records.
                delegatedByWorkspaceId: routeDeps.workspaceId,
                delegatedById: ctx.principal.id,
              },
            });
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
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "post",
    catalogModule: "features/post/agent-tools.ts",
    catalog: CATALOG_BY_ID as ReadonlyMap<string, PostAgentToolDefinition>,
    // The whole map at once, so no handler can be the one that forgot — which is precisely what
    // happened here before: `toModelFacingUpdateError` was correct and wired into `content_post_update`
    // alone while its five siblings sent the same classes straight into the SEC-005 redactor.
    // Composes with the three handlers' inner `withSchemaOnRejection` rather than competing with it:
    // a shape rejection is already a `ToolInputError` by the time it arrives, and
    // `reclassifyToolError` returns those untouched. The inner `withPluginHookRefusals` turns a
    // plugin save-hook refusal into a fixed `PLUGIN_HOOK_FAILED` message naming the plugin before
    // the ladder sees it — that message needs the plugin id, which a fixed-message rule can't carry.
    handlers: withModelFacingErrors({ handlers: withPluginHookRefusals(handlers), rules: POST_MODEL_FACING_ERRORS }),
    derivedRisk: postDerivedRisk,
  });
}

// The composition root installs this contributor. Assistant site tools receive listPublishedPosts
// through structural, type-only ports: a feature-to-assistant registration value import would close
// a cycle against the site's post reader. Keep the published-post predicate with its domain owner;
// moving it into PostRepoPort would trade a correctness boundary for a dependency-graph shortcut.
export function contributePostTools(): ToolContributor<PostToolDeps, AssistantSurfaceDeps> {
  return { domain: "post", build: buildPostRegistrations, risk: postDerivedRisk };
}
