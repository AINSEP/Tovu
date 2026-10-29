import { mediaAgentToolCatalog } from "@jini-ai/cms/media";
import { ToolInputError } from "@jini-ai/core";
import { applyContentTargetInputs } from "#src/assistant/content-target-inputs";
import { currentToolIdFor } from "#src/assistant/content-read-tool";
import type { AssistantToolContributions } from "#src/assistant/tool-registrations";
import { getAdminPostByIdOrSlug, PostNotFoundError } from "#src/features/post/index";
import { postAgentToolCatalog } from "#src/features/post/agent-tools";
import { postPreviewAgentToolCatalog } from "#src/features/post/preview-tool";
import { pagesAgentToolCatalog } from "#src/features/pages/agent-tools";
import { mediaViewImageAgentToolCatalog } from "#src/features/media/view-image-tool";
import { catalog as videoCatalog } from "#src/features/media/view-video-tool";
import { mediaImportAgentToolCatalog } from "#src/features/media-import/agent-tools";
import { permanentDeleteAgentToolCatalog } from "#src/features/permanent-delete/agent-tools";
import { getSeoAgentToolCatalog } from "#src/features/seo/agent-tools";

/** Bind the one assistant adapter to existing CMS owners and their declared permissions.
 * Peers pass their own dependencies through this same binding, never the active site's repos.
 * @complexity O(t) catalog/registration work; at most two indexed post lookups per invocation.
 */
export function bindContentTargetInputs(
  { registrations, routeDeps, beforeLookup }: Parameters<NonNullable<AssistantToolContributions["contentTargetInputs"]>>[0], _options = {},
) {
  const permissions = new Map([...postAgentToolCatalog, ...postPreviewAgentToolCatalog, ...pagesAgentToolCatalog,
    ...mediaAgentToolCatalog, ...mediaViewImageAgentToolCatalog, ...videoCatalog, ...mediaImportAgentToolCatalog, ...permanentDeleteAgentToolCatalog, ...getSeoAgentToolCatalog()]
    .flatMap(tool => [[tool.name, tool.authorization.permission] as const, [currentToolIdFor(tool.name), tool.authorization.permission] as const]));
  return applyContentTargetInputs({ registrations, deps: {
    workspaceId: routeDeps.workspaceId, authorize: routeDeps.authorize, mediaRepo: routeDeps.mediaRepo, beforeLookup,
    permissionFor: ({ toolId }) => {
      const permission = permissions.get(toolId);
      if (!permission) throw new ToolInputError({ message: `${toolId}: target permission is unavailable.` });
      return permission;
    },
    resolvePost: async ({ selector }) => {
      try {
        const { post } = await getAdminPostByIdOrSlug({ deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId, idOrSlug: selector } });
        return post.id;
      } catch (error) {
        // Preserve the domain's own not-found reply, including Pages' stable error code.
        if (error instanceof PostNotFoundError) return selector;
        throw error;
      }
    },
  } });
}
