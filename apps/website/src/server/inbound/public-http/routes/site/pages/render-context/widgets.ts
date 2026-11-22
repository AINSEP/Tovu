import type { SiteChatSelection } from "../../../../http/site/site-chat-markup.js";
import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import type { Request } from "express";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { createPublicPostReader } from "#src/features/post/post-read";
// Page readiness reads must not load the assistant tool/runtime barrel.
import { getPublicAssistantSettings } from "#src/assistant/public-assistant-settings";
import { resolvePublicAssistantAvailability } from "#src/assistant/public-assistant-availability";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { resolveHtmlPageEmbeds, type ResolveHtmlPageEmbedsResult } from "@jini-ai/cms/widgets/html";
import { resolvePageWidgets, type ResolvePageWidgetsResult } from "@jini-ai/cms/widgets";
import type { RouteDeps } from "#src/server/routes/types";
import type { RenderContextResolutionDeps } from "./deps.js";
import { htmlEmbedHostDeps } from "./site-title.js";
import { isStaticExportRequest } from "../request-policy.js";

/**
 * ADR-054's visitor-chat switch, resolved for ONE incoming request rather than for a workspace in
 * the abstract. Every one of this file's and `products.ts`'s four render handlers used to call
 * `isPublicAssistantEnabled` directly; collapsed here (2026-09-27) so the static-export carve-out
 * below has exactly one place to live instead of four.
 *
 * Owner decision: a static export/static-publish ships no `/api/site-assistant/chat` endpoint for
 * the bubble to call, so it must never ship the bubble's markup either — a broken FAB on a static
 * host is worse than no FAB. `exportSite`'s own crawl (`site-exporter.ts`'s `exportFetch`) marks
 * every request it makes with {@link STATIC_EXPORT_REQUEST_HEADER}; seeing that header here
 * short-circuits straight to `false`, BEFORE the real `site.assistant.public_enabled` setting is
 * even read, so the live site (which never sends this header) is completely unaffected and keeps
 * showing the widget exactly as the workspace setting says.
 *
 * Resolves the site's widget choice once for all render branches. Saved key/model readiness is
 * checked per request so stale flags and later credential removal cannot emit a broken bubble;
 * exports still ship no widget.
 */
export async function resolveSiteAssistantWidgetForRequest({ request, deps }: {
  request: Pick<Request, "header">; deps: RouteDeps;
}, _options = {}): Promise<SiteChatSelection> {
  if (isStaticExportRequest(request)) return false;
  await deps.assistantSettingsReady;
  const settings = await getPublicAssistantSettings(
    { settingsRepo: deps.settingsRepo, getEffective: deps.getEffective }, { workspaceId: deps.workspaceId }
  );
  if (!settings.publicEnabled) return false;
  const availability = await resolvePublicAssistantAvailability({
    repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer, workspaceId: deps.workspaceId,
  });
  return availability.ready ? settings.widget : false;
}

/**
 * SPEC-043/ADR-047 W-004 — resolves every widget placed in one of `theme.manifest.regions` (REQ-13)
 * ahead of `renderSite`, per REQ-23, PLUS (2026-08-05 fix) any inline `widgetEmbed` node in `post`'s
 * own `bodyJson` when rendering a real post. `render.ts` stays a pure "resolved data -> HTML"
 * renderer (it receives `posts`/`post` pre-resolved the exact same way); this is the one call site,
 * mirroring the outline's Wiring Map row W-004. `resolvePageWidgets` itself never throws (REQ-27) —
 * no extra try/catch needed beyond the route handler's own existing one.
 *
 * Was previously always omitted: `resolvePageWidgets` took a `pageEntryId` to fetch via
 * `EntryRepoPort.findById`, but `PostRecord` (`features/post`) is a separate, pre-ADR-022 table no
 * `entries` lookup can ever resolve, so no real caller ever supplied one and every `widgetEmbed`
 * node authored into a post's body rendered the REQ-28 placeholder forever (implementation-outline-
 * addendum.md Finding 1b). Fixed by having `resolvePageWidgets` accept the already-fetched
 * `post.bodyJson` directly (`pageBodyJson`) instead of an id to re-fetch — this route already holds
 * `post` by the time it calls this, so no extra lookup is needed either way.
 */
export async function resolveWidgetsForRender({ deps, theme }: { deps: RenderContextResolutionDeps; /* `null` when the operator turned the theme off. Region-bound widgets are declared BY a theme, so with no theme there are no regions to resolve into — the same empty-region answer a theme that declares none already gets. Inline (`widgetEmbed`) widgets are unaffected: they live in the post body, not in a theme region, and are resolved from `pageBodyJson` below either way. */ theme: DiscoveredTheme | null }, { post }: { post?: PostRecord } = {}): Promise<ResolvePageWidgetsResult> {
  return resolvePageWidgets({
    deps: { bindingRepo: deps.widgetBindingRepo, entryRepo: deps.entryRepo },
    input: { workspaceId: deps.workspaceId, pageBodyJson: post?.bodyJson, resolvedRegions: theme?.manifest.regions ?? [] },
  });
}

/**
 * SPEC-047 Slice 2 — resolves an `"html"`-format Page's `data-embed-type`
 * placeholders ahead of `renderSite`, mirroring `resolveWidgetsForRender`'s own "route resolves,
 * `render.ts` stays I/O-free" split immediately above. `undefined` for a `"doc"` post (nothing to
 * resolve — `renderSite`'s `pageHtmlEmbeds` param is optional for exactly this case) so this is a
 * no-op call on every route/render that isn't an html Page.
 *
 * `postRepo` is threaded through (2026-08-11) so a `"doc"`-format `content` reference authored
 * directly inside a Page's own freeform body (e.g. "see this related page") resolves here too, not
 * only within a template render — the visibility-filtered `content`/`post` resolvers
 * (`resolver-service.ts`) degrade to the REQ-28 placeholder without it, same as `media` already does
 * without `mediaRepo`. Deliberately NOT extended to also run the `renderViaTemplate`-only recursive
 * `"html"`-format pre-splice (`pages.ts`'s `resolveHtmlFormatContentMarkers`) — that needs both
 * `resolveHtmlPageEmbeds` and `render.ts`'s `renderHtmlPageBody` interleaved across recursive calls,
 * which this function's single-pass shape does not do; a nested `"html"`-format `content` reference
 * from a non-templated Page's own body is a disclosed, out-of-scope gap for this pass, not silently
 * unhandled — it degrades to the same honest placeholder any other unresolved reference gets.
 */
export async function resolveHtmlEmbedsForRender({ deps, post }: { deps: RenderContextResolutionDeps; post: PostRecord | undefined }, _optional = {}): Promise<ResolveHtmlPageEmbedsResult | undefined> {
  if (!post || post.bodyFormat !== "html") return undefined;
  return resolveHtmlPageEmbeds({
    deps: { host: buildWidgetHostPorts({ postRepo: deps.postRepo }, {}),
      entryRepo: deps.entryRepo,
      mediaRepo: deps.mediaRepo,
      transformRepo: deps.transformDefinitionRepo,
      postRepo: createPublicPostReader({ repo: deps.postRepo }),
      mediaContentTypeStore: deps.mediaContentTypeStore,
      taxonomyRepo: deps.taxonomyRepo,
      termRepo: deps.termRepo,
      ...htmlEmbedHostDeps(deps),
    },
    // The same unmodified body `render.ts`'s `renderPostBody` renders (trusted page HTML, see there).
    input: { workspaceId: deps.workspaceId, html: post.bodyHtml ?? "" },
  });
}
