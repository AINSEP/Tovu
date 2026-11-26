import { PAGES_EDIT_HTML_PERMISSION } from "#src/features/pages/permissions";
import { registerPageHtmlReverter } from "@jini-ai/cms/pages/html-reverter";
import { memoryTrashCoreDeps, memoryTrashRemoverDeps, memoryTrashSweepDeps, memoryPostChatDeps, memorySettingsSeoDeps } from "./trash-and-content.js";
import { memoryAssistantCredentialDeps, memoryMcpOAuthDeps, memoryReadinessRevertDeps, memorySiteBindingDeps } from "./assistant-and-site.js";
import { memoryMemberMediaDeps, memoryNewsletterFormsDeps } from "./members-media-newsletter-forms.js";
import { memoryContentModelDeps, memoryCommentsPluginDeps } from "./model-comments-plugins.js";
import { memoryPublishExportDeps, memoryDeployRegistryDeps, memoryClientsAndSiteContextDeps } from "./publish-export.js";
import type { MemoryRootContext } from "./context.js";

/**
 * The in-memory root's `routeDeps` literal as ordered, contiguous runs. Key order is the literal's own, and a later
 * spread may override an earlier key only because the runs are spread in the order they always had.
 */
export function assembleMemoryRouteDeps(required: MemoryRootContext, _optional = {}) {
  const deps = {
    ...memoryTrashCoreDeps(required),
    ...memoryTrashRemoverDeps(required),
    ...memoryTrashSweepDeps(required),
    ...memoryPostChatDeps(required),
    ...memorySettingsSeoDeps(required),
    ...memoryAssistantCredentialDeps(required),
    ...memoryMcpOAuthDeps(required),
    ...memoryReadinessRevertDeps(required),
    ...memorySiteBindingDeps(required),
    ...memoryMemberMediaDeps(required),
    ...memoryNewsletterFormsDeps(required),
    ...memoryContentModelDeps(required),
    ...memoryCommentsPluginDeps(required),
    ...memoryPublishExportDeps(required),
    ...memoryDeployRegistryDeps(required),
    ...memoryClientsAndSiteContextDeps(required),
  };
  // P1-T2.T: same page-store factory as the assistant write path, once registry and factory both exist.
  registerPageHtmlReverter({ editPermission: PAGES_EDIT_HTML_PERMISSION, registry: deps.revertRegistry, store: deps.pagesHtmlStore, postRepo: deps.postRepo });
  return deps;
}
