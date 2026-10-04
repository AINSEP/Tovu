import type { PostRepoPort } from "#src/features/post/index";
import { urlFor } from "#src/platform/routing/routing";
import type { ResolveTargetHrefFn } from "./index.js";

/** The host's page/entry records share the post repository. Resolve their stable ids at render
 * time so renames follow the slug and unpublished/trashed targets are unavailable. */
export function createMenuPageTargetResolver(
  { postRepo }: { postRepo: PostRepoPort },
  _optional = {},
): ResolveTargetHrefFn {
  return async ({ target, context }) => {
    if (target.kind !== "entryRef") return null;
    const resolved = await urlFor({ deps: { postRepo }, target: { kind: "entryRef", entryId: target.entryId }, ctx: { workspaceId: context.workspaceId } });
    return resolved ? { path: resolved.path, available: true } : null;
  };
}
