import type { PostToolViewDeps } from "@jini-ai/cms/posts/post-tool-views";
import { entryPublicPath } from "#src/platform/routing/index";
import { resolveRuntimeMode } from "../../contracts/core/runtime-mode.js";
import type { PostToolDeps } from "./tool-registrations.js";

/** `publishedWhere` on a published write result when this instance is a local copy, not the live site. */
export const PUBLISHED_WHERE_LOCAL =
  "Published on this local site only, not on the live site. Say it is published on this site, not that it is live. " +
  "publish_content_publish sends it to the live site.";

/** `publishedWhere` on a published write result when this instance IS the live site (`TOVU_RUNTIME_MODE=production`). */
export const PUBLISHED_WHERE_LIVE = "Published on the live site (this instance is the live site).";

/**
 * `headerNavigation` on a `content_post_create` result for a page. Demo 2026-11-02: after creating
 * pages the chat's final summary named header links the live header did not show — the theme header
 * renders the site menu (the starter's `menu-header-nav` marker), not the page list, and nothing the
 * model saw said so. Static: the result names where header links come from and the tools that read
 * and change them, rather than this domain reading menus it does not own.
 */
export const PAGE_HEADER_NAVIGATION =
  "This page is not added to the site header automatically: the header shows the site menu (Admin → Menus), not the list of pages. " +
  "To link it from the header, add it with menus_update_menu_tree. Read the rendered menu’s record with content_read.menu. Never infer its links from the pages you created.";

/** {@link PAGE_HEADER_NAVIGATION} for a created page; posts are listed by the theme, not header-linked. @complexity O(1). */
export function headerNavigationView({ kind }: { kind: string }, _options = {}): { headerNavigation?: string } {
  return kind === "page" ? { headerNavigation: PAGE_HEADER_NAVIGATION } : {};
}

/**
 * Binds `@jini-ai/cms/posts/post-tool-views`' deps from a {@link PostToolDeps}: this host's routing
 * instance's `entryPublicPath`, the runtime mode (`routeDeps.runtimeMode` when a test passes a fake,
 * else `resolveRuntimeMode()` — `TOVU_RUNTIME_MODE`), and this product's `publishedWhere` copy.
 * @complexity O(1).
 */
export function postToolViewDeps({ routeDeps }: { routeDeps: PostToolDeps }, _optional = {}): PostToolViewDeps {
  return {
    workspaceId: routeDeps.workspaceId,
    entryPublicPath,
    runtimeMode: routeDeps.runtimeMode ?? resolveRuntimeMode,
    publishedWhere: { live: PUBLISHED_WHERE_LIVE, local: PUBLISHED_WHERE_LOCAL },
  };
}
