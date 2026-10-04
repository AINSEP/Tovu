import type { PostRepoPort } from "#src/features/post/index";
import { entryPublicPath } from "#src/platform/routing/routing";
import { isAllowedHref } from "@jini-ai/cms/navigation";
import type { ResolveTargetHrefFn } from "./index.js";

/** The host's page/entry records share the post repository. Resolve their stable ids at render
 * time so renames follow the slug and unpublished/trashed targets are unavailable. */
export function createMenuPageTargetResolver(
  { postRepo }: { postRepo: PostRepoPort },
  _optional = {},
): ResolveTargetHrefFn {
  return async ({ target, context }) => {
    if (target.kind !== "entryRef") return null;
    const post = await postRepo.findById({ workspaceId: context.workspaceId, id: target.entryId });
    if (post) {
      const resolved = entryPublicPath(post, { workspaceId: context.workspaceId });
      // A known unpublished/trashed record is unavailable, even with a URL snapshot. A
      // routing miss is different: exports may carry refs whose ids do not exist at the destination.
      return resolved ? { path: resolved.path, available: true } : { path: "", available: false };
    }
    // Installed package declarations predate the JSON field; tolerate that release without
    // changing package versions or copying the generic href allowlist into the host.
    const lastKnownHref = (target as typeof target & { lastKnownHref?: unknown }).lastKnownHref;
    return typeof lastKnownHref === "string" && lastKnownHref.trim() && isAllowedHref({ rawHref: lastKnownHref })
      ? { path: lastKnownHref, available: true } : null;
  };
}
