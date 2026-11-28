import { buildPostRegistrations as build } from "@jini-ai/cms/posts/tool-registrations";
import { postDerivedRisk } from "@jini-ai/cms/posts/post-tool-policy";
import type { PostToolDeps as Deps } from "@jini-ai/cms/posts/post-tool-deps";
import type { ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import type { PostTemplateDeps } from "./template-options.js";
import { POST_TOOL_HOST } from "./post-tool-policy.js";

export type PostToolDeps = Omit<Deps, "reservedSegments" | "postPublicPath" | "isDeepStrictEqual" | "copyBodyJsonWithFreshEmbedPlacements" | "contentPostReadToolId" | "contentReadPermission" | "contentWritePermission" | "assistantActorPluginId" | "catalog" | "executeCommand" | "processOutbox" | "withPluginHookRefusals" | "postToolViewDeps" | "headerNavigationView" | "readPostTemplateOptions" | "findMediaByIdOrSlug" | "featuredImageRefusals"> & PostTemplateDeps;

export const buildPostRegistrations = (routeDeps: PostToolDeps, surfaces: AssistantSurfaceDeps) =>
  build({ ...routeDeps, ...POST_TOOL_HOST }, surfaces);

export const contributePostTools = (_required = {}, _optional = {}): ToolContributor<PostToolDeps, AssistantSurfaceDeps> =>
  ({ domain: "post", build: buildPostRegistrations, risk: postDerivedRisk });
