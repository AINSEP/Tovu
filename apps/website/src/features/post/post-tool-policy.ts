import { isDeepStrictEqual } from "node:util";
import { indexCatalogById } from "@jini-ai/core";
import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import { postPublicPath } from "#src/platform/routing/index";
import { executeCommand } from "@jini-ai/cms/core/commands";
import { processOutbox } from "#src/contracts/core/events/outbox-worker";
import { withPluginHookRefusals } from "@jini-ai/plugins/host/hook-refusals";
import { findMediaByIdOrSlug } from "@jini-ai/cms/media";
import { postAgentToolCatalog } from "./post-catalog-host.js";
import { headerNavigationView, postToolViewDeps } from "./post-tool-view-deps.js";
import { readPostTemplateOptions } from "./template-options.js";

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
 *
 * `publicUrl` (2026-08-30, closing a real capability gap surfaced by a production transcript —
 * `sites/tovu-com/content.db`, `ai_chat_messages` rowid 427): the agent had no tool that told it
 * where a post/page it just read or created is actually reachable on the live site, and fell back
 * to grepping route source to reverse-engineer the URL pattern. `content_post_get`/`content_post_list`/
 * `content_post_create` now resolve it through {@link resolvePublicUrl}, which calls
 * `platform/routing`'s {@link entryPublicPath} — the pure per-record half of the SAME `urlFor`
 * inverse resolver `routes/site/pages.ts`'s `buildExtraHead` already treats as the one source of
 * truth for a post's live path (SEO's canonical tag, menu active state); `urlFor`'s own
 * `resolveEntryRefTarget` calls this identical function after its `postRepo.findById`, so a caller
 * resolving from an id and a caller resolving from an already-held `PostRecord` (this file's own
 * case — the row is already sitting in the loop variable) always agree. Deliberately NOT added to
 * `content_post_update`/`content_post_delete`'s existing `toPostToolView(...)` call sites: those
 * return the row incidentally (to confirm what was just written/deleted/cancelled), not to answer
 * "where does this live", so there is no reason to pay for the extra resolution there — hence the
 * separate {@link PostToolViewWithPublicUrl}/{@link toPostToolViewWithPublicUrl} rather than
 * widening the shared `PostToolView`/`toPostToolView`.
 *
 * `content_post_list` scale (2026-08-30, H3): `resolvePublicUrl` used to call `urlFor` per row,
 * which re-fetched the exact record the list loop already held (an O(n) `postRepo.findById` fan-out
 * on top of the O(1) `postRepo.list()` that already produced every row) — see {@link entryPublicPath}
 * above for the fix. `content_post_list` also now caps its output at {@link DEFAULT_POST_LIST_LIMIT}
 * (raisable up to {@link MAX_POST_LIST_LIMIT} via the `limit` input) with `total`/`hasMore` in the
 * response, so a large workspace can no longer flood the agent's context with every row, and
 * truncation is never silent.
 */
export const POST_TOOL_HOST = {
  reservedSegments: RESERVED_SEGMENTS, postPublicPath, isDeepStrictEqual,
  contentReadPermission: "content.read", contentWritePermission: "content.write", assistantActorPluginId: "assistant",
  catalog: indexCatalogById({ catalog: postAgentToolCatalog }), executeCommand, processOutbox, withPluginHookRefusals,
  postToolViewDeps, headerNavigationView, readPostTemplateOptions, findMediaByIdOrSlug,
  featuredImageRefusals: {
    missing: ({ ref }: { ref: string }, _optional = {}) => `featuredImage: no media asset has the id or slug '${ref}'. Find one with content_read.media_asset, or upload one first.`,
    trashed: ({ ref }: { ref: string }, _optional = {}) => `featuredImage: media asset '${ref}' is in Trash. Restore it first, or pick another image.`,
    "not-image": ({ ref }: { ref: string }, { contentType }: { contentType?: string } = {}) => `featuredImage: media asset '${ref}' is ${contentType ?? "not an image"}, not an image. A featured image must be an image.`,
  },
};
